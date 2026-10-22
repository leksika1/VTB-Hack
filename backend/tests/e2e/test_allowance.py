"""Карманные деньги и запросы на покупку (docs/FEATURES.md §2–3)."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

from app.clock import today

from .helpers import (
    TODAY,
    add_child,
    add_expense,
    assert_error,
    create_family,
    join,
    key,
    set_allowance,
    set_budget,
    summary,
)


def child_expense(child, amount, on=TODAY, title="Чипсы"):
    return child.post("/api/expenses", {"title": title, "amount": amount, "category": "food", "date": on})


# ── Карманные деньги ──


def test_set_and_read_allowance(api, new_client):
    anna = create_family(api)
    child = add_child(anna, new_client())
    a = set_allowance(anna, child, 1000, "week")
    monday = today() - timedelta(days=today().weekday())
    assert (a["memberId"], a["amount"], a["period"], a["spent"], a["left"]) == (child.id, 1000, "week", 0, 1000)
    assert (a["periodStart"], a["periodEnd"]) == (monday.isoformat(), (monday + timedelta(days=6)).isoformat())

    m = set_allowance(anna, child, 5000, "month")
    assert m["periodStart"] == today().replace(day=1).isoformat()
    assert child.get("/api/allowances").json()[0]["amount"] == 5000
    assert [x["memberId"] for x in anna.get("/api/allowances").json()] == [child.id]
    assert child.get("/api/state").json()["allowances"][0]["left"] == 5000


def test_allowance_validation(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna)
    child = add_child(anna, new_client())
    url = f"/api/family/members/{child.id}/allowance"
    assert_error(anna.put(url, {"amount": 100, "period": "day"}), 422, field="period")
    assert_error(anna.put(url, {"amount": 0, "period": "week"}), 422, field="amount")
    assert_error(anna.put(f"/api/family/members/{boris.id}/allowance", {"amount": 1, "period": "week"}), 422)
    eve = create_family(new_client(), "Чужие", "Ева")
    assert_error(eve.put(url, {"amount": 1, "period": "week"}), 404)


def test_child_spends_within_allowance(api, new_client):
    anna = create_family(api)
    set_budget(anna, 10000, {"food": 5000})
    child = add_child(anna, new_client())
    assert_error(child_expense(child, 100), 403, message="Карманные деньги не назначены — отправьте запрос на покупку")

    set_allowance(anna, child, 1000)
    assert child_expense(child, 700).status_code == 201
    r = child_expense(child, 301)
    assert_error(r, 422, field="amount")
    assert "осталось 300 ₽" in r.json()["error"]["message"]
    assert child_expense(child, 300).status_code == 201
    assert child.get("/api/allowances").json()[0]["left"] == 0
    # Траты ребёнка — обычные расходы семьи
    assert summary(anna)["spent"] == 1000


def test_child_cannot_backdate_or_future_date(api, new_client):
    anna = create_family(api)
    child = add_child(anna, new_client())
    set_allowance(anna, child, 1000, "week")
    last_week = (today() - timedelta(days=7)).isoformat()
    tomorrow = (today() + timedelta(days=1)).isoformat()
    assert_error(child_expense(child, 10, last_week), 422, field="date")
    assert_error(child_expense(child, 10, tomorrow), 422, field="date")


def test_child_edit_respects_allowance(api, new_client):
    anna = create_family(api)
    child = add_child(anna, new_client())
    set_allowance(anna, child, 1000)
    e = child_expense(child, 600).json()
    body = {"title": "Чипсы", "amount": 1000, "category": "food", "date": TODAY}
    assert child.put(f"/api/expenses/{e['id']}", body).status_code == 200  # 1000 вместо 600 — укладывается
    assert_error(child.put(f"/api/expenses/{e['id']}", {**body, "amount": 1000.01}), 422, field="amount")


def test_parallel_child_spending_cannot_exceed_allowance(api, new_client):
    anna = create_family(api)
    child = add_child(anna, new_client())
    set_allowance(anna, child, 1000)
    with ThreadPoolExecutor(max_workers=5) as pool:
        codes = list(pool.map(lambda _: child_expense(child, 400).status_code, range(5)))
    assert codes.count(201) == 2  # 800 из 1000; третья трата на 400 уже не помещается
    assert child.get("/api/allowances").json()[0]["spent"] == 800


def test_remove_allowance(api, new_client):
    anna = create_family(api)
    child = add_child(anna, new_client())
    set_allowance(anna, child, 1000)
    assert anna.delete(f"/api/family/members/{child.id}/allowance").status_code == 204
    assert child.get("/api/allowances").json() == []
    assert_error(child_expense(child, 10), 403)


# ── Кто платил ──


def test_paid_by(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna)
    child = add_child(anna, new_client())
    e = add_expense(anna, 100)
    assert e["paidBy"] == anna.id  # по умолчанию — автор
    r = anna.post("/api/expenses", {"title": "Ужин", "amount": 50, "category": "food", "date": TODAY, "paidBy": boris.id})
    assert r.json()["paidBy"] == boris.id
    bad = {"title": "x", "amount": 1, "category": "food", "date": TODAY}
    assert_error(anna.post("/api/expenses", {**bad, "paidBy": child.id}), 422, field="paidBy")
    assert_error(anna.post("/api/expenses", {**bad, "paidBy": "nope"}), 422, field="paidBy")
    set_allowance(anna, child, 100)
    assert_error(child.post("/api/expenses", {**bad, "paidBy": anna.id}), 422, field="paidBy")


# ── Запросы на покупку ──


def create_request(m, amount=3500, title="Наушники", category="other", idem=None):
    r = m.post("/api/purchase-requests", {"title": title, "amount": amount, "category": category, "comment": " Сломались "},
               idem=idem)
    assert r.status_code == 201, r.text
    return r.json()


def test_request_approve_flow(api, new_client):
    anna = create_family(api)
    set_budget(anna, 10000, {"other": 5000})
    child = add_child(anna, new_client())
    set_allowance(anna, child, 100)
    req = create_request(child)
    assert (req["status"], req["comment"], req["authorId"], req["check"]) == ("pending", "Сломались", child.id, None)

    # Ребёнок не видит проверку покупки, взрослый — видит
    assert child.get("/api/purchase-requests").json()[0]["check"] is None
    seen = anna.get("/api/purchase-requests?status=pending").json()[0]
    assert seen["check"]["verdict"] == "ok" and seen["check"]["freeAfter"] == 6500

    r = anna.post(f"/api/purchase-requests/{req['id']}/approve", {"comment": "Ок"})
    assert r.status_code == 200
    done = r.json()
    assert (done["status"], done["decidedBy"], done["decisionComment"]) == ("approved", anna.id, "Ок")
    expense = next(e for e in anna.get("/api/expenses").json() if e["id"] == done["expenseId"])
    assert (expense["authorId"], expense["paidBy"], expense["requestId"], expense["amount"]) == (
        child.id, anna.id, req["id"], 3500)
    # Одобренная покупка не съедает карманные деньги
    assert child.get("/api/allowances").json()[0]["left"] == 100
    assert summary(anna)["spent"] == 3500
    # Повторное решение — конфликт
    assert_error(anna.post(f"/api/purchase-requests/{req['id']}/reject", {}), 409, "conflict")


def test_request_reject_and_cancel(api, new_client):
    anna = create_family(api)
    child = add_child(anna, new_client())
    a = create_request(child)
    r = anna.post(f"/api/purchase-requests/{a['id']}/reject", {"comment": "Не сейчас"})
    assert (r.json()["status"], r.json()["expenseId"]) == ("rejected", None)
    b = create_request(child, title="Кроссовки")
    assert_error(anna.post(f"/api/purchase-requests/{b['id']}/cancel"), 403)  # отменяет только автор
    assert child.post(f"/api/purchase-requests/{b['id']}/cancel").json()["status"] == "cancelled"
    assert anna.get("/api/expenses").json() == []


def test_request_permissions(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna)
    child = add_child(anna, new_client())
    own = create_request(anna, title="Кофемашина")
    # Себе не одобряет, другой взрослый — может
    assert_error(anna.post(f"/api/purchase-requests/{own['id']}/approve", {}), 403)
    assert boris.post(f"/api/purchase-requests/{own['id']}/approve", {}).json()["status"] == "approved"
    req = create_request(child)
    assert_error(child.post(f"/api/purchase-requests/{req['id']}/approve", {}), 403)
    # Ребёнок не видит чужие запросы
    assert [r["id"] for r in child.get("/api/purchase-requests").json()] == [req["id"]]
    eve = create_family(new_client(), "Чужие", "Ева")
    assert_error(eve.post(f"/api/purchase-requests/{req['id']}/approve", {}), 404)


def test_request_validation_and_limits(api, new_client):
    anna = create_family(api)
    child = add_child(anna, new_client())
    base = {"title": "x", "amount": 1, "category": "other"}
    assert_error(child.post("/api/purchase-requests", {**base, "amount": 0}), 422, field="amount")
    assert_error(child.post("/api/purchase-requests", {**base, "comment": "я" * 301}), 422, field="comment")
    assert_error(anna.get("/api/purchase-requests?status=maybe"), 422, field="status")
    k = key()
    first = create_request(child, idem=k)
    assert create_request(child, idem=k)["id"] == first["id"]
    for i in range(19):
        create_request(child, title=f"Покупка {i}")
    assert_error(child.post("/api/purchase-requests", base), 409, "conflict")


def test_request_expense_can_only_be_changed_by_parent(api, new_client):
    anna = create_family(api)
    child = add_child(anna, new_client())
    set_allowance(anna, child, 100)
    req = create_request(child, amount=50)
    expense_id = anna.post(f"/api/purchase-requests/{req['id']}/approve", {}).json()["expenseId"]
    body = {"title": "x", "amount": 5000, "category": "other", "date": TODAY}
    assert_error(child.put(f"/api/expenses/{expense_id}", body), 403)
    assert_error(child.delete(f"/api/expenses/{expense_id}"), 403)
    assert anna.delete(f"/api/expenses/{expense_id}").status_code == 204


def test_parallel_decisions(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna)
    child = add_child(anna, new_client())
    req = create_request(child)
    calls = [(anna, "approve"), (boris, "reject"), (anna, "reject"), (boris, "approve")]
    with ThreadPoolExecutor(max_workers=4) as pool:
        codes = list(pool.map(lambda c: c[0].post(f"/api/purchase-requests/{req['id']}/{c[1]}", {}).status_code, calls))
    assert codes.count(200) == 1 and codes.count(409) == 3
    assert len(anna.get("/api/expenses").json()) <= 1
