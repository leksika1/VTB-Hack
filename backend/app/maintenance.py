"""
Фоновые задачи: очистка (старые ответы идемпотентности, просроченные сессии, демо-семьи)
и продление повторяющихся платежей.
Запросы идемпотентны, поэтому несколько реплик могут выполнять их одновременно без блокировок.
"""
import asyncio
import logging

from sqlalchemy import delete

from . import db
from .config import get_settings
from .models import Family, IdempotencyRecord, MemberSession, Notification, StatementImport, now_ms

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
            "notifications": (await session.execute(
                delete(Notification).where(
                    Notification.created_at < now - settings.notification_ttl_days * 24 * HOUR_MS
                )
            )).rowcount,
            "stale_imports": (await session.execute(
                delete(StatementImport).where(
                    StatementImport.status == "pending", StatementImport.created_at < now - 7 * 24 * HOUR_MS
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


async def extend_recurring_once(session_factory=None) -> int:
    """Продлить серии повторяющихся платежей до следующего месяца (docs/FEATURES.md §6)."""
    from .services import recurring

    async with (session_factory or db.session)() as session:
        created = await recurring.ensure_all(session)
        await session.commit()
    return created


async def payment_reminders_once(session_factory=None) -> int:
    """Уведомления о платежах со сроком сегодня–через 2 дня (повторы отбрасываются по dedupe_key)."""
    from .services import notifications

    async with (session_factory or db.session)() as session:
        created = await notifications.payments_due(session)
        await session.commit()
    return created


async def send_emails_periodically(interval: int) -> None:
    from .services import notifications

    while True:
        try:
            async with db.session() as session:
                await notifications.send_pending(session)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("email sending failed")
        await asyncio.sleep(interval)


async def run_periodically(interval: int) -> None:
    while True:
        try:
            removed = await cleanup_once()
            removed["recurring_created"] = await extend_recurring_once()
            removed["payment_reminders"] = await payment_reminders_once()
            if any(removed.values()):
                log.info("maintenance", extra={"extra_fields": removed})
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("cleanup failed")
        await asyncio.sleep(interval)
