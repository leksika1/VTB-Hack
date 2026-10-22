"""Прогноз месяца и расчёты между взрослыми (docs/FEATURES.md §5, §7)."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import clock
from ..domain.forecast import Forecast, compute_forecast
from ..domain.settlement import compute_balances, transfers
from ..errors import Forbidden, NotFound, ValidationFailed
from ..models import Budget, Expense, Member, Settlement
from ..schemas import (
    RecordedSettlementOut,
    SettlementIn,
    SettlementMemberOut,
    SettlementOut,
    TransferOut,
)
from ..validation import amount_to_kop, check_month_key, kop_to_amount
from . import families, finance


async def forecast(db: AsyncSession, family_id: str, month_key: str) -> Forecast:
    check_month_key(month_key, "month")
    budget = await db.get(Budget, (family_id, month_key))
    expenses = await finance.list_expenses(db, family_id, month_key)
    payments = await finance.list_payments(db, family_id, month_key)
    return compute_forecast(month_key, clock.today(), budget, expenses, payments)


async def _participants(db: AsyncSession, family_id: str, expenses: list[Expense]) -> list[Member]:
    """Текущие взрослые + вышедшие взрослые, если они платили в этом месяце; по порядку вступления."""
    family = await families.load_family(db, family_id)
    payers = {e.paid_by for e in expenses}
    return [m for m in family.members if m.is_parent and (m.active or m.id in payers)]


async def settlement(db: AsyncSession, family_id: str, month_key: str) -> SettlementOut:
    check_month_key(month_key, "month")
    expenses = await finance.list_expenses(db, family_id, month_key)
    people = await _participants(db, family_id, expenses)
    ids = [m.id for m in people]
    paid: dict[str, int] = {}
    for e in expenses:
        if e.paid_by in ids:  # траты ребёнка из карманных не делятся
            paid[e.paid_by] = paid.get(e.paid_by, 0) + e.amount_kop
    recorded = list(await db.scalars(
        select(Settlement).where(Settlement.family_id == family_id, Settlement.month_key == month_key)
        .order_by(Settlement.created_at)
    ))
    balances = compute_balances(ids, paid, [(s.from_id, s.to_id, s.amount_kop) for s in recorded])
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
    adults = {m.id for m in family.members if m.active and m.is_parent}
    if body.from_id not in adults:
        raise ValidationFailed("Участник не найден", "fromId")
    if body.to_id not in adults:
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
    if record.created_by != member.id:
        raise Forbidden("Удалить отметку может только тот, кто её сделал")
    await db.delete(record)
    await db.flush()
