from .helpers import MONTH, TODAY, add_child, assert_error, create_family, join, key


def test_custom_purchase_shares_persist_and_common_spending_is_not_split(api, new_client):
    petya = create_family(api, user="Петя")
    masha = join(new_client(), petya, user="Маша")
    purchase = {"title": "Покупка", "amount": 100.01, "category": "other", "date": TODAY}
    split = {"accountMode": "personal_split", "splitPercentages": {petya.id: 60, masha.id: 40}}
    created = petya.post("/api/expenses", {**purchase, **split})
    assert created.status_code == 201, created.text
    edit_path = f"/api/expenses/{created.json()['id']}"
    assert masha.put(edit_path, purchase).json()["splitPercentages"] == split["splitPercentages"]
    assert_error(petya.put(edit_path, {**purchase, **split, "splitPercentages": {petya.id: 99}}), 422)
    assert_error(petya.put(edit_path, {**purchase, **split, "splitPercentages": {"another-family": 100}}), 422)
    assert petya.post("/api/expenses", {**purchase, "accountMode": "shared_common"}).status_code == 201

    settlement = masha.get(f"/api/months/{MONTH}/settlement").json()
    assert settlement["sharedTotal"] == 100.01
    assert {row["memberId"]: row["share"] for row in settlement["members"]} == {petya.id: 60.01, masha.id: 40}
    assert petya.put(edit_path, {**purchase, **split, "splitPercentages": None}).json()["splitPercentages"] is None


def test_goal_savings_fund_a_manual_payment_once(api, new_client):
    petya = create_family(api, user="Петя")
    masha = join(new_client(), petya, user="Маша")
    goal = petya.post("/api/goals", {"title": "Поездка", "target": 2000}).json()
    goal_path = f"/api/goals/{goal['id']}/contributions"
    payment = petya.post("/api/payments", {
        "title": "Свет", "dueDate": "2090-12-01", "amount": 500, "category": "housing",
        "accountMode": "shared_common",
    })
    assert payment.status_code == 201, payment.text
    pay_path = f"/api/payments/{payment.json()['id']}/paid"
    pay = {"paid": True, "fromSharedAccount": True}
    assert_error(masha.post(pay_path, pay), 409)

    idem = key()
    saved = petya.post(goal_path, {"amount": 700}, idem=idem)
    assert saved.status_code == 201, saved.text
    assert petya.post(goal_path, {"amount": 700}, idem=idem).json() == saved.json()
    contribution = saved.json()["accountContribution"]
    assert contribution["amount"] == 700
    assert masha.get("/api/state").json()["accountContributions"] == [contribution]

    paid = masha.post(pay_path, pay)
    assert paid.status_code == 200, paid.text
    expense = paid.json()["expense"]
    assert (expense["date"], expense["paidBy"], expense["amount"]) == (TODAY, masha.id, 500)
    assert masha.post(pay_path, pay).json()["expense"] is None
    assert [row["id"] for row in petya.get("/api/state").json()["expenses"]] == [expense["id"]]

    contribution_id = saved.json()["contribution"]["id"]
    assert petya.delete(f"{goal_path}/{contribution_id}").status_code == 200
    assert masha.get("/api/state").json()["accountContributions"] == []


def test_account_top_up_and_split_payment(api, new_client):
    petya = create_family(api, user="Петя")
    masha = join(new_client(), petya, user="Маша")
    idem = key()
    first = petya.post("/api/account/contributions", {"amount": 8400}, idem=idem)
    assert first.status_code == 201, first.text
    assert petya.post("/api/account/contributions", {"amount": 8400}, idem=idem).json() == first.json()
    assert masha.get("/api/state").json()["accountContributions"] == [first.json()]

    payment = petya.post("/api/payments", {
        "title": "Коммунальные услуги", "dueDate": TODAY, "amount": 6819.99,
        "category": "housing", "accountMode": "shared_split", "recurring": True,
    })
    assert payment.status_code == 201, payment.text
    payment_id = payment.json()["id"]
    paid = masha.post(f"/api/payments/{payment_id}/paid", {"paid": True})
    assert paid.status_code == 200, paid.text
    expense = paid.json()["expense"]
    assert expense["accountMode"] == "shared_split"
    assert expense["splitMembers"] == [petya.id, masha.id]

    undone = masha.post(f"/api/payments/{payment_id}/paid", {"paid": False})
    assert undone.status_code == 200
    assert not any(row["id"] == expense["id"] for row in petya.get("/api/state").json()["expenses"])

    child = add_child(petya, new_client())
    assert_error(child.post("/api/account/contributions", {"amount": 10}), 403)
    assert child.get("/api/state").json()["accountContributions"] == []


def test_only_owner_can_read_preview_and_only_selected_rows_are_shared(api, new_client):
    masha = create_family(api, user="Маша")
    petya = join(new_client(), masha, user="Петя")
    content = f"Дата;Сумма;Описание\n{TODAY};-50;Продукты\n{TODAY};-20;Личный заказ\n"
    preview = masha.post("/api/imports", {"filename": "card.csv", "content": content})
    assert preview.status_code == 201, preview.text
    batch = preview.json()
    path = f"/api/imports/{batch['id']}"
    assert_error(petya.get(path), 404)
    assert_error(petya.post(f"{path}/confirm", {}), 404)
    assert petya.get("/api/imports").json() == []
    result = masha.post(f"{path}/confirm", {"rows": [
        {"id": batch["rows"][0]["id"], "accountMode": "personal_split"},
        {"id": batch["rows"][1]["id"], "include": False},
    ]})
    assert result.status_code == 200, result.text
    expenses = petya.get("/api/expenses").json()
    assert [(row["title"], row["accountMode"]) for row in expenses] == [("Продукты", "personal_split")]
    assert expenses[0]["splitMembers"] == [masha.id, petya.id]
