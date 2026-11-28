"""Цели, произвольные серии платежей и совместимый прогноз."""
import asyncio
from datetime import timedelta

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.clock import today
from app.db import make_engine
from app.maintenance import extend_recurring_once
from tests.conftest import run_sql

from .helpers import MONTH, TODAY, add_expense, add_payment, assert_error, create_family, join, key, set_budget


def create_goal(member, title="Отпуск", target=10_000, deadline=None):
    response = member.post("/api/goals", {"title": title, "target": target, "deadline": deadline})
    assert response.status_code == 201, response.text
    return response.json()


def test_every_member_manages_goals_and_contributions(api, new_client):
    owner = create_family(api)
    member = join(new_client(), owner, "Борис")
    deadline = (today() + timedelta(days=60)).isoformat()
    goal = create_goal(member, deadline=deadline)
    first = owner.post(f"/api/goals/{goal['id']}/contributions", {"amount": 4_000}, idem=key())
    assert first.status_code == 201 and first.json()["accountContribution"]["amount"] == 4_000
    second = member.post(f"/api/goals/{goal['id']}/contributions", {"amount": 6_000})
    assert second.json()["goal"]["status"] == "achieved"
    rows = owner.get(f"/api/goals/{goal['id']}/contributions").json()
    # Любой участник может исправить семейную запись.
    assert member.delete(f"/api/goals/{goal['id']}/contributions/{rows[0]['id']}").status_code == 200
    assert_error(owner.delete(f"/api/goals/{goal['id']}"), 409)
    assert owner.post(f"/api/goals/{goal['id']}/archive").json()["status"] == "archived"


def test_goal_validation_and_idempotency(api):
    owner = create_family(api)
    assert_error(owner.post("/api/goals", {"title": "", "target": 1}), 422, field="title")
    assert_error(owner.post("/api/goals", {"title": "x", "target": 0}), 422, field="target")
    goal = create_goal(owner)
    tomorrow = (today() + timedelta(days=1)).isoformat()
    assert_error(owner.post(f"/api/goals/{goal['id']}/contributions",
                            {"amount": 10, "date": tomorrow}), 422, field="date")
    idem = key()
    path = f"/api/goals/{goal['id']}/contributions"
    assert owner.post(path, {"amount": 700}, idem=idem).json() == owner.post(path, {"amount": 700}, idem=idem).json()


def _payment(member, **patch):
    body = {
        "title": "Абонемент", "amount": 1_000, "category": "other", "dueDate": "2026-01-31",
        "paymentMethod": "manual", "paymentDetails": {
            "recipient": "Сервис", "method": "uin", "uin": "18810000000000000000", "purpose": "Абонемент",
        },
    }
    body.update(patch)
    response = member.post("/api/payments", body)
    assert response.status_code == 201, response.text
    return response.json(), body


def test_recurrence_periods_end_count_and_rule_edit(api):
    owner = create_family(api)
    payment, body = _payment(owner, recurrence="monthly", endMode="count", occurrences=2)
    rows = owner.get("/api/payments").json()
    assert [row["dueDate"] for row in rows] == ["2026-01-31", "2026-02-28"]
    assert all(row["seriesId"] == payment["id"] for row in rows)
    changed = owner.put(f"/api/payments/{payment['id']}", {
        **body, "recurrence": "custom", "interval": 10, "intervalUnit": "days",
        "endMode": "count", "occurrences": 3,
    })
    assert changed.status_code == 200
    assert [row["dueDate"] for row in owner.get("/api/payments").json()] == ["2026-01-31", "2026-02-10"]


def test_recurring_background_job_is_idempotent(api, needs_db):
    owner = create_family(api)
    payment, _ = _payment(owner, dueDate=TODAY, recurrence="weekly")
    run_sql(needs_db, "DELETE FROM payments WHERE series_id = $1 AND series_sequence > 1", payment["id"])

    async def run():
        engine = make_engine(needs_db)
        try:
            factory = async_sessionmaker(engine, expire_on_commit=False)
            return await extend_recurring_once(factory), await extend_recurring_once(factory)
        finally:
            await engine.dispose()

    first, second = asyncio.run(run())
    assert first >= 1 and second == 0


def test_forecast_remains_available_to_every_member(api, new_client):
    owner = create_family(api)
    member = join(new_client(), owner)
    set_budget(owner, 10_000, {"food": 1_000})
    add_expense(owner, 900, "food")
    add_payment(owner, 2_000, "housing")
    forecast = member.get(f"/api/months/{MONTH}/forecast").json()
    assert (forecast["reserved"], forecast["spent"]) == (2_000, 900)
