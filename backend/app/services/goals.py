"""Цели-копилки семьи (docs/FEATURES.md §4)."""
import math
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import clock
from ..errors import Conflict, Forbidden, NotFound, ValidationFailed
from ..models import Goal, GoalContribution, Member, now_ms
from ..schemas import ContributionIn, ContributionOut, GoalIn, GoalOut
from ..validation import amount_to_kop, kop_to_amount, month_bounds, parse_date, shift_month
from . import allowance, notifications

MAX_ACTIVE_GOALS = 20
ETA_WINDOW_MONTHS = 3


def _months_between(start: date, end: date) -> int:
    return (end.year - start.year) * 12 + end.month - start.month


async def _saved(db: AsyncSession, goal_id: str) -> int:
    return int(await db.scalar(
        select(func.coalesce(func.sum(GoalContribution.amount_kop), 0)).where(GoalContribution.goal_id == goal_id)
    ))


async def to_out(db: AsyncSession, goal: Goal) -> GoalOut:
    saved = await _saved(db, goal.id)
    left = max(goal.target_kop - saved, 0)
    today = clock.today()

    monthly_needed = None
    if goal.deadline and goal.status == "active" and left > 0:
        months = max(_months_between(today, goal.deadline) + 1, 1)
        monthly_needed = math.ceil(left / months)

    eta = None
    if goal.status == "active" and left > 0:
        # Средний взнос в месяц за последние 3 месяца (или с первого взноса, если он позже)
        window_start, _ = month_bounds(shift_month(clock.current_month_key(), -(ETA_WINDOW_MONTHS - 1)))
        first = await db.scalar(select(func.min(GoalContribution.date)).where(GoalContribution.goal_id == goal.id))
        if first:
            start = max(first.replace(day=1), window_start)
            recent = int(await db.scalar(
                select(func.coalesce(func.sum(GoalContribution.amount_kop), 0)).where(
                    GoalContribution.goal_id == goal.id, GoalContribution.date >= start
                )
            ))
            months = _months_between(start, today) + 1
            per_month = recent / months
            if per_month > 0:
                eta = shift_month(clock.current_month_key(), math.ceil(left / per_month) - 1)

    return GoalOut(
        id=goal.id, family_id=goal.family_id, title=goal.title, target=kop_to_amount(goal.target_kop),
        deadline=goal.deadline.isoformat() if goal.deadline else None, status=goal.status,
        saved=kop_to_amount(saved), left=kop_to_amount(left),
        percent=min(100, saved * 100 // goal.target_kop),
        monthly_needed=kop_to_amount(monthly_needed) if monthly_needed is not None else None,
        eta_month=eta, created_by=goal.created_by, created_at=goal.created_at, achieved_at=goal.achieved_at,
    )


def _clean(body: GoalIn) -> tuple[str, int, date | None]:
    title = (body.title or "").strip()
    if not title:
        raise ValidationFailed("Укажите название цели", "title")
    if len(title) > 80:
        raise ValidationFailed("Название длиннее 80 символов", "title")
    deadline = parse_date(body.deadline, "deadline") if body.deadline else None
    if deadline and deadline < clock.today():
        raise ValidationFailed("Срок не может быть в прошлом", "deadline")
    return title, amount_to_kop(body.target, "target"), deadline


async def _goal(db: AsyncSession, member: Member, goal_id: str, lock: bool = False) -> Goal:
    goal = await db.get(Goal, goal_id, with_for_update=lock, populate_existing=lock)
    if goal is None or goal.family_id != member.family_id:
        raise NotFound("Цель не найдена")
    return goal


async def _refresh_status(db: AsyncSession, goal: Goal) -> bool:
    """Пересчитать active/achieved по накопленному. True — цель только что достигнута."""
    if goal.status == "archived":
        return False
    saved = await _saved(db, goal.id)
    if saved >= goal.target_kop and goal.status == "active":
        goal.status, goal.achieved_at = "achieved", now_ms()
        return True
    if saved < goal.target_kop and goal.status == "achieved":
        goal.status, goal.achieved_at = "active", None
    return False


async def list_goals(db: AsyncSession, member: Member) -> list[GoalOut]:
    goals = await db.scalars(select(Goal).where(Goal.family_id == member.family_id).order_by(Goal.created_at.desc()))
    items = [await to_out(db, g) for g in goals]
    return sorted(items, key=lambda g: g.status == "archived")


async def create_goal(db: AsyncSession, member: Member, body: GoalIn) -> Goal:
    title, target, deadline = _clean(body)
    active = await db.scalar(
        select(func.count()).select_from(Goal).where(Goal.family_id == member.family_id, Goal.status != "archived")
    )
    if active >= MAX_ACTIVE_GOALS:
        raise Conflict(f"Не больше {MAX_ACTIVE_GOALS} целей одновременно. Архивируйте достигнутые.")
    goal = Goal(family_id=member.family_id, title=title, target_kop=target, deadline=deadline, created_by=member.id)
    db.add(goal)
    await db.flush()
    return goal


async def update_goal(db: AsyncSession, member: Member, goal_id: str, body: GoalIn) -> Goal:
    goal = await _goal(db, member, goal_id, lock=True)
    goal.title, goal.target_kop, goal.deadline = _clean(body)
    await _refresh_status(db, goal)
    await db.flush()
    return goal


async def archive_goal(db: AsyncSession, member: Member, goal_id: str) -> Goal:
    goal = await _goal(db, member, goal_id, lock=True)
    goal.status = "archived"
    await db.flush()
    return goal


async def delete_goal(db: AsyncSession, member: Member, goal_id: str) -> None:
    goal = await _goal(db, member, goal_id, lock=True)
    if await _saved(db, goal.id) or await db.scalar(select(GoalContribution.id).where(GoalContribution.goal_id == goal.id)):
        raise Conflict("У цели есть взносы — её можно только архивировать")
    await db.delete(goal)
    await db.flush()


async def list_contributions(db: AsyncSession, member: Member, goal_id: str) -> list[ContributionOut]:
    goal = await _goal(db, member, goal_id)
    rows = await db.scalars(
        select(GoalContribution).where(GoalContribution.goal_id == goal.id)
        .order_by(GoalContribution.date.desc(), GoalContribution.created_at.desc())
    )
    return [ContributionOut.of(c) for c in rows]


async def contribute(db: AsyncSession, member: Member, goal_id: str, body: ContributionIn) -> tuple[Goal, GoalContribution, bool]:
    # Блокировка цели: статус «достигнута» считается по сумме взносов, параллельные взносы — по очереди
    goal = await _goal(db, member, goal_id, lock=True)
    if goal.status == "archived":
        raise ValidationFailed("Цель в архиве — вносить в неё нельзя")
    amount = amount_to_kop(body.amount)
    on = parse_date(body.date) if body.date else clock.today()
    if on > clock.today():
        raise ValidationFailed("Дата взноса не может быть в будущем", "date")
    if not member.is_parent:
        await allowance.check_child_spending(db, member, amount, on)
    contribution = GoalContribution(goal_id=goal.id, family_id=goal.family_id, member_id=member.id,
                                    amount_kop=amount, date=on)
    db.add(contribution)
    await db.flush()
    achieved = await _refresh_status(db, goal)
    await db.flush()
    if achieved:
        await notifications.notify(db, goal.family_id, await notifications.everyone(db, goal.family_id),
                                   "goal_achieved", f"Цель «{goal.title}» накоплена!", "Поздравляем всю семью",
                                   {"goalId": goal.id}, dedupe_key=f"goal_achieved:{goal.id}:{goal.achieved_at}")
    return goal, contribution, achieved


async def delete_contribution(db: AsyncSession, member: Member, goal_id: str, contribution_id: str) -> Goal:
    goal = await _goal(db, member, goal_id, lock=True)
    contribution = await db.get(GoalContribution, contribution_id)
    if contribution is None or contribution.goal_id != goal.id:
        raise NotFound("Взнос не найден")
    if contribution.member_id != member.id:
        raise Forbidden("Удалить можно только свой взнос")
    await db.delete(contribution)
    await db.flush()
    await _refresh_status(db, goal)
    await db.flush()
    return goal


async def saved_in_month(db: AsyncSession, family_id: str, month_key: str) -> int:
    start, end = month_bounds(month_key)
    return int(await db.scalar(
        select(func.coalesce(func.sum(GoalContribution.amount_kop), 0)).where(
            GoalContribution.family_id == family_id, GoalContribution.date >= start, GoalContribution.date < end
        )
    ))
