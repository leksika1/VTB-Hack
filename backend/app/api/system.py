import asyncio
import json
import uuid

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.background import BackgroundTask

from .. import db, realtime
from ..config import get_settings
from ..deps import Authorization, resolve_member
from ..errors import TooManyRequests
from ..ratelimit import check_member_limit
from ..infra import get_redis

router = APIRouter()


@router.get("/health", tags=["system"], summary="Процесс жив (liveness)")
async def health():
    return {"status": "ok", "service": "backend"}


@router.get("/ready", tags=["system"], summary="Готов принимать трафик: доступны БД и Redis (readiness)")
async def ready():
    checks: dict[str, str] = {}
    try:
        await db.ping()
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "down"
    try:
        await get_redis().ping()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "down"
    ok = "down" not in checks.values()
    return JSONResponse({"status": "ok" if ok else "degraded", "checks": checks}, status_code=200 if ok else 503)


@router.get(
    "/events",
    tags=["system"],
    summary="Поток событий семьи (Server-Sent Events)",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/event-stream": {}}}},
)
async def events(request: Request, authorization: Authorization = None):
    """
    Держит соединение и присылает `event: changed` каждый раз, когда кто-то из семьи изменил данные.
    Клиент в ответ перечитывает `GET /api/state`. Раз в EVENTS_HEARTBEAT_SECONDS приходит комментарий `: ping`.
    """
    # Своя короткая сессия: соединение с БД не держится всё время, пока открыт поток
    async with db.session() as session:
        member = await resolve_member(session, authorization)
    family_id, member_id = member.family_id, member.id
    await check_member_limit(member_id, write=False)
    settings = get_settings()
    stream_id = uuid.uuid4().hex
    if not await realtime.acquire_stream(member_id, stream_id, settings.max_streams_per_member):
        raise TooManyRequests("Слишком много открытых вкладок. Закройте лишние и обновите страницу.")
    # Ping чаще, чем истекает запись о потоке, — живой поток не потеряет своё место
    heartbeat = min(settings.events_heartbeat_seconds, realtime.STREAM_TTL // 3)
    queue = realtime.subscribe(family_id)
    cleanup: asyncio.Future | None = None

    async def _cleanup() -> None:
        realtime.unsubscribe(family_id, queue)
        await realtime.release_stream(member_id, stream_id)

    async def release() -> None:
        # Вызывается и из генератора, и фоновой задачей ответа (если клиент ушёл до первого сообщения,
        # генератор не запустится). Очистка — отдельная задача под shield: при обрыве соединения Starlette
        # отменяет генератор, и без этого удаление слота в Redis прерывалось бы на полпути,
        # а повторный вызов считал бы, что всё уже сделано, — слот висел до истечения STREAM_TTL
        nonlocal cleanup
        if cleanup is None:
            cleanup = asyncio.ensure_future(_cleanup())
        await asyncio.shield(cleanup)

    async def stream():
        try:
            yield f"event: ready\ndata: {json.dumps({'memberId': member_id})}\n\n"
            while not await request.is_disconnected():
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=heartbeat)
                except TimeoutError:
                    await realtime.refresh_stream(member_id, stream_id)
                    yield ": ping\n\n"
                    continue
                yield f"event: {event['type']}\ndata: {json.dumps(event)}\n\n"
        finally:
            await release()

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        background=BackgroundTask(release),
    )
