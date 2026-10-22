"""Обязательные платежи: CRUD, оплата, перенос из прошлого месяца."""
from app.validation import shift_month

from .helpers import (
    MONTH,
    TODAY,
    add_expense,
    add_payment,
    assert_error,
    create_family,
    join,
    key,
    set_budget,
    summary,
)


def test_create_payment(api):
    anna = create_family(api)
    p = add_payment(anna, 38000, "housing", " Аренда ", f"{MONTH}-01")
    assert set(p) == {"id", "familyId", "title", "amount", "category", "dueDate", "status", "expenseId",
                      "authorId", "createdAt"}
    assert (p["title"], p["amount"], p["dueDate"], p["status"], p["expenseId"], p["authorId"]) == (
        "Аренда", 38000, f"{MONTH}-01", "upcoming", None, anna.id)


def test_payment_validation(api):
    anna = create_family(api)
    ok = {"title": "Аренда", "amount": 100, "category": "housing", "dueDate": TODAY}
    for patch, field in [({"amount": 0}, "amount"), ({"title": ""}, "title"), ({"category": "x"}, "category"),
                         ({"dueDate": "завтра"}, "dueDate"), ({"amount": 1.001}, "amount")]:
        assert_error(anna.post("/api/payments", {**ok, **patch}), 422, "validation_error", field)


def test_upcoming_payment_is_reserved(api):
    anna = create_family(api)
    set_budget(anna, 100000)
    add_payment(anna, 38000, "housing")
    s = summary(anna)
    assert (s["spent"], s["reserved"], s["leftByPlan"], s["freeByPlan"]) == (0, 38000, 100000, 62000)
    assert [p["amount"] for p in s["upcomingPayments"]] == [38000] and s["paidPayments"] == []


def test_list_payments_sorted_by_due_date(api):
    anna = create_family(api)
    late = add_payment(anna, 1, title="B", due="2026-03-20")
    early = add_payment(anna, 1, title="A", due="2026-03-05")
    other_month = add_payment(anna, 1, title="C", due="2026-04-01")
    march = anna.get("/api/payments", params={"month": "2026-03"}).json()
    assert [p["id"] for p in march] == [early["id"], late["id"]]
    assert [p["id"] for p in anna.get("/api/payments").json()] == [early["id"], late["id"], other_month["id"]]


def test_update_and_delete_upcoming_payment(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna.invite_code)
    p = add_payment(anna, 100)
    # Любой участник может править предстоящий платёж
    r = boris.put(f"/api/payments/{p['id']}", {"title": "Садик", "amount": 7500, "category": "kids", "dueDate": "2026-05-06"})
    assert r.status_code == 200
    assert (r.json()["title"], r.json()["amount"], r.json()["category"], r.json()["dueDate"]) == ("Садик", 7500, "kids", "2026-05-06")
    assert boris.delete(f"/api/payments/{p['id']}").status_code == 204
    assert boris.delete(f"/api/payments/{p['id']}").status_code == 204
    assert anna.get("/api/payments").json() == []
    assert_error(anna.put("/api/payments/missing", {"title": "x", "amount": 1, "category": "food", "dueDate": TODAY}), 404)


def test_mark_paid_turns_reserve_into_expense(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna.invite_code)
    set_budget(anna, 100000)
    p = add_payment(anna, 38000, "housing", due=f"{MONTH}-01")

    r = boris.post(f"/api/payments/{p['id']}/paid", {"paid": True})
    assert r.status_code == 200
    body = r.json()
    assert body["payment"]["status"] == "paid"
    expense = body["expense"]
    assert (expense["paymentId"], expense["amount"], expense["category"], expense["title"]) == (p["id"], 38000, "housing", "Аренда")
    assert expense["authorName"] == "Борис"  # кто отметил оплату
    assert expense["date"] == TODAY  # платёж этого месяца — дата оплаты сегодня
    assert body["payment"]["expenseId"] == expense["id"]

    s = summary(anna)
    assert (s["spent"], s["reserved"], s["freeByPlan"]) == (38000, 0, 62000)  # учтён один раз
    assert [x["id"] for x in s["paidPayments"]] == [p["id"]]


def test_mark_paid_is_noop_when_repeated(api):
    anna = create_family(api)
    p = add_payment(anna)
    first = anna.post(f"/api/payments/{p['id']}/paid", {"paid": True}).json()
    again = anna.post(f"/api/payments/{p['id']}/paid", {"paid": True}).json()
    assert again["expense"] is None and again["payment"]["expenseId"] == first["expense"]["id"]
    assert len(anna.get("/api/expenses").json()) == 1
    unpaid = anna.post(f"/api/payments/{p['id']}/paid", {"paid": False}).json()
    assert unpaid["payment"]["status"] == "upcoming" and unpaid["expense"] is None
    assert anna.post(f"/api/payments/{p['id']}/paid", {"paid": False}).json()["payment"]["status"] == "upcoming"
    assert anna.get("/api/expenses").json() == []


def test_paid_payment_of_other_month_keeps_due_date(api):
    anna = create_family(api)
    p = add_payment(anna, 500, due="2026-01-25")
    assert anna.post(f"/api/payments/{p['id']}/paid", {"paid": True}).json()["expense"]["date"] == "2026-01-25"


def test_paid_payment_is_locked(api):
    anna = create_family(api)
    p = add_payment(anna)
    anna.post(f"/api/payments/{p['id']}/paid", {"paid": True})
    body = {"title": "x", "amount": 1, "category": "food", "dueDate": TODAY}
    msg = "Платёж уже оплачен. Сначала верните его в предстоящие."
    assert_error(anna.put(f"/api/payments/{p['id']}", body), 422, message=msg)
    assert_error(anna.delete(f"/api/payments/{p['id']}"), 422, message=msg)


def test_deleting_payment_expense_returns_payment_to_upcoming(api):
    anna = create_family(api)
    p = add_payment(anna, 700)
    expense = anna.post(f"/api/payments/{p['id']}/paid", {"paid": True}).json()["expense"]
    assert anna.delete(f"/api/expenses/{expense['id']}").status_code == 204
    payment = anna.get("/api/payments").json()[0]
    assert (payment["status"], payment["expenseId"]) == ("upcoming", None)
    assert summary(anna)["reserved"] == 700


def test_mark_paid_errors(api):
    anna = create_family(api)
    assert_error(anna.post("/api/payments/missing/paid", {"paid": True}), 404, "not_found")
    p = add_payment(anna)
    assert_error(anna.post(f"/api/payments/{p['id']}/paid", {}), 422, field="paid")


def test_copy_payments_from_previous_month(api):
    anna = create_family(api)
    add_payment(anna, 38000, "housing", "Аренда", "2026-01-01")
    add_payment(anna, 900, "other", "Связь", "2026-01-31")
    add_payment(anna, 1, "other", "Мартовский", "2026-03-10")
    add_payment(anna, 38000, "housing", "Аренда", "2026-02-01")  # уже заведён в феврале
    paid = add_payment(anna, 300, "other", "Подписка", "2026-01-15")
    anna.post(f"/api/payments/{paid['id']}/paid", {"paid": True})

    r = anna.post("/api/payments/copy-previous-month", {"monthKey": "2026-02"})
    assert r.status_code == 200
    body = r.json()
    assert body["added"] == 2
    copies = {p["title"]: p for p in body["payments"]}
    assert set(copies) == {"Связь", "Подписка"}
    assert copies["Связь"]["dueDate"] == "2026-02-28"  # 31 января → последний день февраля
    assert all(p["status"] == "upcoming" for p in copies.values())  # оплаченные переносятся как предстоящие
    # Повтор ничего не добавляет
    assert anna.post("/api/payments/copy-previous-month", {"monthKey": "2026-02"}).json()["added"] == 0


def test_copy_payments_edge_cases(api):
    anna = create_family(api)
    assert anna.post("/api/payments/copy-previous-month", {"monthKey": MONTH}).json() == {"added": 0, "payments": []}
    add_payment(anna, 1, title="Новогодний", due="2025-12-31")
    assert anna.post("/api/payments/copy-previous-month", {"monthKey": "2026-01"}).json()["payments"][0]["dueDate"] == "2026-01-31"
    assert shift_month("2026-01", -1) == "2025-12"
    assert_error(anna.post("/api/payments/copy-previous-month", {"monthKey": "2026"}), 422, field="monthKey")


def test_payment_idempotency(api):
    anna = create_family(api)
    k = key()
    body = {"title": "Секция", "amount": 3000, "category": "kids", "dueDate": TODAY}
    assert anna.post("/api/payments", body, idem=k).json() == anna.post("/api/payments", body, idem=k).json()
    assert len(anna.get("/api/payments").json()) == 1
    k2 = key()
    first = anna.post("/api/payments/copy-previous-month", {"monthKey": "2030-01"}, idem=k2)
    assert first.json() == anna.post("/api/payments/copy-previous-month", {"monthKey": "2030-01"}, idem=k2).json()


def test_expense_and_payment_totals_together(api):
    anna = create_family(api)
    set_budget(anna, 10000, {"food": 5000, "housing": 5000})
    add_expense(anna, 2000, "food")
    add_payment(anna, 3000, "housing")
    s = summary(anna)
    assert (s["spent"], s["reserved"], s["leftByPlan"], s["freeByPlan"]) == (2000, 3000, 8000, 5000)
