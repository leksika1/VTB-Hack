from typing import Annotated

from fastapi import Depends, Header, Request
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .db import get_db
from .errors import Unauthorized
from .models import Member, MemberSession, now_ms
from .ratelimit import check_member_limit
from .security import hash_token

Db = Annotated[AsyncSession, Depends(get_db)]
# 16+ символов: короткий ключ легко угадать
IdempotencyKey = Annotated[str | None, Header(alias="Idempotency-Key", min_length=16, max_length=100)]
Authorization = Annotated[str | None, Header()]

DAY_MS = 86_400_000
# last_seen_at обновляется не чаще раза в час, чтобы не писать в базу на каждый запрос
_TOUCH_EVERY_MS = 3_600_000


async def resolve_member(db: AsyncSession, authorization: str | None) -> Member:
    """Участник по токену из Authorization: Bearer <token>. Закрывает сессию, неактивную дольше SESSION_TTL_DAYS."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise Unauthorized()
    session = await db.get(MemberSession, hash_token(authorization[7:].strip()))
    if session is None:
        raise Unauthorized()

    now = now_ms()
    if now - session.last_seen_at > get_settings().session_ttl_days * DAY_MS:
        await db.execute(delete(MemberSession).where(MemberSession.token_hash == session.token_hash))
        await db.commit()
        raise Unauthorized()

    member = await db.get(Member, session.member_id)
    if member is None or not member.active:
        raise Unauthorized()

    if now - session.last_seen_at > _TOUCH_EVERY_MS:
        session.last_seen_at = now
        await db.commit()
    return member


async def current_member(request: Request, db: Db, authorization: Authorization = None) -> Member:
    member = await resolve_member(db, authorization)
    # Для журнала и события «данные изменились» (middleware.py)
    request.state.family_id = member.family_id
    request.state.member_id = member.id
    await check_member_limit(member.id, write=request.method != "GET")
    return member


CurrentMember = Annotated[Member, Depends(current_member)]


def mark_silent(request: Request) -> None:
    """POST без изменения данных (проверка покупки, смена участника демо) — событие не рассылаем."""
    request.state.silent = True
