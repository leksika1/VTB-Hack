"""Карманные деньги ребёнка — лимит трат на период (docs/FEATURES.md §2)."""
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import clock
from ..errors import Forbidden, NotFound, ValidationFailed
from ..models import Allowance, Expense, GoalContribution, Member
from ..schemas import AllowanceIn, AllowanceOut
from ..validation import amount_to_kop, kop_to_amount
from . import notifications

PERIODS = ("week", "month")


def period_bounds(period: str, today: date) -> tuple[date, date]:
    """Неделя пн–вс или календарный месяц, содержащие today; конец включительно."""
    if period == "week":
        start = today - timedelta(days=today.weekday())
        return start, start + timedelta(days=6)
    start = today.replace(day=1)
    next_month = (start + timedelta(days=32)).replace(day=1)
    return start, next_month - timedelta(days=1)


def format_rub(kop: int) -> str:
    rub, k = divmod(abs(kop), 100)
    text = f"{rub:,}".replace(",", " ")
    return (f"{text},{k:02d}" if k else text) + " ₽"


async def spent_in_period(
    db: AsyncSession, member_id: str, start: date, end: date, exclude_expense_id: str | None = None
) -> int:
    """Траты ребёнка из карманных: свои расходы (кроме одобренных запросов) + взносы в цели."""
    q = select(func.coalesce(func.sum(Expense.amount_kop), 0)).where(
        Expense.author_id == member_id,
        Expense.request_id.is_(None),
        Expense.date >= start,
        Expense.date <= end,
    )
    if exclude_expense_id:
        q = q.where(Expense.id != exclude_expense_id)
    expenses = await db.scalar(q)
    contributions = await db.scalar(
        select(func.coalesce(func.sum(GoalContribution.amount_kop), 0)).where(
            GoalContribution.member_id == member_id,
            GoalContribution.date >= start,
            GoalContribution.date <= end,
        )
    )
    return int(expenses) + int(contributions)


async def to_out(db: AsyncSession, allowance: Allowance) -> AllowanceOut:
    start, end = period_bounds(allowance.period, clock.today())
    spent = await spent_in_period(db, allowance.member_id, start, end)
    return AllowanceOut(
        member_id=allowance.member_id,
        amount=kop_to_amount(allowance.amount_kop),
        period=allowance.period,
        period_start=start.isoformat(),
        period_end=end.isoformat(),
        spent=kop_to_amount(spent),
        left=kop_to_amount(allowance.amount_kop - spent),
        updated_at=allowance.updated_at,
    )


async def _child(db: AsyncSession, actor: Member, member_id: str) -> Member:
    target = await db.get(Member, member_id)
    if target is None or target.family_id != actor.family_id or not target.active:
        raise NotFound("Участник не найден")
    if target.is_parent:
        raise ValidationFailed("Карманные деньги назначаются только детям")
    return target


async def set_allowance(db: AsyncSession, actor: Member, member_id: str, body: AllowanceIn) -> AllowanceOut:
    child = await _child(db, actor, member_id)
    if body.period not in PERIODS:
        raise ValidationFailed("Период: week или month", "period")
    amount = amount_to_kop(body.amount)
    allowance = await db.get(Allowance, child.id)
    if allowance is None:
        allowance = Allowance(member_id=child.id, family_id=child.family_id)
        db.add(allowance)
    allowance.amount_kop = amount
    allowance.period = body.period
    allowance.updated_by = actor.id
    await db.flush()
    await db.refresh(allowance)
    out = await to_out(db, allowance)
    period = "в неделю" if allowance.period == "week" else "в месяц"
    await notifications.notify(db, child.family_id, [child], "allowance_changed", "Карманные деньги обновлены",
                               f"{format_rub(allowance.amount_kop)} {period}", {"memberId": child.id})
    return out


async def delete_allowance(db: AsyncSession, actor: Member, member_id: str) -> None:
    child = await _child(db, actor, member_id)
    allowance = await db.get(Allowance, child.id)
    if allowance is not None:
        await db.delete(allowance)
    await db.commit()


async def list_allowances(db: AsyncSession, member: Member) -> list[AllowanceOut]:
    """Взрослому — по всем детям семьи, ребёнку — только свои."""
    q = select(Allowance).join(Member, Member.id == Allowance.member_id).where(
        Allowance.family_id == member.family_id, Member.left_at.is_(None)
    )
    if not member.is_parent:
        q = q.where(Allowance.member_id == member.id)
    return [await to_out(db, a) for a in await db.scalars(q.order_by(Member.joined_at))]


async def check_child_spending(
    db: AsyncSession, child: Member, amount_kop: int, on: date, field: str = "amount",
    exclude_expense_id: str | None = None,
) -> None:
    """Можно ли ребёнку потратить amount_kop с датой on. Строка лимита блокируется — две траты
    одновременно не превысят остаток."""
    allowance = await db.get(Allowance, child.id, with_for_update=True, populate_existing=True)
    if allowance is None:
        raise Forbidden("Карманные деньги не назначены — отправьте запрос на покупку")
    today = clock.today()
    start, end = period_bounds(allowance.period, today)
    if not (start <= on <= today):
        raise ValidationFailed("Трату из карманных денег можно записать только за текущий период", "date")
    used = await spent_in_period(db, child.id, start, end, exclude_expense_id)
    left = allowance.amount_kop - used
    if amount_kop > left:
        raise ValidationFailed(
            f"Не хватает карманных денег: осталось {format_rub(max(left, 0))}. Отправьте запрос на покупку", field
        )
