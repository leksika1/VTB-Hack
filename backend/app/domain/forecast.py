"""
Прогноз трат на конец месяца (docs/FEATURES.md §5). Чистые функции, всё в копейках.

«Обязательные» траты — расходы из оплаченных платежей и ещё не оплаченные платежи месяца.
«Текущие» — остальные расходы; их средний темп в день переносится на оставшиеся дни.
"""
import calendar
from dataclasses import dataclass
from datetime import date

from ..models import Budget, Expense, Payment
from ..validation import CATEGORIES

LOW_CONFIDENCE_DAYS = 5


@dataclass
class CategoryForecast:
    key: str
    plan: int
    spent: int
    projected: int
    status: str  # ok | over | no-limit


@dataclass
class Forecast:
    month_key: str
    kind: str  # past | current | future
    plan: int
    spent: int
    reserved: int
    variable_spent: int
    daily_average: int
    days_passed: int
    days_in_month: int
    projected_spent: int
    projected_left: int
    low_confidence: bool
    categories: list[CategoryForecast]


def _kind(month_key: str, today: date) -> str:
    current = today.strftime("%Y-%m")
    return "current" if month_key == current else ("past" if month_key < current else "future")


def compute_forecast(
    month_key: str, today: date, budget: Budget | None, expenses: list[Expense], payments: list[Payment]
) -> Forecast:
    """expenses и payments — уже за этот месяц и этой семьи."""
    year, month = map(int, month_key.split("-"))
    days_in_month = calendar.monthrange(year, month)[1]
    kind = _kind(month_key, today)
    days_passed = {"past": days_in_month, "future": 0}.get(kind, today.day)
    days_left = days_in_month - days_passed

    plans = budget.category_plans_kop if budget else {}
    variable = dict.fromkeys(CATEGORIES, 0)
    fixed = dict.fromkeys(CATEGORIES, 0)
    for e in expenses:
        (fixed if e.payment_id else variable)[e.category] += e.amount_kop
    reserved = dict.fromkeys(CATEGORIES, 0)
    for p in payments:
        if p.status == "upcoming":
            reserved[p.category] += p.amount_kop

    def project(variable_kop: int) -> int:
        if kind != "current" or days_passed == 0:
            return variable_kop
        return variable_kop + round(variable_kop / days_passed * days_left)

    categories = []
    for key in CATEGORIES:
        projected = project(variable[key]) + fixed[key] + reserved[key]
        plan = plans.get(key, 0)
        status = "no-limit" if plan <= 0 else ("over" if projected > plan else "ok")
        categories.append(CategoryForecast(key, plan, variable[key] + fixed[key], projected, status))

    variable_total = sum(variable.values())
    total_plan = budget.total_kop if budget else 0
    projected_total = project(variable_total) + sum(fixed.values()) + sum(reserved.values())
    return Forecast(
        month_key=month_key,
        kind=kind,
        plan=total_plan,
        spent=variable_total + sum(fixed.values()),
        reserved=sum(reserved.values()),
        variable_spent=variable_total,
        daily_average=round(variable_total / days_passed) if days_passed else 0,
        days_passed=days_passed,
        days_in_month=days_in_month,
        projected_spent=projected_total,
        projected_left=total_plan - projected_total,
        low_confidence=kind == "current" and days_passed < LOW_CONFIDENCE_DAYS,
        categories=categories,
    )
