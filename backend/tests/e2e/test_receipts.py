"""Расход по QR-коду чека (docs/FEATURES.md §8)."""
from .helpers import TODAY, add_child, assert_error, create_family, receipt_qr, set_allowance


def test_parse_receipt(api):
    anna = create_family(api)
    r = anna.post("/api/receipts/parse", {"qr": receipt_qr("1250.5")})
    assert r.status_code == 200
    assert r.json() == {"amount": 1250.5, "date": "2026-10-21", "time": "15:30", "duplicate": False, "duplicateOf": None}
    assert anna.post("/api/receipts/parse", {"qr": "t=20261021T153012&s=99&fn=1&i=2&fp=3&n=1"}).json()["amount"] == 99


def test_parse_rejects_garbage(api):
    anna = create_family(api)
    for qr in ["", "hello", "t=2026&s=1&fn=1&i=1&fp=1", "t=20261021T1530&s=-5&fn=1&i=1&fp=1",
               "t=20261341T1530&s=5&fn=1&i=1&fp=1", "t=20261021T1530&s=5&fn=abc&i=1&fp=1",
               "t=20261021T1530&s=0&fn=1&i=1&fp=1", "x" * 600]:
        assert_error(anna.post("/api/receipts/parse", {"qr": qr}), 422, "validation_error", "qr")


def test_same_receipt_only_once_per_family(api, new_client):
    anna = create_family(api)
    body = {"title": "Пятёрочка", "amount": 1250.5, "category": "food", "date": TODAY, "receipt": receipt_qr()}
    first = anna.post("/api/expenses", body)
    assert first.status_code == 201
    assert_error(anna.post("/api/expenses", body), 409, "conflict", "receipt", "Этот чек уже добавлен")
    parsed = anna.post("/api/receipts/parse", {"qr": receipt_qr()}).json()
    assert (parsed["duplicate"], parsed["duplicateOf"]) == (True, first.json()["id"])
    # Другой чек (другой fp) — можно; тот же чек в другой семье — можно
    assert anna.post("/api/expenses", {**body, "receipt": receipt_qr(fp="111")}).status_code == 201
    assert create_family(new_client(), "Чужие").post("/api/expenses", body).status_code == 201
    assert_error(anna.post("/api/expenses", {**body, "receipt": "мусор"}), 422, field="receipt")


def test_child_does_not_learn_whose_receipt(api, new_client):
    anna = create_family(api)
    anna.post("/api/expenses", {"title": "x", "amount": 10, "category": "food", "date": TODAY, "receipt": receipt_qr()})
    child = add_child(anna, new_client())
    set_allowance(anna, child, 100)
    parsed = child.post("/api/receipts/parse", {"qr": receipt_qr()}).json()
    assert (parsed["duplicate"], parsed["duplicateOf"]) == (True, None)
