from fastapi import APIRouter, Query, Request, Response

from ..deps import CurrentMember, Db, IdempotencyKey, ParentMember, mark_silent
from .. import presenters
from ..domain.budget import check_purchase
from ..errors import NotFound
from ..models import Budget
from ..schemas import (
    BudgetIn,
    BudgetOut,
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
from ..validation import amount_to_kop, check_category, check_month_key

router = APIRouter()


def _dump(model) -> dict:
    return model.model_dump(mode="json", by_alias=True)


# ── Бюджет ──


@router.get("/budgets", response_model=list[BudgetOut], tags=["budget"])
async def list_budgets(member: ParentMember, db: Db):
    return [BudgetOut.of(b) for b in await finance.list_budgets(db, member.family_id)]


@router.get("/budgets/{month_key}", response_model=BudgetOut, tags=["budget"])
async def get_budget(month_key: str, member: ParentMember, db: Db):
    budget = await db.get(Budget, (member.family_id, check_month_key(month_key)))
    if budget is None:
        raise NotFound("Бюджет на этот месяц ещё не настроен")
    return BudgetOut.of(budget)


@router.put("/budgets/{month_key}", response_model=BudgetOut, tags=["budget"], summary="Создать или изменить бюджет месяца")
async def save_budget(month_key: str, body: BudgetIn, member: ParentMember, db: Db, idem: IdempotencyKey = None):
    async def action():
        return _dump(BudgetOut.of(await finance.save_budget(db, member, month_key, body)))

    fp = idempotency.fingerprint("PUT budget", month_key, _dump(body))
    return await idempotency.run(db, member.id, idem, fp, action)


# ── Расходы ──


@router.get("/expenses", response_model=list[ExpenseOut], tags=["expenses"])
async def list_expenses(member: CurrentMember, db: Db, month: str | None = Query(None, description="YYYY-MM")):
    # Ребёнок видит только свои расходы
    author = None if member.is_parent else member.id
    return [ExpenseOut.of(e) for e in await finance.list_expenses(db, member.family_id, month, author_id=author)]


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
async def list_payments(member: ParentMember, db: Db, month: str | None = Query(None, description="YYYY-MM")):
    return [PaymentOut.of(p) for p in await finance.list_payments(db, member.family_id, month)]


@router.post("/payments", response_model=PaymentOut, status_code=201, tags=["payments"])
async def create_payment(body: PaymentIn, member: ParentMember, db: Db, idem: IdempotencyKey = None):
    async def action():
        return _dump(PaymentOut.of(await finance.create_payment(db, member, body)))

    return await idempotency.run(db, member.id, idem, idempotency.fingerprint("POST payment", _dump(body)), action)


@router.put("/payments/{payment_id}", response_model=PaymentOut, tags=["payments"])
async def update_payment(payment_id: str, body: PaymentIn, member: ParentMember, db: Db, idem: IdempotencyKey = None):
    async def action():
        return _dump(PaymentOut.of(await finance.update_payment(db, member, payment_id, body)))

    fp = idempotency.fingerprint("PUT payment", payment_id, _dump(body))
    return await idempotency.run(db, member.id, idem, fp, action)


@router.delete("/payments/{payment_id}", status_code=204, tags=["payments"])
async def delete_payment(payment_id: str, member: ParentMember, db: Db):
    await finance.delete_payment(db, member, payment_id)
    await db.commit()
    return Response(status_code=204)


@router.post("/payments/{payment_id}/paid", response_model=PaymentPaidOut, tags=["payments"],
             summary="Отметить оплаченным (paid=true) или вернуть в предстоящие (paid=false)")
async def set_payment_paid(payment_id: str, body: PaymentPaidIn, member: ParentMember, db: Db):
    payment, expense = await finance.set_payment_paid(db, member, payment_id, body.paid)
    out = PaymentPaidOut(payment=PaymentOut.of(payment), expense=ExpenseOut.of(expense) if expense else None)
    await db.commit()
    return out


@router.post("/payments/copy-previous-month", response_model=CopyPaymentsOut, tags=["payments"])
async def copy_payments(body: CopyPaymentsIn, member: ParentMember, db: Db, idem: IdempotencyKey = None):
    async def action():
        copies = await finance.copy_payments_from_previous_month(db, member, body.month_key)
        return _dump(CopyPaymentsOut(added=len(copies), payments=[PaymentOut.of(p) for p in copies]))

    fp = idempotency.fingerprint("copy payments", body.month_key)
    return await idempotency.run(db, member.id, idem, fp, action)


# ── Сводка и проверка покупки ──


@router.get("/months/{month_key}/summary", response_model=MonthSummaryOut, tags=["summary"],
            summary="Бюджет, потрачено, зарезервировано и остатки за месяц")
async def month_summary(month_key: str, member: ParentMember, db: Db):
    return presenters.summary_out(await finance.month_summary(db, member.family_id, month_key))


@router.post("/months/{month_key}/purchase-check", response_model=PurchaseCheckOut, tags=["summary"],
             summary="Можем ли позволить покупку с учётом будущих платежей")
async def purchase_check(month_key: str, body: PurchaseCheckIn, request: Request, member: ParentMember, db: Db):
    mark_silent(request)
    amount = amount_to_kop(body.amount)
    category = check_category(body.category) if body.category else None
    summary = await finance.month_summary(db, member.family_id, month_key)
    return presenters.purchase_check_out(check_purchase(summary, amount, category))
