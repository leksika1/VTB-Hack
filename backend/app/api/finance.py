from fastapi import APIRouter, Query, Request, Response

from ..deps import CurrentMember, Db, IdempotencyKey, mark_silent
from ..domain.budget import CategorySummary, MonthSummary, check_purchase
from ..errors import NotFound
from ..models import Budget
from ..schemas import (
    BudgetIn,
    BudgetOut,
    CategorySummaryOut,
    CopyPaymentsIn,
    CopyPaymentsOut,
    ExpenseIn,
    ExpenseOut,
    MonthSummaryOut,
    PaymentIn,
    PaymentOut,
    PaymentPaidIn,
    PaymentPaidOut,
    PurchaseCheckIn,
    PurchaseCheckOut,
)
from ..services import finance, idempotency
from ..validation import amount_to_kop, check_category, check_month_key, kop_to_amount

router = APIRouter()


def _dump(model) -> dict:
    return model.model_dump(mode="json", by_alias=True)


# ── Бюджет ──


@router.get("/budgets", response_model=list[BudgetOut], tags=["budget"])
async def list_budgets(member: CurrentMember, db: Db):
    return [BudgetOut.of(b) for b in await finance.list_budgets(db, member.family_id)]


@router.get("/budgets/{month_key}", response_model=BudgetOut, tags=["budget"])
async def get_budget(month_key: str, member: CurrentMember, db: Db):
    budget = await db.get(Budget, (member.family_id, check_month_key(month_key)))
    if budget is None:
        raise NotFound("Бюджет на этот месяц ещё не настроен")
    return BudgetOut.of(budget)


@router.put("/budgets/{month_key}", response_model=BudgetOut, tags=["budget"], summary="Создать или изменить бюджет месяца")
async def save_budget(month_key: str, body: BudgetIn, member: CurrentMember, db: Db, idem: IdempotencyKey = None):
    async def action():
        return _dump(BudgetOut.of(await finance.save_budget(db, member, month_key, body)))

    fp = idempotency.fingerprint("PUT budget", month_key, _dump(body))
    return await idempotency.run(db, member.id, idem, fp, action)


# ── Расходы ──


@router.get("/expenses", response_model=list[ExpenseOut], tags=["expenses"])
async def list_expenses(member: CurrentMember, db: Db, month: str | None = Query(None, description="YYYY-MM")):
    return [ExpenseOut.of(e) for e in await finance.list_expenses(db, member.family_id, month)]


@router.post("/expenses", response_model=ExpenseOut, status_code=201, tags=["expenses"])
async def create_expense(body: ExpenseIn, member: CurrentMember, db: Db, idem: IdempotencyKey = None):
    async def action():
        return _dump(ExpenseOut.of(await finance.create_expense(db, member, body)))

    return await idempotency.run(db, member.id, idem, idempotency.fingerprint("POST expense", _dump(body)), action)


@router.put("/expenses/{expense_id}", response_model=ExpenseOut, tags=["expenses"])
async def update_expense(expense_id: str, body: ExpenseIn, member: CurrentMember, db: Db, idem: IdempotencyKey = None):
    async def action():
        return _dump(ExpenseOut.of(await finance.update_expense(db, member, expense_id, body)))

    fp = idempotency.fingerprint("PUT expense", expense_id, _dump(body))
    return await idempotency.run(db, member.id, idem, fp, action)


@router.delete("/expenses/{expense_id}", status_code=204, tags=["expenses"])
async def delete_expense(expense_id: str, member: CurrentMember, db: Db):
    await finance.delete_expense(db, member, expense_id)
    await db.commit()
    return Response(status_code=204)


# ── Обязательные платежи ──


@router.get("/payments", response_model=list[PaymentOut], tags=["payments"])
async def list_payments(member: CurrentMember, db: Db, month: str | None = Query(None, description="YYYY-MM")):
    return [PaymentOut.of(p) for p in await finance.list_payments(db, member.family_id, month)]


@router.post("/payments", response_model=PaymentOut, status_code=201, tags=["payments"])
async def create_payment(body: PaymentIn, member: CurrentMember, db: Db, idem: IdempotencyKey = None):
    async def action():
        return _dump(PaymentOut.of(await finance.create_payment(db, member, body)))

    return await idempotency.run(db, member.id, idem, idempotency.fingerprint("POST payment", _dump(body)), action)


@router.put("/payments/{payment_id}", response_model=PaymentOut, tags=["payments"])
async def update_payment(payment_id: str, body: PaymentIn, member: CurrentMember, db: Db, idem: IdempotencyKey = None):
    async def action():
        return _dump(PaymentOut.of(await finance.update_payment(db, member, payment_id, body)))

    fp = idempotency.fingerprint("PUT payment", payment_id, _dump(body))
    return await idempotency.run(db, member.id, idem, fp, action)


@router.delete("/payments/{payment_id}", status_code=204, tags=["payments"])
async def delete_payment(payment_id: str, member: CurrentMember, db: Db):
    await finance.delete_payment(db, member, payment_id)
    await db.commit()
    return Response(status_code=204)


@router.post("/payments/{payment_id}/paid", response_model=PaymentPaidOut, tags=["payments"],
             summary="Отметить оплаченным (paid=true) или вернуть в предстоящие (paid=false)")
async def set_payment_paid(payment_id: str, body: PaymentPaidIn, member: CurrentMember, db: Db):
    payment, expense = await finance.set_payment_paid(db, member, payment_id, body.paid)
    out = PaymentPaidOut(payment=PaymentOut.of(payment), expense=ExpenseOut.of(expense) if expense else None)
    await db.commit()
    return out


@router.post("/payments/copy-previous-month", response_model=CopyPaymentsOut, tags=["payments"])
async def copy_payments(body: CopyPaymentsIn, member: CurrentMember, db: Db, idem: IdempotencyKey = None):
    async def action():
        copies = await finance.copy_payments_from_previous_month(db, member, body.month_key)
        return _dump(CopyPaymentsOut(added=len(copies), payments=[PaymentOut.of(p) for p in copies]))

    fp = idempotency.fingerprint("copy payments", body.month_key)
    return await idempotency.run(db, member.id, idem, fp, action)


# ── Сводка и проверка покупки ──


def _category_out(c: CategorySummary) -> CategorySummaryOut:
    return CategorySummaryOut(
        key=c.key,
        plan=kop_to_amount(c.plan),
        spent=kop_to_amount(c.spent),
        reserved=kop_to_amount(c.reserved),
        left=kop_to_amount(c.left),
        status=c.status,
        over_by_expenses=c.over_by_expenses,
    )


def _summary_out(s: MonthSummary) -> MonthSummaryOut:
    return MonthSummaryOut(
        month_key=s.month_key,
        has_budget=s.has_budget,
        plan=kop_to_amount(s.plan),
        spent=kop_to_amount(s.spent),
        reserved=kop_to_amount(s.reserved),
        left_by_plan=kop_to_amount(s.left_by_plan),
        free_by_plan=kop_to_amount(s.free_by_plan),
        unallocated=kop_to_amount(s.unallocated),
        categories=[_category_out(c) for c in s.categories],
        upcoming_payments=[PaymentOut.of(p) for p in s.upcoming_payments],
        paid_payments=[PaymentOut.of(p) for p in s.paid_payments],
        expenses=[ExpenseOut.of(e) for e in s.expenses],
    )


@router.get("/months/{month_key}/summary", response_model=MonthSummaryOut, tags=["summary"],
            summary="Бюджет, потрачено, зарезервировано и остатки за месяц")
async def month_summary(month_key: str, member: CurrentMember, db: Db):
    return _summary_out(await finance.month_summary(db, member.family_id, month_key))


@router.post("/months/{month_key}/purchase-check", response_model=PurchaseCheckOut, tags=["summary"],
             summary="Можем ли позволить покупку с учётом будущих платежей")
async def purchase_check(month_key: str, body: PurchaseCheckIn, request: Request, member: CurrentMember, db: Db):
    mark_silent(request)
    amount = amount_to_kop(body.amount)
    category = check_category(body.category) if body.category else None
    summary = await finance.month_summary(db, member.family_id, month_key)
    result = check_purchase(summary, amount, category)
    return PurchaseCheckOut(
        verdict=result.verdict,
        amount=kop_to_amount(result.amount),
        free_before=kop_to_amount(result.free_before),
        free_after=kop_to_amount(result.free_after),
        category=_category_out(result.category) if result.category else None,
        category_left_after=kop_to_amount(result.category_left_after) if result.category_left_after is not None else None,
        reserved_payments=[PaymentOut.of(p) for p in result.reserved_payments],
    )
