"""Сводка месяца и проверка покупки."""
from .helpers import MONTH, add_expense, add_payment, assert_error, category, create_family, set_budget, summary


def test_summary_shape(api):
    anna = create_family(api)
    s = summary(anna)
    assert set(s) == {"monthKey", "hasBudget", "plan", "spent", "reserved", "leftByPlan", "freeByPlan",
                      "unallocated", "savedThisMonth", "categories", "upcomingPayments", "paidPayments", "expenses"}
    assert s["monthKey"] == MONTH
    assert [c["key"] for c in s["categories"]] == ["food", "housing", "transport", "kids", "other"]
    assert set(s["categories"][0]) == {"key", "plan", "spent", "reserved", "left", "status", "overByExpenses"}


def test_category_statuses(api):
    anna = create_family(api)
    set_budget(anna, 10000, {"food": 1000, "housing": 1000, "transport": 1000, "kids": 1000})
    add_expense(anna, 500, "housing")          # 50% → ok
    add_expense(anna, 850, "transport")        # 85% → near
    add_expense(anna, 1100, "kids")            # >100% расходами → over
    add_payment(anna, 300, "other")            # без лимита → no-limit
    s = summary(anna)
    assert category(s, "food")["status"] == "no-spend"
    assert category(s, "housing")["status"] == "ok"
    assert category(s, "transport")["status"] == "near"
    kids = category(s, "kids")
    assert (kids["status"], kids["overByExpenses"], kids["left"]) == ("over", True, -100)
    other = category(s, "other")
    assert (other["status"], other["plan"], other["reserved"], other["left"]) == ("no-limit", 0, 300, -300)


def test_reserved_payments_can_push_category_over(api):
    anna = create_family(api)
    set_budget(anna, 10000, {"food": 1000})
    add_expense(anna, 600, "food")
    add_payment(anna, 500, "food")
    food = category(summary(anna), "food")
    assert (food["status"], food["overByExpenses"], food["left"]) == ("over", False, -100)


def test_over_budget_gives_negative_balance(api):
    anna = create_family(api)
    set_budget(anna, 1000, {"food": 500})
    add_expense(anna, 1500, "food")
    s = summary(anna)
    assert (s["leftByPlan"], s["freeByPlan"]) == (-500, -500)


def test_summary_validation(api):
    anna = create_family(api)
    assert_error(anna.get("/api/months/2026-00/summary"), 422, field="month")


def check(m, amount, cat=None, month=MONTH):
    r = m.post(f"/api/months/{month}/purchase-check", {"amount": amount, "category": cat})
    assert r.status_code == 200, r.text
    return r.json()


def test_purchase_check_verdicts(api):
    anna = create_family(api)
    set_budget(anna, 10000, {"other": 1000})
    add_payment(anna, 2000, "housing", "Коммуналка")
    # свободно: 10000 − 2000 зарезервировано = 8000; «тесно» — если останется меньше 5% плана (500)
    ok = check(anna, 100, "other")
    assert set(ok) == {"verdict", "amount", "freeBefore", "freeAfter", "category", "categoryLeftAfter", "reservedPayments"}
    assert (ok["verdict"], ok["freeBefore"], ok["freeAfter"], ok["categoryLeftAfter"]) == ("ok", 8000, 7900, 900)
    assert [p["title"] for p in ok["reservedPayments"]] == ["Коммуналка"]
    assert check(anna, 7600)["verdict"] == "tight"
    assert check(anna, 1500, "other")["verdict"] == "category-over"
    assert check(anna, 8000.01)["verdict"] == "not-enough"
    # Категория без лимита не ограничивает
    no_limit = check(anna, 100, "food")
    assert (no_limit["verdict"], no_limit["categoryLeftAfter"]) == ("ok", None)
    assert check(anna, 100)["category"] is None


def test_purchase_check_without_budget(api):
    anna = create_family(api)
    assert check(anna, 1)["verdict"] == "not-enough"


def test_purchase_check_validation(api):
    anna = create_family(api)
    url = f"/api/months/{MONTH}/purchase-check"
    assert_error(anna.post(url, {"amount": 0}), 422, field="amount")
    assert_error(anna.post(url, {"amount": 10, "category": "pets"}), 422, field="category")
    assert_error(anna.post("/api/months/bad/purchase-check", {"amount": 10}), 422, field="month")


def test_purchase_check_does_not_change_data(api):
    anna = create_family(api)
    set_budget(anna, 1000, {})
    before = anna.get("/api/state").json()
    check(anna, 500)
    assert anna.get("/api/state").json() == before
