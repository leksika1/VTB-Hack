"""Перевод доменных расчётов (копейки) в ответы API (рубли). Общий для нескольких роутов."""
from .domain.budget import CategorySummary, MonthSummary, PurchaseCheck
from .schemas import CategorySummaryOut, ExpenseOut, MonthSummaryOut, PaymentOut, PurchaseCheckOut
from .validation import kop_to_amount


def category_out(c: CategorySummary) -> CategorySummaryOut:
    return CategorySummaryOut(
        key=c.key,
        plan=kop_to_amount(c.plan),
        spent=kop_to_amount(c.spent),
        reserved=kop_to_amount(c.reserved),
        left=kop_to_amount(c.left),
        status=c.status,
        over_by_expenses=c.over_by_expenses,
    )


def summary_out(s: MonthSummary, saved_kop: int = 0) -> MonthSummaryOut:
    return MonthSummaryOut(
        month_key=s.month_key,
        has_budget=s.has_budget,
        plan=kop_to_amount(s.plan),
        spent=kop_to_amount(s.spent),
        reserved=kop_to_amount(s.reserved),
        left_by_plan=kop_to_amount(s.left_by_plan),
        free_by_plan=kop_to_amount(s.free_by_plan),
        unallocated=kop_to_amount(s.unallocated),
        saved_this_month=kop_to_amount(saved_kop),
        categories=[category_out(c) for c in s.categories],
        upcoming_payments=[PaymentOut.of(p) for p in s.upcoming_payments],
        paid_payments=[PaymentOut.of(p) for p in s.paid_payments],
        expenses=[ExpenseOut.of(e) for e in s.expenses],
    )


def purchase_check_out(result: PurchaseCheck) -> PurchaseCheckOut:
    return PurchaseCheckOut(
        verdict=result.verdict,
        amount=kop_to_amount(result.amount),
        free_before=kop_to_amount(result.free_before),
        free_after=kop_to_amount(result.free_after),
        category=category_out(result.category) if result.category else None,
        category_left_after=kop_to_amount(result.category_left_after) if result.category_left_after is not None else None,
        reserved_payments=[PaymentOut.of(p) for p in result.reserved_payments],
    )
