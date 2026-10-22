"""
Повторяющиеся платежи (docs/FEATURES.md §6). Серия — платежи с одним series_id, по одному на месяц
(уникальный индекс series_id + series_month). Сервер держит платежи серии на текущий и следующий месяц.
Вставка с ON CONFLICT DO NOTHING: несколько копий backend и фоновая задача не создают дублей.
"""
import calendar
from datetime import date

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from .. import clock
from ..models import Payment, new_id, now_ms
from ..validation import shift_month

MAX_MONTHS_PER_RUN = 12  # если серию давно не продлевали — не создаём сотни платежей разом


def _due_in_month(day: int, month_key: str) -> date:
    year, month = map(int, month_key.split("-"))
    return date(year, month, min(day, calendar.monthrange(year, month)[1]))


async def start_series(db: AsyncSession, payment: Payment) -> None:
    payment.recurring = True
    payment.series_id = payment.series_id or payment.id
    payment.series_month = payment.due_date.strftime("%Y-%m")
    await db.flush()
    await ensure_series(db, payment.series_id)


async def stop_series(db: AsyncSession, series_id: str) -> None:
    await db.execute(update(Payment).where(Payment.series_id == series_id).values(recurring=False))


async def ensure_series(db: AsyncSession, series_id: str) -> int:
    """Создать недостающие платежи серии до следующего месяца включительно. Возвращает, сколько создано."""
    latest = await db.scalar(
        select(Payment).where(Payment.series_id == series_id).order_by(Payment.series_month.desc()).limit(1)
    )
    if latest is None or not latest.recurring:
        return 0
    first = await db.scalar(
        select(Payment).where(Payment.series_id == series_id).order_by(Payment.series_month).limit(1)
    )
    target = shift_month(clock.current_month_key(), 1)
    month, created = latest.series_month, 0
    for _ in range(MAX_MONTHS_PER_RUN):
        month = shift_month(month, 1)
        if month > target:
            break
        result = await db.execute(
            insert(Payment).values(
                id=new_id(), family_id=latest.family_id, title=latest.title, amount_kop=latest.amount_kop,
                category=latest.category, due_date=_due_in_month(first.due_date.day, month), status="upcoming",
                author_id=latest.author_id, created_at=now_ms(), recurring=True, series_id=series_id,
                series_month=month,
            ).on_conflict_do_nothing(constraint="uq_payments_series_month")
        )
        created += result.rowcount
    return created


async def ensure_all(db: AsyncSession) -> int:
    """Фоновая задача: продлить все активные серии."""
    rows = await db.execute(
        select(Payment.series_id, func.max(Payment.series_month))
        .where(Payment.series_id.is_not(None))
        .group_by(Payment.series_id)
    )
    target = shift_month(clock.current_month_key(), 1)
    created = 0
    for series_id, latest_month in rows.all():
        if latest_month < target:
            created += await ensure_series(db, series_id)
    return created
