"""Бюджеты, расходы и обязательные платежи семьи. Все операции — в пределах семьи участника."""
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from .. import clock
from . import allowance, notifications, recurring
from ..domain.budget import MonthSummary, compute_month_summary
from ..config import get_settings
from ..errors import Conflict, Forbidden, NotFound, ValidationFailed
from ..receipts import parse_receipt
from ..models import AccountContribution, Budget, Expense, Family, Member, Payment, now_ms
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


async def check_capacity(db: AsyncSession, model, family_id: str, adding: int = 1) -> None:
    """Одна семья не может бесконечно раздувать базу и ответ /state (защита от злоупотреблений)."""
    limit = get_settings().max_records_per_family
    count = await db.scalar(select(func.count()).select_from(model).where(model.family_id == family_id))
    if count + adding > limit:
        raise Conflict(f"Достигнут предел: не больше {limit} записей. Удалите старые записи.")


# ── Расходы ──


async def list_expenses(
    db: AsyncSession, family_id: str, month_key: str | None = None, author_id: str | None = None
) -> list[Expense]:
    q = select(Expense).where(Expense.family_id == family_id)
    if author_id:
        q = q.where(Expense.author_id == author_id)
    if month_key:
        start, end = month_bounds(check_month_key(month_key, "month"))
        q = q.where(Expense.date >= start, Expense.date < end)
    return list(await db.scalars(q.order_by(Expense.date.desc(), Expense.created_at.desc())))


async def _get_expense(db: AsyncSession, member: Member, expense_id: str) -> Expense:
    expense = await db.get(Expense, expense_id)
    if expense is None or expense.family_id != member.family_id:
        raise NotFound("Расход не найден — возможно, его уже удалили")
    return expense


async def _payer(db: AsyncSession, member: Member, paid_by: str | None) -> str:
    """Кто платил (docs/FEATURES.md §7): взрослый указывает любого текущего взрослого, ребёнок — только себя."""
    if not paid_by or paid_by == member.id:
        return member.id
    payer = await db.get(Member, paid_by)
    if payer is None or payer.family_id != member.family_id or not payer.active:
        raise ValidationFailed("Участник не найден", "paidBy")
    if not member.is_parent or not payer.is_parent:
        raise ValidationFailed("Платившим можно указать только взрослого участника", "paidBy")
    return payer.id


def _check_can_modify(member: Member, expense: Expense, action: str) -> None:
    # Взрослый ведёт общий бюджет: исправляет любой расход семьи, в том числе внесённый партнёром или ребёнком
    if member.is_parent:
        return
    # Расход из одобренного запроса меняют взрослые: иначе ребёнок мог бы увеличить одобренную сумму
    if expense.request_id:
        raise Forbidden("Этот расход создан по одобренному запросу — изменить его может взрослый")
    if expense.author_id != member.id:
        raise Forbidden(f"{action} можно только свои расходы")


async def split_members(db: AsyncSession, family_id: str, mode: str | None) -> list[str] | None:
    if mode not in {"shared_split", "personal_split"}:
        return None
    members = await db.scalars(
        select(Member).where(Member.family_id == family_id, Member.role == "parent",
                             Member.left_at.is_(None), Member.status == "active")
        .order_by(Member.joined_at, Member.id)
    )
    return [member.id for member in members]


def _check_account_mode(member: Member, mode: str | None) -> None:
    if not member.is_parent and mode not in {None, "outside"}:
        raise Forbidden("Семейным счётом управляют взрослые участники")


def _validate_split_percentages(percentages: dict[str, int] | None, members: list[str] | None) -> None:
    if percentages is None:
        return
    if not members or not percentages or not set(percentages).issubset(members):
        raise ValidationFailed("Укажите доли взрослых участников семьи", "splitPercentages")
    if any(not 0 <= value <= 100 for value in percentages.values()) or sum(percentages.values()) != 100:
        raise ValidationFailed("Сумма долей должна быть 100%", "splitPercentages")


async def create_expense(db: AsyncSession, member: Member, body: ExpenseIn) -> Expense:
    _check_account_mode(member, body.account_mode)
    await check_capacity(db, Expense, member.family_id)
    amount = amount_to_kop(body.amount)
    on = parse_date(body.date)
    receipt_key = None
    if body.receipt:
        receipt_key = parse_receipt(body.receipt, "receipt").key
        if await find_by_receipt(db, member.family_id, receipt_key):
            raise Conflict("Этот чек уже добавлен", "receipt")
    if not member.is_parent:
        await allowance.check_child_spending(db, member, amount, on)
    members = await split_members(db, member.family_id, body.account_mode)
    _validate_split_percentages(body.split_percentages, members)
    expense = Expense(
        family_id=member.family_id,
        title=clean_title(body.title),
        amount_kop=amount,
        category=check_category(body.category),
        date=on,
        author_id=member.id,
        paid_by=await _payer(db, member, body.paid_by),
        receipt_key=receipt_key,
        account_mode=body.account_mode,
        split_members=members,
        split_percentages=body.split_percentages,
    )
    db.add(expense)
    await db.flush()
    await db.refresh(expense, ["author"])
    await notifications.check_category_limit(db, expense.family_id, expense.category,
                                             expense.date.strftime("%Y-%m"), member.id)
    return expense


async def find_by_receipt(db: AsyncSession, family_id: str, receipt_key: str) -> Expense | None:
    return await db.scalar(
        select(Expense).where(Expense.family_id == family_id, Expense.receipt_key == receipt_key)
    )


async def update_expense(db: AsyncSession, member: Member, expense_id: str, body: ExpenseIn) -> Expense:
    expense = await _get_expense(db, member, expense_id)
    _check_can_modify(member, expense, "Изменять")
    _check_account_mode(member, body.account_mode)
    amount = amount_to_kop(body.amount)
    on = parse_date(body.date)
    if not member.is_parent:
        await allowance.check_child_spending(db, member, amount, on, exclude_expense_id=expense.id)
    expense.title = clean_title(body.title)
    expense.amount_kop = amount
    expense.category = check_category(body.category)
    expense.date = on
    mode = body.account_mode if body.account_mode is not None else expense.account_mode
    mode_changed = mode != expense.account_mode
    percentages_provided = "split_percentages" in body.model_fields_set
    percentages_changed = percentages_provided and body.split_percentages != expense.split_percentages
    if mode_changed or percentages_changed:
        if expense.payment_id:
            raise ValidationFailed("Источник и доли задаются в связанном платеже", "accountMode")
        _check_account_mode(member, mode)
        members = await split_members(db, member.family_id, mode)
        _validate_split_percentages(body.split_percentages, members)
        expense.account_mode = mode
        expense.split_members = members
        expense.split_percentages = body.split_percentages
    if body.paid_by is not None:
        expense.paid_by = await _payer(db, member, body.paid_by)
    await db.flush()
    return expense


async def delete_expense(db: AsyncSession, member: Member, expense_id: str) -> None:
    expense = await db.get(Expense, expense_id)
    if expense is None or expense.family_id != member.family_id:
        return  # уже удалён — повторное удаление не ошибка
    _check_can_modify(member, expense, "Удалять")
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
    await check_capacity(db, Payment, member.family_id)
    payment = Payment(
        family_id=member.family_id,
        title=clean_title(body.title),
        amount_kop=amount_to_kop(body.amount),
        category=check_category(body.category),
        due_date=parse_date(body.due_date, "dueDate"),
        account_mode=body.account_mode,
        status="upcoming",
        author_id=member.id,
    )
    db.add(payment)
    await db.flush()
    if body.recurring:
        await recurring.start_series(db, payment)
    await db.refresh(payment, ["expense"])
    return payment


async def update_payment(db: AsyncSession, member: Member, payment_id: str, body: PaymentIn) -> Payment:
    payment = await _get_payment(db, member, payment_id)
    if payment is None:
        raise NotFound("Платёж не найден — возможно, его уже удалили")
    if payment.status == "paid":
        raise ValidationFailed("Платёж уже оплачен. Сначала верните его в предстоящие.")
    due = parse_date(body.due_date, "dueDate")
    # Платёж серии остаётся в своём месяце: один платёж серии на месяц (docs/FEATURES.md §6)
    if payment.series_month and due.strftime("%Y-%m") != payment.series_month:
        raise ValidationFailed("Платёж серии можно перенести только в пределах его месяца", "dueDate")
    payment.title = clean_title(body.title)
    payment.amount_kop = amount_to_kop(body.amount)
    payment.category = check_category(body.category)
    payment.due_date = due
    if body.account_mode is not None:
        payment.account_mode = body.account_mode
        if payment.series_id:
            await recurring.update_future_account_mode(db, payment)
    if body.recurring is False and payment.series_id:
        await recurring.stop_series(db, payment.series_id)
    await db.flush()
    if body.recurring and not payment.recurring:
        await recurring.start_series(db, payment)
    await db.refresh(payment)
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
    db: AsyncSession, member: Member, payment_id: str, paid: bool, *,
    record_today: bool = False, from_shared_account: bool = False,
) -> tuple[Payment, Expense | None]:
    """
    Оплачен → платёж перестаёт быть резервом и становится фактическим расходом (учитывается один раз).
    Не оплачен → связанный расход удаляется, сумма снова резервируется.
    """
    if from_shared_account:
        if not paid:
            raise ValidationFailed("Выберите оплату с общего счёта")
        # Serialize balance checks for payments from the same family account.
        await db.get(Family, member.family_id, with_for_update=True)
    payment = await _get_payment(db, member, payment_id, lock=True)
    if payment is None:
        raise NotFound("Платёж не найден")

    if paid:
        if payment.status == "paid":
            return payment, None
        await check_capacity(db, Expense, payment.family_id)
        today = clock.today()
        if from_shared_account:
            if payment.account_mode not in {"shared_split", "shared_common"}:
                raise ValidationFailed("Этот платёж запланирован с другого источника")
            incoming = await db.scalar(select(func.coalesce(func.sum(AccountContribution.amount_kop), 0)).where(
                AccountContribution.family_id == payment.family_id, AccountContribution.date <= today,
            ))
            spent = await db.scalar(select(func.coalesce(func.sum(Expense.amount_kop), 0)).where(
                Expense.family_id == payment.family_id, Expense.date <= today,
                Expense.account_mode.in_(("shared_split", "shared_common")),
            ))
            if incoming - spent < payment.amount_kop:
                raise Conflict("На общем счёте недостаточно денег для оплаты")
        same_month = payment.due_date.strftime("%Y-%m") == today.strftime("%Y-%m")
        expense = Expense(
            family_id=payment.family_id,
            title=payment.title,
            amount_kop=payment.amount_kop,
            category=payment.category,
            date=today if record_today or from_shared_account or same_month else payment.due_date,
            author_id=member.id,
            paid_by=member.id,
            payment_id=payment.id,
            account_mode=payment.account_mode,
            split_members=await split_members(db, payment.family_id, payment.account_mode),
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
    await check_capacity(db, Payment, member.family_id, adding=len(previous))
    copies = []
    for p in previous:
        # Платежи серий создаются сами (§6)
        if p.title in existing or p.series_id:
            continue
        existing.add(p.title)
        copy = Payment(
            family_id=member.family_id,
            title=p.title,
            amount_kop=p.amount_kop,
            category=p.category,
            due_date=_move_to_month(p.due_date, month_key),
            account_mode=p.account_mode,
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
