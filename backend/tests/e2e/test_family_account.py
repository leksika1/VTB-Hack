from .helpers import TODAY, add_child, assert_error, create_family, join, key


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
