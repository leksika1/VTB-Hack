"""Серверный расчёт общего счёта, взносов и суммы к пополнению."""
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import clock
from ..domain.settlement import split_evenly
from ..models import AccountContribution, Expense, Member, Payment
from ..schemas import AccountContributionOut, AccountMemberOut, AccountSummaryOut
from ..validation import amount_to_kop, check_month_key, kop_to_amount, month_bounds
from .finance import check_capacity


async def list_contributions(db: AsyncSession, family_id: str) -> list[AccountContribution]:
    return list(await db.scalars(select(AccountContribution).where(
        AccountContribution.family_id == family_id
    ).order_by(AccountContribution.created_at.desc(), AccountContribution.id)))


async def add_contribution(db: AsyncSession, member: Member, amount: float) -> AccountContribution:
    await check_capacity(db, AccountContribution, member.family_id)
    contribution = AccountContribution(family_id=member.family_id, member_id=member.id,
                                       amount_kop=amount_to_kop(amount), date=clock.today())
    db.add(contribution)
    await db.flush()
    return contribution


def _shared(expense: Expense) -> bool:
    return expense.source == "shared" or expense.account_mode in {"shared_split", "shared_common"}


def expense_shares(expense: Expense) -> dict[str, int]:
    mode = expense.split_mode
    if mode == "none" and expense.account_mode in {"shared_split", "personal_split"}:
        mode = "shares" if expense.split_percentages else "equal"
    if mode == "none":
        return {}
    members = expense.split_members or list((expense.split_shares or expense.split_percentages or {}).keys())
    if mode == "equal":
        return split_evenly(expense.amount_kop, members)
    weights = expense.split_shares or ({k: v * 100 for k, v in (expense.split_percentages or {}).items()})
    if not weights:
        return {}
    denominator = sum(weights.values())
    portions = {member_id: divmod(expense.amount_kop * weight, denominator)
                for member_id, weight in weights.items()}
    result = {member_id: value for member_id, (value, _) in portions.items()}
    missing = expense.amount_kop - sum(result.values())
    ranked = sorted(portions, key=lambda member_id: (-portions[member_id][1], members.index(member_id)))
    for member_id in ranked[:missing]:
        result[member_id] += 1
    return result


async def balance_at(db: AsyncSession, family_id: str, cutoff: date) -> int:
    contributions = list(await db.scalars(select(AccountContribution).where(
        AccountContribution.family_id == family_id, AccountContribution.date <= cutoff)))
    expenses = list(await db.scalars(select(Expense).where(
        Expense.family_id == family_id, Expense.date <= cutoff)))
    return sum(row.amount_kop for row in contributions) - sum(row.amount_kop for row in expenses if _shared(row))


async def summary(db: AsyncSession, family_id: str, month_key: str) -> AccountSummaryOut:
    check_month_key(month_key, "month")
    start, end = month_bounds(month_key)
    today = clock.today()
    current = today.strftime("%Y-%m")
    cutoff = date.fromordinal(end.toordinal() - 1) if month_key < current else today

    active = list(await db.scalars(select(Member).where(
        Member.family_id == family_id, Member.left_at.is_(None), Member.status == "active"
    ).order_by(Member.joined_at, Member.id)))
    contributions = list(await db.scalars(select(AccountContribution).where(
        AccountContribution.family_id == family_id, AccountContribution.date >= start,
        AccountContribution.date < end, AccountContribution.date <= cutoff,
    ).order_by(AccountContribution.created_at.desc(), AccountContribution.id)))
    expenses = list(await db.scalars(select(Expense).where(
        Expense.family_id == family_id, Expense.date >= start, Expense.date < end, Expense.date <= cutoff)))
    payments = list(await db.scalars(select(Payment).where(
        Payment.family_id == family_id, Payment.due_date >= start, Payment.due_date < end,
        Payment.status == "upcoming")))

    values = {member.id: {"share": 0, "contributed": 0, "paid": 0} for member in active}
    for row in contributions:
        if row.member_id in values:
            values[row.member_id]["contributed"] += row.amount_kop
    for expense in expenses:
        shares = expense_shares(expense)
        for member_id, amount in shares.items():
            if member_id in values:
                values[member_id]["share"] += amount
        if shares and (expense.source == "personal" or expense.account_mode == "personal_split") \
                and expense.paid_by in values:
            values[expense.paid_by]["paid"] += expense.amount_kop

    total_share = sum(v["share"] for v in values.values())
    total_contributed = sum(v["contributed"] for v in values.values())
    members = []
    for member in active:
        value = values[member.id]
        net = value["contributed"] + value["paid"] - value["share"]
        due, overpaid = max(-net, 0), max(net, 0)
        members.append(AccountMemberOut(
            member_id=member.id, name=member.name, share=kop_to_amount(value["share"]),
            contributed=kop_to_amount(value["contributed"]), paid_personally=kop_to_amount(value["paid"]),
            due=kop_to_amount(due), top_up_suggestion=kop_to_amount(due), overpaid=kop_to_amount(overpaid),
            share_percent=value["share"] * 100 / total_share if total_share else 0,
            contribution_percent=value["contributed"] * 100 / total_contributed if total_contributed else 0,
            status="owes" if due else "overpaid" if overpaid else "even",
        ))
    balance = await balance_at(db, family_id, cutoff)
    planned = sum(payment.amount_kop for payment in payments if payment.source == "shared")
    return AccountSummaryOut(
        month_key=month_key, balance=kop_to_amount(balance), planned=kop_to_amount(planned),
        after_planned=kop_to_amount(balance - planned), members=members,
        contributions=[AccountContributionOut.of(row) for row in contributions],
    )
