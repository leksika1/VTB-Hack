"""Идемпотентное создание следующих вхождений платёжных серий."""
import calendar
from datetime import date, timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from .. import clock
from ..models import Payment, new_id, now_ms

MAX_OCCURRENCES_PER_RUN = 64


def _add_months(value: date, months: int) -> date:
    index = value.year * 12 + value.month - 1 + months
    year, month0 = divmod(index, 12)
    month = month0 + 1
    return date(year, month, min(value.day, calendar.monthrange(year, month)[1]))


def next_due(value: date, rule: dict) -> date:
    frequency = rule.get("frequency", "monthly")
    interval = max(int(rule.get("interval", 1)), 1)
    if frequency == "weekly":
        return value + timedelta(weeks=interval)
    if frequency == "monthly":
        return _add_months(value, interval)
    if frequency == "quarterly":
        return _add_months(value, 3 * interval)
    if frequency == "yearly":
        return _add_months(value, 12 * interval)
    if frequency == "custom":
        unit = rule.get("unit")
        if unit == "days":
            return value + timedelta(days=interval)
        if unit == "weeks":
            return value + timedelta(weeks=interval)
        if unit == "months":
            return _add_months(value, interval)
    raise ValueError("Неподдерживаемая периодичность")


def _allowed(next_date: date, next_sequence: int, rule: dict) -> bool:
    mode = rule.get("endMode", "never")
    if mode == "date":
        return bool(rule.get("endDate")) and next_date <= date.fromisoformat(rule["endDate"])
    if mode == "count":
        return next_sequence <= int(rule.get("occurrences") or 0)
    return True


async def start_series(db: AsyncSession, payment: Payment, rule: dict | None = None) -> None:
    payment.recurring = True
    payment.series_id = payment.series_id or payment.id
    payment.series_month = payment.due_date.strftime("%Y-%m")
    payment.series_sequence = payment.series_sequence or 1
    payment.recurrence_rule = rule or {"frequency": "monthly", "interval": 1, "endMode": "never"}
    await db.flush()
    await ensure_next(db, payment)


async def stop_series(db: AsyncSession, payment: Payment) -> None:
    if payment.series_id is None:
        return
    if payment.series_sequence is not None:
        await db.execute(delete(Payment).where(
            Payment.series_id == payment.series_id, Payment.series_sequence > payment.series_sequence,
            Payment.status == "upcoming",
        ))
    else:
        await db.execute(delete(Payment).where(
            Payment.series_id == payment.series_id, Payment.due_date > payment.due_date,
            Payment.status == "upcoming",
        ))
    await db.execute(update(Payment).where(Payment.series_id == payment.series_id)
                     .values(recurring=False, recurrence_rule=None))


async def replace_future(db: AsyncSession, payment: Payment) -> None:
    """Удалить ещё не наступившие вхождения после смены календарного правила и построить первое заново."""
    order = Payment.series_sequence > payment.series_sequence if payment.series_sequence is not None \
        else Payment.due_date > payment.due_date
    await db.execute(delete(Payment).where(
        Payment.series_id == payment.series_id, order, Payment.status == "upcoming",
    ))
    await ensure_next(db, payment)


async def update_future(db: AsyncSession, payment: Payment) -> None:
    """Распространить редактируемые параметры на ещё не оплаченные вхождения серии."""
    order = Payment.series_sequence > payment.series_sequence if payment.series_sequence is not None \
        else Payment.due_date > payment.due_date
    await db.execute(update(Payment).where(
        Payment.series_id == payment.series_id, order, Payment.status == "upcoming",
    ).values(
        title=payment.title, amount_kop=payment.amount_kop, category=payment.category,
        recurring=payment.recurring, recurrence_rule=payment.recurrence_rule,
        account_mode=payment.account_mode, source=payment.source, split_mode=payment.split_mode,
        split_members=payment.split_members, split_shares=payment.split_shares,
        amount_mode=payment.amount_mode, payment_method=payment.payment_method,
        autopay_type=payment.autopay_type, provider_category=payment.provider_category,
        provider_name=payment.provider_name, provider_identifier=payment.provider_identifier,
        limit_amount_kop=payment.limit_amount_kop, payment_details=payment.payment_details,
    ))


async def ensure_next(db: AsyncSession, payment: Payment) -> int:
    """Создать ровно следующее вхождение, если серия ещё не закончилась."""
    if not payment.recurring or not payment.series_id or not payment.recurrence_rule:
        return 0
    next_date = next_due(payment.due_date, payment.recurrence_rule)
    sequence = (payment.series_sequence or 1) + 1
    if not _allowed(next_date, sequence, payment.recurrence_rule):
        return 0
    result = await db.execute(insert(Payment).values(
        id=new_id(), family_id=payment.family_id, title=payment.title, amount_kop=payment.amount_kop,
        category=payment.category, due_date=next_date, status="upcoming", author_id=payment.author_id,
        created_at=now_ms(), recurring=True, series_id=payment.series_id,
        series_month=next_date.strftime("%Y-%m"), series_sequence=sequence,
        recurrence_rule=payment.recurrence_rule, account_mode=payment.account_mode, source=payment.source,
        split_mode=payment.split_mode, split_members=payment.split_members, split_shares=payment.split_shares,
        amount_mode=payment.amount_mode, payment_method=payment.payment_method,
        autopay_type=payment.autopay_type, provider_category=payment.provider_category,
        provider_name=payment.provider_name, provider_identifier=payment.provider_identifier,
        limit_amount_kop=payment.limit_amount_kop, payment_details=payment.payment_details,
    ).on_conflict_do_nothing(constraint="uq_payments_series_due"))
    return result.rowcount


async def ensure_series(db: AsyncSession, series_id: str) -> int:
    latest = await db.scalar(select(Payment).where(Payment.series_id == series_id)
                             .order_by(Payment.due_date.desc()).limit(1))
    if latest is None:
        return 0
    horizon = _add_months(clock.today(), 1)
    created = 0
    for _ in range(MAX_OCCURRENCES_PER_RUN):
        if latest.due_date > horizon:
            break
        made = await ensure_next(db, latest)
        if not made:
            break
        created += made
        latest = await db.scalar(select(Payment).where(Payment.series_id == series_id)
                                 .order_by(Payment.due_date.desc()).limit(1))
    return created


async def ensure_all(db: AsyncSession) -> int:
    series_ids = list(await db.scalars(select(Payment.series_id).where(
        Payment.series_id.is_not(None), Payment.recurring.is_(True)).distinct()))
    created = 0
    for series_id in series_ids:
        created += await ensure_series(db, series_id)
    return created
