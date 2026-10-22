"""Цели-копилки, прогноз месяца, расчёты между взрослыми (docs/FEATURES.md §4, §5, §7)."""
from fastapi import APIRouter, Response

from ..deps import CurrentMember, Db, IdempotencyKey, ParentMember
from ..schemas import (
    CategoryForecastOut,
    ContributionIn,
    ContributionOut,
    ContributionResultOut,
    ForecastOut,
    GoalIn,
    GoalOut,
    SettlementIn,
    SettlementOut,
)
from ..services import goals, idempotency, insights
from ..validation import kop_to_amount

router = APIRouter()


def _dump(model) -> dict:
    return model.model_dump(mode="json", by_alias=True)


# ── Цели ──


@router.get("/goals", response_model=list[GoalOut], tags=["goals"], summary="Цели семьи с прогрессом и прогнозом")
async def list_goals(member: CurrentMember, db: Db):
    return await goals.list_goals(db, member)


@router.post("/goals", response_model=GoalOut, status_code=201, tags=["goals"])
async def create_goal(body: GoalIn, member: ParentMember, db: Db, idem: IdempotencyKey = None):
    async def action():
        return _dump(await goals.to_out(db, await goals.create_goal(db, member, body)))

    return await idempotency.run(db, member.id, idem, idempotency.fingerprint("POST goal", _dump(body)), action)


async def _goal_out(db, goal) -> GoalOut:
    out = await goals.to_out(db, goal)
    await db.commit()
    return out


@router.put("/goals/{goal_id}", response_model=GoalOut, tags=["goals"])
async def update_goal(goal_id: str, body: GoalIn, member: ParentMember, db: Db):
    return await _goal_out(db, await goals.update_goal(db, member, goal_id, body))


@router.post("/goals/{goal_id}/archive", response_model=GoalOut, tags=["goals"])
async def archive_goal(goal_id: str, member: ParentMember, db: Db):
    return await _goal_out(db, await goals.archive_goal(db, member, goal_id))


@router.delete("/goals/{goal_id}", status_code=204, tags=["goals"], summary="Удалить цель без взносов")
async def delete_goal(goal_id: str, member: ParentMember, db: Db):
    await goals.delete_goal(db, member, goal_id)
    await db.commit()
    return Response(status_code=204)


@router.get("/goals/{goal_id}/contributions", response_model=list[ContributionOut], tags=["goals"])
async def list_contributions(goal_id: str, member: CurrentMember, db: Db):
    return await goals.list_contributions(db, member, goal_id)


@router.post("/goals/{goal_id}/contributions", response_model=ContributionResultOut, status_code=201, tags=["goals"],
             summary="Внести в цель (ребёнок — из карманных денег)")
async def contribute(goal_id: str, body: ContributionIn, member: CurrentMember, db: Db, idem: IdempotencyKey = None):
    async def action():
        goal, contribution, _ = await goals.contribute(db, member, goal_id, body)
        return _dump(ContributionResultOut(goal=await goals.to_out(db, goal), contribution=ContributionOut.of(contribution)))

    fp = idempotency.fingerprint("POST contribution", goal_id, _dump(body))
    return await idempotency.run(db, member.id, idem, fp, action)


@router.delete("/goals/{goal_id}/contributions/{contribution_id}", response_model=GoalOut, tags=["goals"])
async def delete_contribution(goal_id: str, contribution_id: str, member: CurrentMember, db: Db):
    return await _goal_out(db, await goals.delete_contribution(db, member, goal_id, contribution_id))


# ── Прогноз ──


@router.get("/months/{month_key}/forecast", response_model=ForecastOut, tags=["summary"],
            summary="Прогноз трат на конец месяца")
async def month_forecast(month_key: str, member: ParentMember, db: Db):
    f = await insights.forecast(db, member.family_id, month_key)
    rub = kop_to_amount
    return ForecastOut(
        month_key=f.month_key, kind=f.kind, plan=rub(f.plan), spent=rub(f.spent), reserved=rub(f.reserved),
        variable_spent=rub(f.variable_spent), daily_average=rub(f.daily_average), days_passed=f.days_passed,
        days_in_month=f.days_in_month, projected_spent=rub(f.projected_spent), projected_left=rub(f.projected_left),
        low_confidence=f.low_confidence,
        categories=[CategoryForecastOut(key=c.key, plan=rub(c.plan), spent=rub(c.spent), projected=rub(c.projected),
                                        status=c.status) for c in f.categories],
    )


# ── Расчёты между взрослыми ──


@router.get("/months/{month_key}/settlement", response_model=SettlementOut, tags=["summary"],
            summary="Кто сколько заплатил и кто кому должен за месяц")
async def month_settlement(month_key: str, member: ParentMember, db: Db):
    return await insights.settlement(db, member.family_id, month_key)


@router.post("/months/{month_key}/settlements", response_model=SettlementOut, status_code=201, tags=["summary"],
             summary="Отметить перевод в счёт долга")
async def record_settlement(month_key: str, body: SettlementIn, member: ParentMember, db: Db):
    await insights.record_settlement(db, member, month_key, body)
    await db.commit()
    return await insights.settlement(db, member.family_id, month_key)


@router.delete("/months/{month_key}/settlements/{settlement_id}", response_model=SettlementOut, tags=["summary"])
async def delete_settlement(month_key: str, settlement_id: str, member: ParentMember, db: Db):
    await insights.delete_settlement(db, member, month_key, settlement_id)
    await db.commit()
    return await insights.settlement(db, member.family_id, month_key)
