"""Бюджет месяца: GET/PUT /api/budgets."""
from .helpers import MONTH, PLANS, assert_error, create_family, join, key, set_budget, summary


def test_no_budget_yet(api):
    anna = create_family(api)
    assert anna.get("/api/budgets").json() == []
    assert_error(anna.get(f"/api/budgets/{MONTH}"), 404, "not_found")
    s = summary(anna)
    assert s["hasBudget"] is False and s["plan"] == 0


def test_create_and_read_budget(api):
    anna = create_family(api)
    created = set_budget(anna, 100000, {"food": 30000.5, "kids": 10000})
    assert created["familyId"] == anna.family_id
    assert created["monthKey"] == MONTH
    assert created["totalAmount"] == 100000
    # Неуказанные категории — 0, все пять всегда в ответе
    assert created["categoryPlans"] == {"food": 30000.5, "housing": 0, "transport": 0, "kids": 10000, "other": 0}
    assert isinstance(created["updatedAt"], int)
    assert anna.get(f"/api/budgets/{MONTH}").json() == created
    assert anna.get("/api/budgets").json() == [created]


def test_edit_budget_by_another_member(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna)
    first = set_budget(anna, 100000)
    second = set_budget(boris, 120000)
    assert second["totalAmount"] == 120000 and second["updatedAt"] >= first["updatedAt"]
    assert len(anna.get("/api/budgets").json()) == 1


def test_budgets_for_several_months_sorted(api):
    anna = create_family(api)
    for month in ("2026-03", "2026-01", "2026-02"):
        set_budget(anna, 1000, {}, month)
    assert [b["monthKey"] for b in anna.get("/api/budgets").json()] == ["2026-01", "2026-02", "2026-03"]


def test_unallocated_remainder(api):
    anna = create_family(api)
    set_budget(anna, 120000, PLANS)
    assert summary(anna)["unallocated"] == 120000 - sum(PLANS.values())


def test_budget_validation(api):
    anna = create_family(api)
    url = f"/api/budgets/{MONTH}"
    cases = [
        ({"totalAmount": 50000, "categoryPlans": PLANS}, "total", "Сумма лимитов больше общего бюджета"),
        ({"totalAmount": 0, "categoryPlans": {}}, "total", "Сумма должна быть больше нуля"),
        ({"totalAmount": -1, "categoryPlans": {}}, "total", None),
        ({"totalAmount": 1000.123, "categoryPlans": {}}, "total", None),
        ({"totalAmount": 1000, "categoryPlans": {"food": -1}}, "food", None),
        ({"totalAmount": 1000, "categoryPlans": {"pets": 1}}, "pets", "Неизвестная категория"),
        ({"totalAmount": 200_000_000, "categoryPlans": {}}, "total", "Слишком большая сумма"),
        ({"categoryPlans": {}}, "totalAmount", None),
    ]
    for body, field, message in cases:
        assert_error(anna.put(url, body), 422, "validation_error", field, message)
    assert_error(anna.put("/api/budgets/2026-13", {"totalAmount": 1, "categoryPlans": {}}), 422, field="monthKey")
    assert_error(anna.get("/api/budgets/oct"), 422, field="monthKey")


def test_budget_exactly_allocated_is_allowed(api):
    anna = create_family(api)
    set_budget(anna, sum(PLANS.values()), PLANS)
    assert summary(anna)["unallocated"] == 0


def test_budget_idempotency(api):
    anna = create_family(api)
    k = key()
    body = {"totalAmount": 5000, "categoryPlans": {}}
    first = anna.put(f"/api/budgets/{MONTH}", body, idem=k).json()
    assert anna.put(f"/api/budgets/{MONTH}", body, idem=k).json() == first
    assert_error(anna.put(f"/api/budgets/{MONTH}", {**body, "totalAmount": 6000}, idem=k), 409, "conflict")
