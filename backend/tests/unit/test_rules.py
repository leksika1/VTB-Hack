"""Чистые функции: расчёт месяца и проверки ввода. Быстрые, без сервера."""
from datetime import date

import pytest

from app.domain.budget import category_status, check_purchase, compute_month_summary
from app.errors import ValidationFailed
from app.models import Budget, Expense, Payment
from app.validation import amount_to_kop, month_bounds, normalize_invite_code, shift_month


def expense(amount_kop, category="food", day=1, created=0):
    return Expense(amount_kop=amount_kop, category=category, date=date(2026, 3, day), created_at=created)


def payment(amount_kop, category="housing", status="upcoming", day=1):
    return Payment(amount_kop=amount_kop, category=category, status=status, due_date=date(2026, 3, day), created_at=0)


@pytest.mark.parametrize("plan,spent,reserved,status", [
    (0, 100, 0, "no-limit"),
    (1000, 0, 0, "no-spend"),
    (1000, 840, 0, "ok"),
    (1000, 850, 0, "near"),
    (1000, 500, 350, "near"),
    (1000, 1000, 0, "near"),
    (1000, 1001, 0, "over"),
    (1000, 600, 500, "over"),
])
def test_category_status(plan, spent, reserved, status):
    assert category_status(plan, spent, reserved) == status


def test_month_summary_counts_paid_payment_once():
    budget = Budget(total_kop=100_000, category_plans_kop={"food": 30_000, "housing": 50_000})
    s = compute_month_summary(
        "2026-03", budget,
        [expense(10_000), expense(40_000, "housing")],
        [payment(40_000, status="paid"), payment(5_000, "other")],
    )
    assert (s.plan, s.spent, s.reserved, s.left_by_plan, s.free_by_plan, s.unallocated) == (
        100_000, 50_000, 5_000, 50_000, 45_000, 20_000)
    assert [p.amount_kop for p in s.upcoming_payments] == [5_000]
    assert [p.amount_kop for p in s.paid_payments] == [40_000]


def test_expenses_sorted_newest_first():
    s = compute_month_summary("2026-03", None, [expense(1, day=1), expense(2, day=5, created=1), expense(3, day=5, created=2)], [])
    assert [e.amount_kop for e in s.expenses] == [3, 2, 1]
    assert s.has_budget is False


def test_purchase_check_thresholds():
    budget = Budget(total_kop=10_000, category_plans_kop={"other": 1_000})
    s = compute_month_summary("2026-03", budget, [], [])
    assert check_purchase(s, 9_500, None).verdict == "ok"        # остаётся ровно 5%
    assert check_purchase(s, 9_501, None).verdict == "tight"
    assert check_purchase(s, 10_001, None).verdict == "not-enough"
    assert check_purchase(s, 1_001, "other").verdict == "category-over"
    assert check_purchase(s, 1_000, "other").verdict == "ok"


@pytest.mark.parametrize("value,kop", [(1, 100), (0.1, 10), (1270.5, 127050), (6850.4, 685040), (0.29, 29)])
def test_amount_to_kop(value, kop):
    assert amount_to_kop(value) == kop


@pytest.mark.parametrize("value", [0, -1, 0.001, float("nan"), float("inf"), 100_000_000.01, True])
def test_amount_to_kop_rejects(value):
    with pytest.raises(ValidationFailed):
        amount_to_kop(value)


def test_month_helpers():
    assert shift_month("2026-01", -1) == "2025-12"
    assert shift_month("2026-12", 1) == "2027-01"
    assert month_bounds("2026-12") == (date(2026, 12, 1), date(2027, 1, 1))
    assert normalize_invite_code(" ab3d9z ") == "AB3D9Z"
