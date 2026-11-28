"""Импорт банковской выписки (docs/FEATURES.md §10)."""
from .helpers import MONTH, TODAY, assert_error, create_family, join, key

STATEMENT = (
    "Дата;Сумма;Описание;MCC\n"
    "21.10.2026;-1250,50;ПЯТЕРОЧКА 1234;5411\n"
    "21.10.2026;-300;Кофейня Зерно;\n"
    "21.10.2026;-300;Кофейня Зерно;\n"
    "20.10.2026;50000;Зарплата;\n"
    "20.10.2026;-abc;Битая строка;\n"
)


def upload(m, content=STATEMENT, filename="октябрь.csv"):
    r = m.post("/api/imports", {"filename": filename, "content": content})
    assert r.status_code == 201, r.text
    return r.json()


def test_import_preview_and_confirm(api):
    anna = create_family(api)
    batch = upload(anna)
    assert (batch["status"], batch["totalRows"], batch["spendingRows"], batch["skippedIncome"], batch["errors"]) == (
        "pending", 5, 4, 1, 1)
    rows = batch["rows"]
    assert [r["suggestedCategory"] for r in rows[:3]] == ["food", "other", "other"]
    assert anna.get("/api/expenses").json() == []  # до подтверждения ничего не импортировано

    coffee = rows[1]["id"]
    second_coffee = rows[2]["id"]
    done = anna.post(f"/api/imports/{batch['id']}/confirm",
                     {"rows": [{"id": coffee, "category": "food"}, {"id": second_coffee, "include": False}]}).json()
    assert (done["status"], done["imported"]) == ("confirmed", 2)
    expenses = anna.get("/api/expenses").json()
    assert sorted((e["title"], e["amount"], e["category"]) for e in expenses) == [
        ("Кофейня Зерно", 300, "food"), ("ПЯТЕРОЧКА 1234", 1250.5, "food")]
    assert all(e["paidBy"] == anna.id for e in expenses)
    assert_error(anna.post(f"/api/imports/{batch['id']}/confirm", {}), 409)

    # Повторная загрузка той же выписки: импортированное помечено дублем, исправление категории запомнено
    again = upload(anna)
    flags = [(r["description"], r["duplicate"], r["suggestedCategory"]) for r in again["rows"][:3]]
    assert flags == [("ПЯТЕРОЧКА 1234", True, "food"), ("Кофейня Зерно", True, "food"),
                     ("Кофейня Зерно", False, "food")]
    assert anna.post(f"/api/imports/{again['id']}/confirm", {}).json()["imported"] == 1


def test_import_listing_and_discard(api):
    anna = create_family(api)
    batch = upload(anna)
    listed = anna.get("/api/imports").json()
    assert [i["id"] for i in listed] == [batch["id"]] and listed[0]["rows"] is None
    assert len(anna.get(f"/api/imports/{batch['id']}").json()["rows"]) == 4
    assert anna.delete(f"/api/imports/{batch['id']}").status_code == 204
    assert_error(anna.get(f"/api/imports/{batch['id']}"), 404)


def test_import_validation_limits_and_permissions(api, new_client):
    anna = create_family(api)
    assert_error(anna.post("/api/imports", {"filename": "x.csv", "content": "a;b\n1;2\n"}), 422, field="content")
    assert_error(anna.post("/api/imports", {"filename": "x.csv", "content": "Дата;Сумма\n" + "01.01.2026;-1\n" * 1001}),
                 422, field="content")
    batch = upload(anna)
    assert_error(anna.post(f"/api/imports/{batch['id']}/confirm", {"rows": [{"id": "чужая"}]}), 422, field="rows")
    assert_error(anna.post(f"/api/imports/{batch['id']}/confirm",
                           {"rows": [{"id": batch["rows"][0]["id"], "category": "pets"}]}), 422, field="rows")
    for _ in range(4):
        upload(anna)
    assert_error(anna.post("/api/imports", {"filename": "x.csv", "content": STATEMENT}), 409)

    member = join(new_client(), anna)
    assert member.post("/api/imports", {"filename": "x.csv", "content": STATEMENT}).status_code == 201
    eve = create_family(new_client(), "Чужие", "Ева")
    assert_error(eve.get(f"/api/imports/{batch['id']}"), 404)
    assert_error(eve.post(f"/api/imports/{batch['id']}/confirm", {}), 404)


def test_large_statement_fits_body_limit(api):
    anna = create_family(api)
    rows = "".join(f"0{1 + i % 9}.10.2026;-{100 + i};Магазин номер {i} с длинным описанием операции;5411\n"
                   for i in range(1000))
    batch = upload(anna, "Дата;Сумма;Описание;MCC\n" + rows)
    assert batch["spendingRows"] == 1000


def test_card_import_is_private_deterministic_and_counts_as_personal_payment(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna)
    baseline = {
        "title": "Общая покупка", "amount": 1_000, "category": "food", "date": TODAY,
        "splitMode": "equal", "splitMembers": [anna.id, boris.id],
    }
    assert anna.post("/api/expenses", baseline, idem=key()).status_code == 201
    due_before = next(row for row in anna.get(f"/api/account/summary?month={MONTH}").json()["members"]
                      if row["memberId"] == anna.id)["due"]

    first = anna.post("/api/imports/card", {"month": MONTH}, idem=key())
    assert first.status_code == 201, first.text
    batch = first.json()
    assert 8 <= len(batch["rows"]) <= 13
    assert batch["createdBy"] == anna.id
    assert all(row["date"].startswith(MONTH) and row["date"] <= TODAY for row in batch["rows"])

    # Открытый черновик переиспользуется, набор строк не меняется.
    repeated = anna.post("/api/imports/card", {"month": MONTH}, idem=key()).json()
    assert repeated["id"] == batch["id"]
    assert [(row["date"], row["amount"], row["description"]) for row in repeated["rows"]] == [
        (row["date"], row["amount"], row["description"]) for row in batch["rows"]
    ]
    assert_error(boris.get(f"/api/imports/{batch['id']}"), 404)

    choices = [{"id": row["id"], "accountMode": "personal_split"} for row in batch["rows"]]
    confirmed = anna.post(f"/api/imports/{batch['id']}/confirm", {"rows": choices}).json()
    assert confirmed["imported"] == len(batch["rows"])
    imported_ids = {row["expenseId"] for row in confirmed["rows"] if row["expenseId"]}
    imported = [row for row in anna.get("/api/expenses").json() if row["id"] in imported_ids]
    assert imported and all(row["source"] == "personal" and row["paidBy"] == anna.id for row in imported)
    due_after = next(row for row in anna.get(f"/api/account/summary?month={MONTH}").json()["members"]
                     if row["memberId"] == anna.id)["due"]
    assert due_after < due_before

    after_confirm = anna.post("/api/imports/card", {"month": MONTH}, idem=key()).json()
    assert after_confirm["id"] == batch["id"]
    assert all(row["expenseId"] for row in after_confirm["rows"])
