"""
Расчёт месяца — серверная копия frontend/src/domain/budget.ts (правила должны совпадать).

  «Потрачено»          = сумма фактических расходов месяца.
  «Зарезервировано»    = неоплаченные обязательные платежи месяца. Оплаченный платёж уже стал расходом
                         и второй раз не считается.
  «Осталось по плану»  = план − потрачено.
  «Свободно по плану»  = план − потрачено − зарезервировано: столько можно потратить на новое.

Всё считается в копейках (int), рубли получаются только на выходе.
"""
from dataclasses import dataclass, field

from ..models import Budget, Expense, Payment
from ..validation import CATEGORIES

NEAR_LIMIT_SHARE = 0.85
TIGHT_CUSHION_SHARE = 0.05


@dataclass
class CategorySummary:
    key: str
    plan: int
    spent: int
    reserved: int
    left: int
    status: str
    over_by_expenses: bool


@dataclass
class MonthSummary:
    month_key: str
    has_budget: bool
    plan: int
    spent: int
    reserved: int
    left_by_plan: int
    free_by_plan: int
    unallocated: int
    categories: list[CategorySummary]
    upcoming_payments: list[Payment] = field(default_factory=list)
    paid_payments: list[Payment] = field(default_factory=list)
    expenses: list[Expense] = field(default_factory=list)


@dataclass
class PurchaseCheck:
    verdict: str
    amount: int
    free_before: int
    free_after: int
    category: CategorySummary | None
    category_left_after: int | None
    reserved_payments: list[Payment]


def category_status(plan: int, spent: int, reserved: int) -> str:
    used = spent + reserved
    if plan <= 0:
        return "no-limit"
    if used == 0:
        return "no-spend"
    if used > plan:
        return "over"
    if used >= plan * NEAR_LIMIT_SHARE:
        return "near"
    return "ok"


def compute_month_summary(
    month_key: str, budget: Budget | None, expenses: list[Expense], payments: list[Payment]
) -> MonthSummary:
    """expenses и payments — уже отфильтрованные по семье и месяцу."""
    expenses = sorted(expenses, key=lambda e: (e.date, e.created_at), reverse=True)
    payments = sorted(payments, key=lambda p: (p.due_date, p.created_at))
    upcoming = [p for p in payments if p.status == "upcoming"]
    paid = [p for p in payments if p.status == "paid"]

    spent_by = dict.fromkeys(CATEGORIES, 0)
    for e in expenses:
        spent_by[e.category] += e.amount_kop
    reserved_by = dict.fromkeys(CATEGORIES, 0)
    for p in upcoming:
        reserved_by[p.category] += p.amount_kop

    plans = budget.category_plans_kop if budget else {}
    categories = []
    for key in CATEGORIES:
        plan = plans.get(key, 0)
        spent, reserved = spent_by[key], reserved_by[key]
        categories.append(
            CategorySummary(
                key=key,
                plan=plan,
                spent=spent,
                reserved=reserved,
                left=plan - spent - reserved,
                status=category_status(plan, spent, reserved),
                over_by_expenses=plan > 0 and spent > plan,
            )
        )

    total = budget.total_kop if budget else 0
    spent = sum(c.spent for c in categories)
    reserved = sum(c.reserved for c in categories)
    allocated = sum(plans.get(k, 0) for k in CATEGORIES)
    return MonthSummary(
        month_key=month_key,
        has_budget=budget is not None,
        plan=total,
        spent=spent,
        reserved=reserved,
        left_by_plan=total - spent,
        free_by_plan=total - spent - reserved,
        unallocated=total - allocated,
        categories=categories,
        upcoming_payments=upcoming,
        paid_payments=paid,
        expenses=expenses,
    )


def check_purchase(summary: MonthSummary, amount: int, category: str | None) -> PurchaseCheck:
    """«Можем ли мы это купить?» с учётом ещё не оплаченных обязательных платежей."""
    free_after = summary.free_by_plan - amount
    cat = next((c for c in summary.categories if c.key == category), None) if category else None
    category_left_after = cat.left - amount if cat and cat.plan > 0 else None

    verdict = "ok"
    if free_after < 0:
        verdict = "not-enough"
    elif category_left_after is not None and category_left_after < 0:
        verdict = "category-over"
    elif free_after < summary.plan * TIGHT_CUSHION_SHARE:
        verdict = "tight"

    return PurchaseCheck(
        verdict=verdict,
        amount=amount,
        free_before=summary.free_by_plan,
        free_after=free_after,
        category=cat,
        category_left_after=category_left_after,
        reserved_payments=summary.upcoming_payments,
    )
