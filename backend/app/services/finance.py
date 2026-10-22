"""Бюджеты, расходы и обязательные платежи семьи. Все операции — в пределах семьи участника."""
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from .. import clock
from ..domain.budget import MonthSummary, compute_month_summary
from ..config import get_settings
from ..errors import Conflict, Forbidden, NotFound, ValidationFailed
from ..models import Budget, Expense, Member, Payment, now_ms
from ..schemas import BudgetIn, ExpenseIn, PaymentIn
from ..validation import (
    CATEGORIES,
    amount_to_kop,
    check_category,
    check_month_key,
    clean_title,
    month_bounds,
    parse_date,
    shift_month,
)

# ── Бюджет ──


async def save_budget(db: AsyncSession, member: Member, month_key: str, body: BudgetIn) -> Budget:
    check_month_key(month_key)
    total = amount_to_kop(body.total_amount, "total")
    unknown = set(body.category_plans) - set(CATEGORIES)
    if unknown:
        raise ValidationFailed("Неизвестная категория", sorted(unknown)[0])
    plans = {c: amount_to_kop(body.category_plans.get(c, 0), c, allow_zero=True) for c in CATEGORIES}
    if sum(plans.values()) > total:
        raise ValidationFailed("Сумма лимитов больше общего бюджета", "total")

    # Атомарный upsert: два участника, одновременно создающие бюджет месяца, не получат ошибку
    values = {
        "family_id": member.family_id,
        "month_key": month_key,
        "total_kop": total,
        "category_plans_kop": plans,
        "updated_at": now_ms(),
        "updated_by": member.id,
    }
    stmt = insert(Budget).values(**values)
    stmt = stmt.on_conflict_do_update(
        index_elements=[Budget.family_id, Budget.month_key],
        set_={k: stmt.excluded[k] for k in ("total_kop", "category_plans_kop", "updated_at", "updated_by")},
    )
    await db.execute(stmt)
    return await db.get(Budget, (member.family_id, month_key), populate_existing=True)


async def list_budgets(db: AsyncSession, family_id: str) -> list[Budget]:
    return list(await db.scalars(select(Budget).where(Budget.family_id == family_id).order_by(Budget.month_key)))


# ── Потолок объёма ──


async def _check_capacity(db: AsyncSession, model, family_id: str, adding: int = 1) -> None:
    """Одна семья не может бесконечно раздувать базу и ответ /state (защита от злоупотреблений)."""
    limit = get_settings().max_records_per_family
    count = await db.scalar(select(func.count()).select_from(model).where(model.family_id == family_id))
    if count + adding > limit:
        raise Conflict(f"Достигнут предел: не больше {limit} записей. Удалите старые записи.")


# ── Расходы ──


async def list_expenses(db: AsyncSession, family_id: str, month_key: str | None = None) -> list[Expense]:
    q = select(Expense).where(Expense.family_id == family_id)
    if month_key:
        start, end = month_bounds(check_month_key(month_key, "month"))
        q = q.where(Expense.date >= start, Expense.date < end)
    return list(await db.scalars(q.order_by(Expense.date.desc(), Expense.created_at.desc())))


async def _get_expense(db: AsyncSession, member: Member, expense_id: str) -> Expense:
    expense = await db.get(Expense, expense_id)
    if expense is None or expense.family_id != member.family_id:
        raise NotFound("Расход не найден — возможно, его уже удалили")
    return expense


async def create_expense(db: AsyncSession, member: Member, body: ExpenseIn) -> Expense:
    await _check_capacity(db, Expense, member.family_id)
    expense = Expense(
        family_id=member.family_id,
        title=clean_title(body.title),
        amount_kop=amount_to_kop(body.amount),
        category=check_category(body.category),
        date=parse_date(body.date),
        author_id=member.id,
    )
    db.add(expense)
    await db.flush()
    await db.refresh(expense, ["author"])
    return expense


async def update_expense(db: AsyncSession, member: Member, expense_id: str, body: ExpenseIn) -> Expense:
    expense = await _get_expense(db, member, expense_id)
    if expense.author_id != member.id:
        raise Forbidden("Изменять можно только свои расходы")
    expense.title = clean_title(body.title)
    expense.amount_kop = amount_to_kop(body.amount)
    expense.category = check_category(body.category)
    expense.date = parse_date(body.date)
    await db.flush()
    return expense


async def delete_expense(db: AsyncSession, member: Member, expense_id: str) -> None:
    expense = await db.get(Expense, expense_id)
    if expense is None or expense.family_id != member.family_id:
        return  # уже удалён — повторное удаление не ошибка
    if expense.author_id != member.id:
        raise Forbidden("Удалять можно только свои расходы")
    # Расход из оплаченного платежа: платёж возвращается в «Предстоит»
    if expense.payment_id:
        payment = await db.get(Payment, expense.payment_id)
        if payment:
            payment.status = "upcoming"
    await db.delete(expense)
    await db.flush()


# ── Обязательные платежи ──


async def list_payments(db: AsyncSession, family_id: str, month_key: str | None = None) -> list[Payment]:
    q = select(Payment).where(Payment.family_id == family_id)
    if month_key:
        start, end = month_bounds(check_month_key(month_key, "month"))
        q = q.where(Payment.due_date >= start, Payment.due_date < end)
    return list(await db.scalars(q.order_by(Payment.due_date, Payment.created_at)))


async def _get_payment(db: AsyncSession, member: Member, payment_id: str, lock: bool = False) -> Payment | None:
    # lock: SELECT ... FOR UPDATE — одновременные «Оплачен» от двух участников выполнятся по очереди
    payment = await db.get(Payment, payment_id, with_for_update=lock, populate_existing=lock)
    if payment is None or payment.family_id != member.family_id:
        return None
    return payment


async def create_payment(db: AsyncSession, member: Member, body: PaymentIn) -> Payment:
    await _check_capacity(db, Payment, member.family_id)
    payment = Payment(
        family_id=member.family_id,
        title=clean_title(body.title),
        amount_kop=amount_to_kop(body.amount),
        category=check_category(body.category),
        due_date=parse_date(body.due_date, "dueDate"),
        status="upcoming",
        author_id=member.id,
    )
    db.add(payment)
    await db.flush()
    await db.refresh(payment, ["expense"])
    return payment


async def update_payment(db: AsyncSession, member: Member, payment_id: str, body: PaymentIn) -> Payment:
    payment = await _get_payment(db, member, payment_id)
    if payment is None:
        raise NotFound("Платёж не найден — возможно, его уже удалили")
    if payment.status == "paid":
        raise ValidationFailed("Платёж уже оплачен. Сначала верните его в предстоящие.")
    payment.title = clean_title(body.title)
    payment.amount_kop = amount_to_kop(body.amount)
    payment.category = check_category(body.category)
    payment.due_date = parse_date(body.due_date, "dueDate")
    await db.flush()
    return payment


async def delete_payment(db: AsyncSession, member: Member, payment_id: str) -> None:
    payment = await _get_payment(db, member, payment_id)
    if payment is None:
        return
    if payment.status == "paid":
        raise ValidationFailed("Платёж уже оплачен. Сначала верните его в предстоящие.")
    await db.delete(payment)
    await db.flush()


async def set_payment_paid(
    db: AsyncSession, member: Member, payment_id: str, paid: bool
) -> tuple[Payment, Expense | None]:
    """
    Оплачен → платёж перестаёт быть резервом и становится фактическим расходом (учитывается один раз).
    Не оплачен → связанный расход удаляется, сумма снова резервируется.
    """
    payment = await _get_payment(db, member, payment_id, lock=True)
    if payment is None:
        raise NotFound("Платёж не найден")

    if paid:
        if payment.status == "paid":
            return payment, None
        await _check_capacity(db, Expense, payment.family_id)
        today = clock.today()
        same_month = payment.due_date.strftime("%Y-%m") == today.strftime("%Y-%m")
        expense = Expense(
            family_id=payment.family_id,
            title=payment.title,
            amount_kop=payment.amount_kop,
            category=payment.category,
            date=today if same_month else payment.due_date,
            author_id=member.id,
            payment_id=payment.id,
        )
        payment.status = "paid"
        db.add(expense)
        await db.flush()
        await db.refresh(expense, ["author"])
        await db.refresh(payment, ["expense"])
        return payment, expense

    if payment.status == "upcoming":
        return payment, None
    if payment.expense is not None:
        await db.delete(payment.expense)
    payment.status = "upcoming"
    await db.flush()
    await db.refresh(payment, ["expense"])
    return payment, None


async def copy_payments_from_previous_month(db: AsyncSession, member: Member, month_key: str) -> list[Payment]:
    """Перенести платежи прошлого месяца в этот как предстоящие (кроме уже заведённых с тем же названием)."""
    check_month_key(month_key)
    existing = {p.title for p in await list_payments(db, member.family_id, month_key)}
    previous = await list_payments(db, member.family_id, shift_month(month_key, -1))
    await _check_capacity(db, Payment, member.family_id, adding=len(previous))
    copies = []
    for p in previous:
        if p.title in existing:
            continue
        existing.add(p.title)
        copy = Payment(
            family_id=member.family_id,
            title=p.title,
            amount_kop=p.amount_kop,
            category=p.category,
            due_date=_move_to_month(p.due_date, month_key),
            status="upcoming",
            author_id=member.id,
        )
        db.add(copy)
        copies.append(copy)
    await db.flush()
    for c in copies:
        await db.refresh(c, ["expense"])
    return copies


def _move_to_month(d, month_key: str):
    """Тот же день в другом месяце; 31-е в коротком месяце → последний день."""
    start, end = month_bounds(month_key)
    last_day = (end.toordinal() - start.toordinal())
    return start.replace(day=min(d.day, last_day))


# ── Сводка месяца ──


async def month_summary(db: AsyncSession, family_id: str, month_key: str) -> MonthSummary:
    check_month_key(month_key, "month")
    budget = await db.get(Budget, (family_id, month_key))
    expenses = await list_expenses(db, family_id, month_key)
    payments = await list_payments(db, family_id, month_key)
    return compute_month_summary(month_key, budget, expenses, payments)
