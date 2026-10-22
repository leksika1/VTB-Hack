"""
События «данные семьи изменились» для синхронизации устройств без перезагрузки.

Поток: запрос, изменивший данные → publish(family_id) → Redis PUBLISH family:<id>
→ в каждом экземпляре бэкенда один общий подписчик (PSUBSCRIBE family:*) раздаёт событие
локальным SSE-подключениям этой семьи → фронтенд перечитывает GET /api/state.

В событии нет данных — только факт изменения и кто его сделал, поэтому утечь через него нечему.
"""
import asyncio
import json
import logging
import time
from collections import defaultdict

from .infra import get_redis

log = logging.getLogger("app.realtime")

CHANNEL_PREFIX = "family:"

_subscribers: dict[str, set[asyncio.Queue]] = defaultdict(set)
_listener: asyncio.Task | None = None


def _dispatch(family_id: str, event: dict) -> None:
    for queue in list(_subscribers.get(family_id, ())):
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            pass  # клиент не успевает читать — он всё равно перечитает состояние целиком


async def publish(family_id: str, event: dict) -> None:
    try:
        await get_redis().publish(CHANNEL_PREFIX + family_id, json.dumps(event))
    except Exception:  # событие — подсказка, а не источник истины; запрос пользователя не должен падать
        log.exception("publish failed")


# ── Ограничение открытых потоков на участника (общее для всех экземпляров) ──
# Каждый поток — запись в sorted set streams:<member> со сроком годности; поток продлевает её
# с каждым ping. Если экземпляр упал, не закрыв потоки, записи сами истекут через STREAM_TTL.
STREAM_TTL = 60

_ACQUIRE = """
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[4])
redis.call('EXPIRE', KEYS[1], ARGV[5])
return 1
"""


def _streams_key(member_id: str) -> str:
    return f"streams:{member_id}"


async def acquire_stream(member_id: str, stream_id: str, limit: int) -> bool:
    """False — у участника уже limit открытых потоков: один токен не должен держать тысячи соединений."""
    now = time.time()
    try:
        return bool(await get_redis().eval(
            _ACQUIRE, 1, _streams_key(member_id), now, now + STREAM_TTL, limit, stream_id, STREAM_TTL
        ))
    except Exception:
        log.exception("stream limit check failed")
        return True


async def refresh_stream(member_id: str, stream_id: str) -> None:
    try:
        await get_redis().zadd(_streams_key(member_id), {stream_id: time.time() + STREAM_TTL}, xx=True)
    except Exception:
        log.exception("stream refresh failed")


async def release_stream(member_id: str, stream_id: str) -> None:
    try:
        await get_redis().zrem(_streams_key(member_id), stream_id)
    except Exception:
        log.exception("stream release failed")


def subscribe(family_id: str) -> asyncio.Queue:
    queue: asyncio.Queue = asyncio.Queue(maxsize=100)
    _subscribers[family_id].add(queue)
    return queue


def unsubscribe(family_id: str, queue: asyncio.Queue) -> None:
    subs = _subscribers.get(family_id)
    if subs is not None:
        subs.discard(queue)
        if not subs:
            _subscribers.pop(family_id, None)


async def _listen() -> None:
    redis = get_redis()
    while True:
        try:
            async with redis.pubsub() as pubsub:
                await pubsub.psubscribe(CHANNEL_PREFIX + "*")
                async for message in pubsub.listen():
                    if message["type"] != "pmessage":
                        continue
                    family_id = message["channel"][len(CHANNEL_PREFIX):]
                    _dispatch(family_id, json.loads(message["data"]))
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("redis listener failed, reconnecting")
            await asyncio.sleep(1)


def start_listener() -> None:
    global _listener
    if _listener is None:
        _listener = asyncio.create_task(_listen(), name="realtime-listener")


async def stop_listener() -> None:
    global _listener
    if _listener is not None:
        _listener.cancel()
        try:
            await _listener
        except asyncio.CancelledError:
            pass
        _listener = None
