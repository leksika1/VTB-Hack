"""Расходы: GET/POST/PUT/DELETE /api/expenses."""
from .helpers import MONTH, TODAY, add_expense, assert_error, create_family, join, key, set_budget, summary


def test_create_expense(api):
    anna = create_family(api)
    e = add_expense(anna, 1250.5, "food", "  Продукты  ")
    assert set(e) == {"id", "familyId", "title", "amount", "category", "date", "authorId", "authorName",
                      "paymentId", "paidBy", "requestId", "createdAt"}
    assert (e["title"], e["amount"], e["category"], e["date"]) == ("Продукты", 1250.5, "food", TODAY)
    assert (e["authorId"], e["authorName"], e["paymentId"]) == (anna.id, "Анна", None)
    assert e["familyId"] == anna.family_id


def test_expense_validation(api):
    anna = create_family(api)
    ok = {"title": "Хлеб", "amount": 50, "category": "food", "date": TODAY}
    cases = [
        ({"amount": 0}, "amount", "Сумма должна быть больше нуля"),
        ({"amount": -5}, "amount", "Сумма не может быть отрицательной"),
        ({"amount": 1.234}, "amount", "Не больше двух знаков после запятой"),
        ({"amount": 100_000_001}, "amount", "Слишком большая сумма"),
        ({"amount": "много"}, "amount", None),
        ({"title": "   "}, "title", "Укажите название"),
        ({"title": "Я" * 121}, "title", "Название длиннее 120 символов"),
        ({"category": "pets"}, "category", "Выберите категорию"),
        ({"date": "21.10.2026"}, "date", "Укажите дату"),
        ({"date": "2026-02-30"}, "date", "Укажите дату"),
    ]
    for patch, field, message in cases:
        assert_error(anna.post("/api/expenses", {**ok, **patch}), 422, "validation_error", field, message)
    assert anna.get("/api/expenses").json() == []


def test_amount_with_kopecks_is_exact(api):
    anna = create_family(api)
    for amount in (0.1, 0.2, 1270.5, 6850.4):
        add_expense(anna, amount)
    assert summary(anna)["spent"] == 8121.2


def test_list_expenses_by_month_newest_first(api):
    anna = create_family(api)
    old = add_expense(anna, 1, date="2026-01-15")
    a = add_expense(anna, 2, date="2026-02-01")
    b = add_expense(anna, 3, date="2026-02-20")
    c = add_expense(anna, 4, date="2026-02-20")  # тот же день — новее по времени создания
    feb = anna.get("/api/expenses", params={"month": "2026-02"}).json()
    assert [e["id"] for e in feb] == [c["id"], b["id"], a["id"]]
    assert [e["id"] for e in anna.get("/api/expenses").json()][-1] == old["id"]
    assert_error(anna.get("/api/expenses", params={"month": "2026-2"}), 422, field="month")


def test_update_own_expense(api):
    anna = create_family(api)
    e = add_expense(anna, 100)
    r = anna.put(f"/api/expenses/{e['id']}", {"title": "Ужин", "amount": 2000, "category": "other", "date": "2026-01-05"})
    assert r.status_code == 200
    u = r.json()
    assert (u["id"], u["title"], u["amount"], u["category"], u["date"]) == (e["id"], "Ужин", 2000, "other", "2026-01-05")
    assert u["createdAt"] == e["createdAt"] and u["authorId"] == anna.id


def test_update_expense_errors(api):
    anna = create_family(api)
    e = add_expense(anna)
    body = {"title": "x", "amount": 1, "category": "food", "date": TODAY}
    assert_error(anna.put("/api/expenses/missing", body), 404, "not_found")
    assert_error(anna.put(f"/api/expenses/{e['id']}", {**body, "amount": 0}), 422, field="amount")


def test_adult_edits_partners_expense(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna)
    e = add_expense(anna, 100)
    # Взрослый исправляет чужую запись и указывает, кто на самом деле платил; автор остаётся прежним
    body = {"title": "Ужин", "amount": 250, "category": "food", "date": TODAY, "paidBy": boris.id}
    u = boris.put(f"/api/expenses/{e['id']}", body).json()
    assert (u["amount"], u["authorId"], u["paidBy"]) == (250, anna.id, boris.id)
    assert boris.delete(f"/api/expenses/{e['id']}").status_code == 204


def test_delete_expense(api):
    anna = create_family(api)
    e = add_expense(anna, 300)
    assert anna.delete(f"/api/expenses/{e['id']}").status_code == 204
    # Повторное удаление — не ошибка
    assert anna.delete(f"/api/expenses/{e['id']}").status_code == 204
    assert anna.get("/api/expenses").json() == []


def test_expenses_update_totals(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna)
    set_budget(anna, 100000)
    add_expense(anna, 1000, "food")
    add_expense(boris, 500, "food")
    s = summary(boris)
    assert (s["spent"], s["leftByPlan"], s["freeByPlan"]) == (1500, 98500, 98500)
    food = next(c for c in s["categories"] if c["key"] == "food")
    assert (food["spent"], food["left"]) == (1500, 28500)
    assert [e["amount"] for e in s["expenses"]] == [500, 1000]


def test_expense_idempotency(api):
    anna = create_family(api)
    k = key()
    body = {"title": "Кофе", "amount": 300, "category": "other", "date": TODAY}
    first = anna.post("/api/expenses", body, idem=k)
    second = anna.post("/api/expenses", body, idem=k)
    assert first.status_code == second.status_code == 201
    assert first.json() == second.json()
    assert len(anna.get("/api/expenses").json()) == 1
    assert_error(anna.post("/api/expenses", {**body, "amount": 1}, idem=k), 409, "conflict")
    # Ключи принадлежат участнику: тот же ключ у другого — отдельная операция
    other = create_family(api, user="Ева")
    assert other.post("/api/expenses", body, idem=k).json()["id"] != first.json()["id"]


def test_failed_request_does_not_burn_idempotency_key(api):
    anna = create_family(api)
    k = key()
    assert_error(anna.post("/api/expenses", {"title": "x", "amount": 0, "category": "food", "date": TODAY}, idem=k), 422)
    # Пользователь исправил сумму в той же форме — тот же ключ проходит
    assert anna.post("/api/expenses", {"title": "x", "amount": 5, "category": "food", "date": TODAY}, idem=k).status_code == 201


def test_expense_in_another_month_does_not_affect_current(api):
    anna = create_family(api)
    set_budget(anna, 1000, {})
    add_expense(anna, 700, date="2020-01-01")
    assert summary(anna, MONTH)["spent"] == 0
    assert summary(anna, "2020-01")["spent"] == 700
