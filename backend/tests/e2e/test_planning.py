"""Цели-копилки, повторяющиеся платежи, прогноз, расчёты между взрослыми (docs/FEATURES.md §4–7)."""
import asyncio
from datetime import timedelta

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.clock import today
from app.db import make_engine
from app.maintenance import extend_recurring_once
from app.validation import shift_month
from tests.conftest import run_sql

from .helpers import (
    MONTH,
    TODAY,
    add_child,
    add_expense,
    add_payment,
    assert_error,
    create_family,
    join,
    key,
    set_allowance,
    set_budget,
    summary,
)

NEXT = shift_month(MONTH, 1)


def create_goal(m, title="Отпуск", target=10000, deadline=None):
    r = m.post("/api/goals", {"title": title, "target": target, "deadline": deadline})
    assert r.status_code == 201, r.text
    return r.json()


def contribute(m, goal, amount, on=None):
    return m.post(f"/api/goals/{goal['id']}/contributions", {"amount": amount, "date": on})


# ── Цели ──


def test_goal_lifecycle(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna.invite_code)
    deadline = (today() + timedelta(days=60)).isoformat()
    g = create_goal(anna, deadline=deadline)
    assert (g["status"], g["saved"], g["left"], g["percent"], g["etaMonth"]) == ("active", 0, 10000, 0, None)
    assert g["monthlyNeeded"] > 0

    r = contribute(boris, g, 4000)
    assert r.status_code == 201
    body = r.json()
    assert (body["goal"]["saved"], body["goal"]["percent"], body["contribution"]["memberId"]) == (4000, 40, boris.id)
    assert body["goal"]["etaMonth"] is not None  # есть темп — есть прогноз
    done = contribute(anna, g, 6000).json()["goal"]
    assert (done["status"], done["left"], done["percent"]) == ("achieved", 0, 100) and done["achievedAt"]

    contributions = anna.get(f"/api/goals/{g['id']}/contributions").json()
    assert [c["amount"] for c in contributions] == [6000, 4000]
    # Удалил свой взнос — цель снова активна; чужой — нельзя
    reopened = anna.delete(f"/api/goals/{g['id']}/contributions/{contributions[0]['id']}").json()
    assert reopened["status"] == "active"
    assert_error(anna.delete(f"/api/goals/{g['id']}/contributions/{contributions[1]['id']}"), 403)

    assert_error(anna.delete(f"/api/goals/{g['id']}"), 409)  # есть взносы
    assert anna.post(f"/api/goals/{g['id']}/archive").json()["status"] == "archived"
    assert_error(contribute(anna, g, 1), 422)
    empty = create_goal(anna, "Пустая")
    assert anna.delete(f"/api/goals/{empty['id']}").status_code == 204
    assert [x["status"] for x in anna.get("/api/goals").json()] == ["archived"]


def test_goal_validation_and_permissions(api, new_client):
    anna = create_family(api)
    child = add_child(anna, new_client())
    assert_error(anna.post("/api/goals", {"title": "", "target": 1}), 422, field="title")
    assert_error(anna.post("/api/goals", {"title": "x", "target": 0}), 422, field="target")
    yesterday = (today() - timedelta(days=1)).isoformat()
    assert_error(anna.post("/api/goals", {"title": "x", "target": 1, "deadline": yesterday}), 422, field="deadline")
    assert_error(child.post("/api/goals", {"title": "x", "target": 1}), 403)
    g = create_goal(anna)
    tomorrow = (today() + timedelta(days=1)).isoformat()
    assert_error(contribute(anna, g, 10, tomorrow), 422, field="date")
    eve = create_family(new_client(), "Чужие", "Ева")
    assert_error(contribute(eve, g, 10), 404)
    assert eve.get("/api/goals").json() == []


def test_child_contributes_from_allowance(api, new_client):
    anna = create_family(api)
    child = add_child(anna, new_client())
    g = create_goal(anna, "Велосипед", 5000)
    assert_error(contribute(child, g, 100), 403)  # без карманных денег
    set_allowance(anna, child, 1000)
    assert contribute(child, g, 600).status_code == 201
    assert child.get("/api/allowances").json()[0]["left"] == 400
    assert_error(contribute(child, g, 500), 422, field="amount")


def test_goal_contributions_in_summary_and_idempotency(api):
    anna = create_family(api)
    set_budget(anna, 10000, {})
    g = create_goal(anna)
    k = key()
    first = anna.post(f"/api/goals/{g['id']}/contributions", {"amount": 700}, idem=k).json()
    again = anna.post(f"/api/goals/{g['id']}/contributions", {"amount": 700}, idem=k).json()
    assert first["contribution"]["id"] == again["contribution"]["id"]
    s = summary(anna)
    assert (s["savedThisMonth"], s["spent"], s["freeByPlan"]) == (700, 0, 10000)  # взнос — не трата


def test_goal_limit(api):
    anna = create_family(api)
    for i in range(20):
        create_goal(anna, f"Цель {i}")
    assert_error(anna.post("/api/goals", {"title": "Лишняя", "target": 1}), 409)


# ── Повторяющиеся платежи ──


def add_recurring(m, due, title="Аренда", amount=38000, category="housing"):
    r = m.post("/api/payments", {"title": title, "amount": amount, "category": category, "dueDate": due,
                                 "recurring": True})
    assert r.status_code == 201, r.text
    return r.json()


def test_recurring_payment_creates_next_month(api):
    anna = create_family(api)
    p = add_recurring(anna, f"{MONTH}-05")
    assert (p["recurring"], p["seriesId"]) == (True, p["id"])
    payments = anna.get("/api/payments").json()
    assert [x["dueDate"] for x in payments] == [f"{MONTH}-05", f"{NEXT}-05"]
    assert all(x["seriesId"] == p["id"] and x["status"] == "upcoming" for x in payments)
    # Перенос из прошлого месяца не дублирует серию
    assert anna.post("/api/payments/copy-previous-month", {"monthKey": NEXT}).json()["added"] == 0


def test_recurring_day_is_clamped_and_series_stops(api):
    anna = create_family(api)
    p = add_recurring(anna, "2026-01-31", "Связь", 900, "other")
    months = [x["dueDate"] for x in anna.get("/api/payments").json()]
    assert months[:2] == ["2026-01-31", "2026-02-28"] and months[-1].startswith(NEXT)
    body = {"title": "Связь", "amount": 900, "category": "other", "dueDate": "2026-01-31", "recurring": False}
    assert anna.put(f"/api/payments/{p['id']}", body).json()["recurring"] is False
    assert all(not x["recurring"] for x in anna.get("/api/payments").json())
    # Платёж серии нельзя увести в другой месяц
    february = next(x for x in anna.get("/api/payments").json() if x["dueDate"].startswith("2026-02"))
    assert_error(anna.put(f"/api/payments/{february['id']}", {**body, "dueDate": "2026-03-01"}), 422, field="dueDate")


def test_recurring_extended_by_background_job(api, needs_db):
    anna = create_family(api)
    p = add_recurring(anna, f"{MONTH}-10")
    # Будто следующий месяц ещё не создан
    run_sql(needs_db, "DELETE FROM payments WHERE series_id = $1 AND series_month = $2", p["id"], NEXT)

    async def go():
        engine = make_engine(needs_db)
        try:
            factory = async_sessionmaker(engine, expire_on_commit=False)
            return await extend_recurring_once(factory), await extend_recurring_once(factory)
        finally:
            await engine.dispose()

    first, second = asyncio.run(go())
    assert first >= 1 and second == 0  # повторный запуск ничего не дублирует
    assert [x["dueDate"] for x in anna.get("/api/payments").json()] == [f"{MONTH}-10", f"{NEXT}-10"]


# ── Прогноз ──


def test_forecast_shape_and_rules(api, new_client):
    anna = create_family(api)
    set_budget(anna, 10000, {"food": 1000})
    add_expense(anna, 900, "food")
    add_payment(anna, 2000, "housing")
    f = anna.get(f"/api/months/{MONTH}/forecast").json()
    assert f["kind"] == "current" and f["daysPassed"] == today().day
    assert (f["reserved"], f["spent"]) == (2000, 900)
    assert f["projectedSpent"] >= 2900 and f["projectedLeft"] == 10000 - f["projectedSpent"]
    food = next(c for c in f["categories"] if c["key"] == "food")
    assert food["status"] == ("over" if food["projected"] > 1000 else "ok")
    past = anna.get("/api/months/2020-01/forecast").json()
    assert (past["kind"], past["projectedSpent"]) == ("past", 0)
    assert_error(anna.get("/api/months/bad/forecast"), 422, field="month")
    child = add_child(anna, new_client())
    assert_error(child.get(f"/api/months/{MONTH}/forecast"), 403)


# ── Кто кому должен ──


def test_settlement_flow(api, new_client):
    anna = create_family(api, user="Анна")
    boris = join(new_client(), anna.invite_code, "Борис")
    child = add_child(anna, new_client())
    set_allowance(anna, child, 1000)
    add_expense(anna, 9000, "food")
    add_expense(boris, 3000, "food")
    child.post("/api/expenses", {"title": "Сок", "amount": 100, "category": "food", "date": TODAY})  # не делится

    s = anna.get(f"/api/months/{MONTH}/settlement").json()
    assert s["sharedTotal"] == 12000
    members = {m["name"]: m for m in s["members"]}
    assert set(members) == {"Анна", "Борис"}
    assert (members["Анна"]["paid"], members["Анна"]["share"], members["Анна"]["balance"]) == (9000, 6000, 3000)
    assert s["transfers"] == [{"fromId": boris.id, "toId": anna.id, "amount": 3000}]

    r = boris.post(f"/api/months/{MONTH}/settlements", {"fromId": boris.id, "toId": anna.id, "amount": 3000})
    assert r.status_code == 201
    after = r.json()
    assert after["transfers"] == [] and len(after["recorded"]) == 1
    rec = after["recorded"][0]["id"]
    assert_error(anna.delete(f"/api/months/{MONTH}/settlements/{rec}"), 403)  # удаляет автор отметки
    assert boris.delete(f"/api/months/{MONTH}/settlements/{rec}").json()["transfers"][0]["amount"] == 3000


def test_settlement_validation(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna.invite_code)
    child = add_child(anna, new_client())
    url = f"/api/months/{MONTH}/settlements"
    assert_error(anna.post(url, {"fromId": anna.id, "toId": anna.id, "amount": 1}), 422, field="toId")
    assert_error(anna.post(url, {"fromId": child.id, "toId": anna.id, "amount": 1}), 422, field="fromId")
    assert_error(anna.post(url, {"fromId": boris.id, "toId": anna.id, "amount": 0}), 422, field="amount")
    assert_error(child.get(f"/api/months/{MONTH}/settlement"), 403)
    eve = create_family(new_client(), "Чужие", "Ева")
    assert_error(eve.post(url, {"fromId": boris.id, "toId": anna.id, "amount": 1}), 422)
