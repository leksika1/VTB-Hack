"""Аналитика, календарь и совместимые расчёты месяца."""
import calendar as month_calendar
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import clock
from ..domain.forecast import Forecast, compute_forecast
from ..domain.settlement import compute_balances, split_evenly, transfers
from ..errors import NotFound, ValidationFailed
from ..models import Budget, Expense, Member, Payment, Settlement
from ..schemas import (
    AnalyticsCategoryOut,
    AnalyticsMonthOut,
    AnalyticsOut,
    CalendarDayOut,
    CalendarOut,
    ExpenseOut,
    PaymentOut,
    RecordedSettlementOut,
    SettlementIn,
    SettlementMemberOut,
    SettlementOut,
    TransferOut,
)
from ..validation import amount_to_kop, check_month_key, kop_to_amount, month_bounds, shift_month
from . import account, families, finance


async def analytics(db: AsyncSession, family_id: str, month_key: str, months: int) -> AnalyticsOut:
    check_month_key(month_key, "month")
    keys = [shift_month(month_key, offset) for offset in range(-(months - 1), 1)]
    series: list[AnalyticsMonthOut] = []
    previous = None
    today = clock.today()
    for key in keys:
        start, end = month_bounds(key)
        total = int(await db.scalar(select(func.coalesce(func.sum(Expense.amount_kop), 0)).where(
            Expense.family_id == family_id, Expense.date >= start, Expense.date < end)))
        cutoff = min(today, date.fromordinal(end.toordinal() - 1))
        balance = await account.balance_at(db, family_id, cutoff)
        change = None if previous in (None, 0) else (total - previous) * 100 / previous
        series.append(AnalyticsMonthOut(month=key, expenses=kop_to_amount(total),
                                        account_balance=kop_to_amount(balance), expense_change_percent=change))
        previous = total

    start, end = month_bounds(month_key)
    rows = (await db.execute(select(Expense.category, func.sum(Expense.amount_kop)).where(
        Expense.family_id == family_id, Expense.date >= start, Expense.date < end
    ).group_by(Expense.category))).all()
    total = sum(value for _, value in rows)
    categories = sorted([
        AnalyticsCategoryOut(category=category, amount=kop_to_amount(value),
                             percent=value * 100 / total if total else 0)
        for category, value in rows
    ], key=lambda item: item.amount, reverse=True)
    return AnalyticsOut(month=month_key, series=series, categories=categories,
                        top_categories=categories[:5], account=await account.summary(db, family_id, month_key),
                        payments=[PaymentOut.of(p) for p in await finance.list_payments(db, family_id, month_key)])


async def calendar(db: AsyncSession, family_id: str, month_key: str) -> CalendarOut:
    check_month_key(month_key, "month")
    start, end = month_bounds(month_key)
    today = clock.today()
    expenses = await finance.list_expenses(db, family_id, month_key)
    month_payments = await finance.list_payments(db, family_id, month_key)
    projected = list(await db.scalars(select(Payment).where(
        Payment.family_id == family_id, Payment.status == "upcoming", Payment.source == "shared",
        Payment.due_date < end,
    ).order_by(Payment.due_date)))
    current_balance = await account.balance_at(db, family_id, today)
    days = []
    for day_number in range(1, month_calendar.monthrange(start.year, start.month)[1] + 1):
        on = date(start.year, start.month, day_number)
        day_expenses = [row for row in expenses if row.date == on]
        day_payments = [row for row in month_payments if row.due_date == on]
        if on < today:
            balance = await account.balance_at(db, family_id, on)
        else:
            planned = sum(row.amount_kop for row in projected if max(row.due_date, today) <= on)
            balance = current_balance - planned
        days.append(CalendarDayOut(
            date=on.isoformat(), expenses=[ExpenseOut.of(row) for row in day_expenses],
            expense_total=kop_to_amount(sum(row.amount_kop for row in day_expenses)),
            payments=[PaymentOut.of(row) for row in day_payments], account_balance=kop_to_amount(balance),
        ))
    upcoming = [row for row in projected if row.status == "upcoming"
                and start <= max(row.due_date, today) < end]
    return CalendarOut(month=month_key, days=days, upcoming_payments=[PaymentOut.of(row) for row in upcoming])


async def forecast(db: AsyncSession, family_id: str, month_key: str) -> Forecast:
    check_month_key(month_key, "month")
    budget = await db.get(Budget, (family_id, month_key))
    expenses = await finance.list_expenses(db, family_id, month_key)
    payments = await finance.list_payments(db, family_id, month_key)
    return compute_forecast(month_key, clock.today(), budget, expenses, payments)


async def _participants(db: AsyncSession, family_id: str, expenses: list[Expense]) -> list[Member]:
    """Текущие участники + вышедшие, если они платили в этом месяце."""
    family = await families.load_family(db, family_id)
    participants = {e.paid_by for e in expenses}
    for expense in expenses:
        participants.update(expense.split_members or [])
    return [m for m in family.members if m.active or m.id in participants]


async def settlement(db: AsyncSession, family_id: str, month_key: str) -> SettlementOut:
    check_month_key(month_key, "month")
    expenses = [expense for expense in await finance.list_expenses(db, family_id, month_key)
                if expense.account_mode in {None, "personal_split"}]
    people = await _participants(db, family_id, expenses)
    ids = [m.id for m in people]
    paid: dict[str, int] = {}
    shares: dict[str, int] = {}
    legacy_total = 0
    for e in expenses:
        if e.paid_by in ids:
            paid[e.paid_by] = paid.get(e.paid_by, 0) + e.amount_kop
            if e.account_mode is None or not e.split_members:
                legacy_total += e.amount_kop
                continue
            allocation = account.expense_shares(e)
            for member_id, amount in allocation.items():
                shares[member_id] = shares.get(member_id, 0) + amount
    for member_id, amount in split_evenly(legacy_total, ids).items():
        shares[member_id] = shares.get(member_id, 0) + amount
    recorded = list(await db.scalars(
        select(Settlement).where(Settlement.family_id == family_id, Settlement.month_key == month_key)
        .order_by(Settlement.created_at)
    ))
    balances = compute_balances(ids, paid, [(s.from_id, s.to_id, s.amount_kop) for s in recorded], shares)
    names = {m.id: m.name for m in people}
    return SettlementOut(
        month_key=month_key,
        shared_total=kop_to_amount(sum(paid.values())),
        members=[
            SettlementMemberOut(
                member_id=b.member_id, name=names[b.member_id], paid=kop_to_amount(b.paid),
                share=kop_to_amount(b.share), sent=kop_to_amount(b.sent), received=kop_to_amount(b.received),
                balance=kop_to_amount(b.balance),
            )
            for b in balances
        ],
        transfers=[TransferOut(from_id=f, to_id=t, amount=kop_to_amount(a)) for f, t, a in transfers(balances)],
        recorded=[
            RecordedSettlementOut(id=s.id, from_id=s.from_id, to_id=s.to_id, amount=kop_to_amount(s.amount_kop),
                                  created_by=s.created_by, created_at=s.created_at)
            for s in recorded
        ],
    )


async def record_settlement(db: AsyncSession, member: Member, month_key: str, body: SettlementIn) -> None:
    check_month_key(month_key, "month")
    family = await families.load_family(db, member.family_id)
    participants = {m.id for m in family.members if m.active}
    if body.from_id not in participants:
        raise ValidationFailed("Участник не найден", "fromId")
    if body.to_id not in participants:
        raise ValidationFailed("Участник не найден", "toId")
    if body.from_id == body.to_id:
        raise ValidationFailed("Нельзя перевести самому себе", "toId")
    db.add(Settlement(family_id=member.family_id, month_key=month_key, from_id=body.from_id, to_id=body.to_id,
                      amount_kop=amount_to_kop(body.amount), created_by=member.id))
    await db.flush()


async def delete_settlement(db: AsyncSession, member: Member, month_key: str, settlement_id: str) -> None:
    record = await db.get(Settlement, settlement_id)
    if record is None or record.family_id != member.family_id or record.month_key != month_key:
        raise NotFound("Отметка не найдена")
    await db.delete(record)
    await db.flush()
