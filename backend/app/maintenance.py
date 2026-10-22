"""
Фоновая очистка: старые ответы идемпотентности, просроченные сессии, демо-семьи.
Запросы идемпотентны, поэтому несколько реплик могут выполнять их одновременно без блокировок.
"""
import asyncio
import logging

from sqlalchemy import delete

from . import db
from .config import get_settings
from .models import Family, IdempotencyRecord, MemberSession, now_ms

log = logging.getLogger("app.maintenance")

HOUR_MS = 3_600_000


async def cleanup_once(session_factory=None) -> dict[str, int]:
    settings = get_settings()
    now = now_ms()
    async with (session_factory or db.session)() as session:
        removed = {
            "idempotency": (await session.execute(
                delete(IdempotencyRecord).where(
                    IdempotencyRecord.created_at < now - settings.idempotency_ttl_hours * HOUR_MS
                )
            )).rowcount,
            "sessions": (await session.execute(
                delete(MemberSession).where(
                    MemberSession.last_seen_at < now - settings.session_ttl_days * 24 * HOUR_MS
                )
            )).rowcount,
            "demo_families": (await session.execute(
                delete(Family).where(
                    Family.is_demo.is_(True), Family.created_at < now - settings.demo_ttl_hours * HOUR_MS
                )
            )).rowcount,
        }
        await session.commit()
    return removed


async def run_periodically(interval: int) -> None:
    while True:
        try:
            removed = await cleanup_once()
            if any(removed.values()):
                log.info("cleanup", extra={"extra_fields": removed})
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("cleanup failed")
        await asyncio.sleep(interval)
