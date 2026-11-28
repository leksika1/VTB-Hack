from datetime import date

from app.models import Expense
from app.services.account import expense_shares
from app.services.recurring import next_due


def test_basis_point_split_keeps_every_kopeck_deterministically():
    expense = Expense(amount_kop=101, split_mode="shares", split_members=["a", "b", "c"],
                      split_shares={"a": 3334, "b": 3333, "c": 3333})
    assert expense_shares(expense) == {"a": 34, "b": 34, "c": 33}
    assert sum(expense_shares(expense).values()) == 101


def test_recurrence_periods_and_short_months():
    assert next_due(date(2026, 1, 31), {"frequency": "monthly", "interval": 1}) == date(2026, 2, 28)
    assert next_due(date(2026, 2, 28), {"frequency": "quarterly", "interval": 1}) == date(2026, 5, 28)
    assert next_due(date(2024, 2, 29), {"frequency": "yearly", "interval": 1}) == date(2025, 2, 28)
    assert next_due(date(2026, 1, 1), {"frequency": "custom", "interval": 10, "unit": "days"}) == date(2026, 1, 11)
