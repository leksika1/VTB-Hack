"""Прогноз месяца и расчёты «кто кому должен» — чистые функции."""
from datetime import date

from app.domain.forecast import compute_forecast
from app.domain.settlement import compute_balances, split_evenly, transfers
from app.models import Budget, Expense, Payment


def e(kop, category="food", payment_id=None):
    return Expense(amount_kop=kop, category=category, payment_id=payment_id, date=date(2026, 3, 1), created_at=0)


def test_forecast_current_month_extrapolates_variable_only():
    budget = Budget(total_kop=100_000, category_plans_kop={"food": 30_000, "housing": 40_000})
    # 10 марта: 10 дней прошло, 21 осталось. Текущие 10 000 → 1 000/день → +21 000
    f = compute_forecast("2026-03", date(2026, 3, 10), budget,
                         [e(10_000), e(38_000, "housing", payment_id="rent")],
                         [Payment(amount_kop=5_000, category="housing", status="upcoming")])
    assert (f.kind, f.days_passed, f.days_in_month, f.daily_average) == ("current", 10, 31, 1_000)
    assert f.projected_spent == 10_000 + 21_000 + 38_000 + 5_000
    assert f.projected_left == 100_000 - 74_000
    food = next(c for c in f.categories if c.key == "food")
    housing = next(c for c in f.categories if c.key == "housing")
    assert (food.projected, food.status) == (31_000, "over")
    assert (housing.projected, housing.status) == (43_000, "over")
    assert not f.low_confidence


def test_forecast_past_future_and_low_confidence():
    past = compute_forecast("2026-02", date(2026, 3, 10), None, [e(500)], [])
    assert (past.kind, past.projected_spent, past.days_passed) == ("past", 500, 28)
    future = compute_forecast("2026-04", date(2026, 3, 10), None, [],
                              [Payment(amount_kop=700, category="kids", status="upcoming")])
    assert (future.kind, future.projected_spent, future.daily_average) == ("future", 700, 0)
    early = compute_forecast("2026-03", date(2026, 3, 2), None, [e(200)], [])
    assert early.low_confidence and early.projected_spent == 200 + 100 * 29


def test_split_evenly_keeps_every_kopeck():
    assert split_evenly(100, ["a", "b", "c"]) == {"a": 34, "b": 33, "c": 33}
    assert sum(split_evenly(1_000_001, ["a", "b", "c", "d"]).values()) == 1_000_001
    assert split_evenly(5, []) == {}


def test_balances_and_transfers():
    b = compute_balances(["anna", "boris", "vera"], {"anna": 9_000, "boris": 3_000}, [])
    assert [(x.member_id, x.share, x.balance) for x in b] == [
        ("anna", 4_000, 5_000), ("boris", 4_000, -1_000), ("vera", 4_000, -4_000)]
    assert transfers(b) == [("vera", "anna", 4_000), ("boris", "anna", 1_000)]
    # Отмеченный перевод закрывает долг
    after = compute_balances(["anna", "boris", "vera"], {"anna": 9_000, "boris": 3_000}, [("vera", "anna", 4_000)])
    assert transfers(after) == [("boris", "anna", 1_000)]
    assert sum(x.balance for x in after) == 0
