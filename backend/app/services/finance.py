"""Бюджеты, расходы и обязательные платежи семьи. Все операции — в пределах семьи участника."""
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from .. import clock
from . import notifications, recurring
from ..domain.budget import MonthSummary, compute_month_summary
from ..config import get_settings
from ..errors import Conflict, NotFound, ValidationFailed
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

AUTOPAY_CATALOG = {
    "housing": {"name": "ЖКУ", "autopayTypes": ["by_invoice", "by_date"],
                "identifier": {"field": "providerIdentifier", "label": "Лицевой счёт или код плательщика"}},
    "mobile": {"name": "Мобильная связь", "autopayTypes": ["by_balance", "by_date"],
               "identifier": {"field": "providerIdentifier", "label": "Номер телефона"}},
    "internet": {"name": "Интернет", "autopayTypes": ["by_invoice", "by_date"],
                 "identifier": {"field": "providerIdentifier", "label": "Номер договора"}},
    "traffic_fines": {"name": "Штрафы ГИБДД", "autopayTypes": ["by_invoice"],
                      "identifier": {"field": "providerIdentifier", "label": "СТС или водительское удостоверение"}},
}
MANUAL_METHODS = {"sbp_phone", "card", "bank_account", "uin"}


def autopay_catalog() -> dict:
    return {"categories": [{"key": key, **value,
                             "requiredFields": ["providerName", "providerIdentifier"]}
                            for key, value in AUTOPAY_CATALOG.items()]}

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
    """Кто платил: можно указать любого активного участника семьи."""
    if not paid_by or paid_by == member.id:
        return member.id
    payer = await db.get(Member, paid_by)
    if payer is None or payer.family_id != member.family_id or not payer.active:
        raise ValidationFailed("Участник не найден", "paidBy")
    return payer.id


def _check_can_modify(member: Member, expense: Expense, action: str) -> None:
    """В v2 любой активный участник может исправлять записи семьи."""


async def split_members(db: AsyncSession, family_id: str, mode: str | None) -> list[str] | None:
    if mode not in {"shared_split", "personal_split"}:
        return None
    members = await db.scalars(
        select(Member).where(Member.family_id == family_id,
                             Member.left_at.is_(None), Member.status == "active")
        .order_by(Member.joined_at, Member.id)
    )
    return [member.id for member in members]


def _validate_split_percentages(percentages: dict[str, int] | None, members: list[str] | None) -> None:
    if percentages is None:
        return
    if not members or not percentages or not set(percentages).issubset(members):
        raise ValidationFailed("Укажите доли участников семьи", "splitPercentages")
    if any(not 0 <= value <= 100 for value in percentages.values()) or sum(percentages.values()) != 100:
        raise ValidationFailed("Сумма долей должна быть 100%", "splitPercentages")


async def _split_config(db: AsyncSession, family_id: str, *, split_mode: str,
                        selected: list[str] | None, shares: dict[str, int] | None,
                        legacy_percentages: dict[str, int] | None = None) -> tuple[list[str] | None, dict[str, int] | None]:
    if split_mode == "none":
        if shares:
            raise ValidationFailed("Для общей траты доли не задаются", "splitShares")
        return None, None
    active = await split_members(db, family_id, "shared_split") or []
    members = list(dict.fromkeys(selected or (list(shares) if shares else active)))
    if not members or not set(members).issubset(active):
        raise ValidationFailed("Выберите активных участников семьи", "splitMembers")
    if split_mode == "equal":
        if shares:
            raise ValidationFailed("Для деления поровну проценты не задаются", "splitShares")
        return members, None
    if split_mode != "shares":
        raise ValidationFailed("Деление: none, equal или shares", "splitMode")
    normalized = shares
    if normalized is None and legacy_percentages is not None:
        normalized = {member_id: value * 100 for member_id, value in legacy_percentages.items()}
    if not normalized or set(normalized) != set(members) or sum(normalized.values()) != 10_000 \
            or any(value <= 0 for value in normalized.values()):
        raise ValidationFailed("Доли выбранных участников должны дать 10 000 базисных пунктов", "splitShares")
    return members, normalized


async def create_expense(db: AsyncSession, member: Member, body: ExpenseIn) -> Expense:
    if body.source == "personal" or body.account_mode == "personal_split":
        raise ValidationFailed("Личную карту можно выбрать только при импорте покупки", "source")
    await check_capacity(db, Expense, member.family_id)
    amount = amount_to_kop(body.amount)
    on = parse_date(body.date)
    receipt_key = None
    if body.receipt:
        receipt_key = parse_receipt(body.receipt, "receipt").key
        if await find_by_receipt(db, member.family_id, receipt_key):
            raise Conflict("Этот чек уже добавлен", "receipt")
    split_mode = body.split_mode or (
        "shares" if body.split_percentages else
        "equal" if body.account_mode == "shared_split" else
        member.default_split if body.account_mode is None and member.default_split in {"equal", "none"} else
        "none"
    )
    members, shares = await _split_config(db, member.family_id, split_mode=split_mode,
                                          selected=body.split_members, shares=body.split_shares,
                                          legacy_percentages=body.split_percentages)
    account_mode = "shared_split" if split_mode != "none" else (body.account_mode or "shared_common")
    expense = Expense(
        family_id=member.family_id,
        title=clean_title(body.title),
        amount_kop=amount,
        category=check_category(body.category),
        date=on,
        author_id=member.id,
        paid_by=await _payer(db, member, body.paid_by),
        receipt_key=receipt_key,
        account_mode=account_mode,
        source="shared",
        split_mode=split_mode,
        split_members=members,
        split_percentages=body.split_percentages,
        split_shares=shares,
    )
    db.add(expense)
    await db.flush()
    await db.refresh(expense, ["author"])
    await notifications.check_category_limit(db, expense.family_id, expense.category,
                                             expense.date.strftime("%Y-%m"), member.id)
    await notifications.debt_reminders(db, expense.family_id)
    return expense


async def find_by_receipt(db: AsyncSession, family_id: str, receipt_key: str) -> Expense | None:
    return await db.scalar(
        select(Expense).where(Expense.family_id == family_id, Expense.receipt_key == receipt_key)
    )


async def update_expense(db: AsyncSession, member: Member, expense_id: str, body: ExpenseIn) -> Expense:
    expense = await _get_expense(db, member, expense_id)
    _check_can_modify(member, expense, "Изменять")
    amount = amount_to_kop(body.amount)
    on = parse_date(body.date)
    expense.title = clean_title(body.title)
    expense.amount_kop = amount
    expense.category = check_category(body.category)
    expense.date = on
    mode = body.account_mode if body.account_mode is not None else expense.account_mode
    split_provided = any(name in body.model_fields_set for name in
                         ("split_mode", "split_members", "split_shares", "split_percentages", "account_mode"))
    if split_provided:
        if expense.payment_id:
            raise ValidationFailed("Источник и доли задаются в связанном платеже", "accountMode")
        split_mode = body.split_mode or (
            "shares" if body.split_percentages else "equal" if mode in {"shared_split", "personal_split"}
            else "none"
        )
        members, shares = await _split_config(db, member.family_id, split_mode=split_mode,
                                              selected=body.split_members, shares=body.split_shares,
                                              legacy_percentages=body.split_percentages)
        expense.account_mode = ("personal_split" if expense.source == "personal" else "shared_split") \
            if split_mode != "none" else ("outside" if expense.source == "personal" else "shared_common")
        expense.split_mode = split_mode
        expense.split_members = members
        expense.split_percentages = body.split_percentages
        expense.split_shares = shares
    if body.paid_by is not None:
        expense.paid_by = await _payer(db, member, body.paid_by)
    await db.flush()
    await notifications.debt_reminders(db, expense.family_id)
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
    await notifications.debt_reminders(db, member.family_id)


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


def _recurrence_rule(body: PaymentIn, existing: Payment | None = None) -> dict | None:
    if body.recurrence is not None:
        frequency = body.recurrence
    elif body.recurring is True:
        frequency = "monthly"
    elif body.recurring is False:
        frequency = "once"
    elif existing is not None and existing.recurring:
        return existing.recurrence_rule or {"frequency": "monthly", "interval": 1, "endMode": "never"}
    else:
        frequency = "once"
    if frequency == "once":
        return None
    if frequency == "custom" and body.interval_unit not in {"days", "weeks", "months"}:
        raise ValidationFailed("Для своего периода выберите дни, недели или месяцы", "intervalUnit")
    if body.end_mode == "date":
        end_date = parse_date(body.end_date, "endDate") if body.end_date else None
        if end_date is None or end_date < parse_date(body.due_date, "dueDate"):
            raise ValidationFailed("Дата окончания должна быть не раньше первого платежа", "endDate")
    if body.end_mode == "count" and not body.occurrences:
        raise ValidationFailed("Укажите количество повторов", "occurrences")
    return {
        "frequency": frequency, "interval": body.interval,
        "unit": body.interval_unit if frequency == "custom" else None,
        "endMode": body.end_mode, "endDate": body.end_date,
        "occurrences": body.occurrences,
    }


def _validate_payment_method(body: PaymentIn) -> tuple[int, dict | None, int | None]:
    amount = amount_to_kop(body.amount, allow_zero=body.amount_mode == "invoice")
    if body.amount_mode == "fixed" and not amount:
        raise ValidationFailed("Укажите сумму платежа", "amount")
    if body.payment_method == "autopay":
        category = AUTOPAY_CATALOG.get(body.provider_category or "")
        if category is None:
            raise ValidationFailed("Автоплатёж доступен только для категорий из справочника", "providerCategory")
        if body.autopay_type not in category["autopayTypes"]:
            raise ValidationFailed("Этот тип автоплатежа не поддерживается для выбранной категории", "autopayType")
        if not (body.provider_name or "").strip():
            raise ValidationFailed("Укажите поставщика", "providerName")
        if not (body.provider_identifier or "").strip():
            raise ValidationFailed(category["identifier"]["label"], "providerIdentifier")
        if body.autopay_type == "by_invoice" and body.amount_mode != "invoice":
            raise ValidationFailed("Автоплатёж по счёту требует сумму по выставленному счёту", "amountMode")
        details = None
    else:
        details = dict(body.payment_details or {})
        if not details and "payment_method" not in body.model_fields_set and "payment_details" not in body.model_fields_set:
            return amount, None, (amount_to_kop(body.limit_amount, "limitAmount")
                                  if body.limit_amount is not None else None)
        method = details.get("method")
        if method not in MANUAL_METHODS:
            raise ValidationFailed("Выберите реквизиты: СБП, карта, счёт или УИН", "paymentDetails")
        if not str(details.get("recipient") or "").strip():
            raise ValidationFailed("Укажите получателя", "paymentDetails")
        required = {"sbp_phone": ("phone",), "card": ("cardNumber",),
                    "bank_account": ("account", "bic"), "uin": ("uin",)}[method]
        if any(not str(details.get(field) or "").strip() for field in required):
            raise ValidationFailed("Заполните обязательные реквизиты", "paymentDetails")
        if not str(details.get("purpose") or "").strip():
            raise ValidationFailed("Укажите назначение платежа", "paymentDetails")
    limit = amount_to_kop(body.limit_amount, "limitAmount") if body.limit_amount is not None else None
    return amount, details, limit


async def _payment_split(db: AsyncSession, member: Member, body: PaymentIn):
    split_mode = body.split_mode
    if "split_mode" not in body.model_fields_set and body.account_mode == "shared_split":
        split_mode = "equal"
    members, shares = await _split_config(db, member.family_id, split_mode=split_mode,
                                          selected=body.split_members, shares=body.split_shares)
    mode = "shared_split" if split_mode != "none" else "shared_common"
    return mode, split_mode, members, shares


async def create_payment(db: AsyncSession, member: Member, body: PaymentIn) -> Payment:
    await check_capacity(db, Payment, member.family_id)
    amount, details, limit = _validate_payment_method(body)
    account_mode, split_mode, members, shares = await _payment_split(db, member, body)
    rule = _recurrence_rule(body)
    payment = Payment(
        family_id=member.family_id,
        title=clean_title(body.title),
        amount_kop=amount,
        category=check_category(body.category),
        due_date=parse_date(body.due_date, "dueDate"),
        account_mode=account_mode,
        source="shared", split_mode=split_mode, split_members=members, split_shares=shares,
        amount_mode=body.amount_mode, payment_method=body.payment_method,
        autopay_type=body.autopay_type, provider_category=body.provider_category,
        provider_name=(body.provider_name or "").strip() or None,
        provider_identifier=(body.provider_identifier or "").strip() or None,
        limit_amount_kop=limit, payment_details=details,
        status="upcoming",
        author_id=member.id,
    )
    db.add(payment)
    await db.flush()
    if rule:
        await recurring.start_series(db, payment, rule)
    await db.refresh(payment, ["expense"])
    return payment


async def update_payment(db: AsyncSession, member: Member, payment_id: str, body: PaymentIn) -> Payment:
    payment = await _get_payment(db, member, payment_id)
    if payment is None:
        raise NotFound("Платёж не найден — возможно, его уже удалили")
    if payment.status == "paid":
        raise ValidationFailed("Платёж уже оплачен. Сначала верните его в предстоящие.")
    due = parse_date(body.due_date, "dueDate")
    # Переносим отдельное вхождение только в пределах его месяца, чтобы не менять порядок серии неявно.
    if payment.series_month and due.strftime("%Y-%m") != payment.series_month:
        raise ValidationFailed("Платёж серии можно перенести только в пределах его месяца", "dueDate")
    old_rule = dict(payment.recurrence_rule or {}) or None
    amount, details, limit = _validate_payment_method(body)
    account_mode, split_mode, members, shares = await _payment_split(db, member, body)
    rule = _recurrence_rule(body, payment)
    payment.title = clean_title(body.title)
    payment.amount_kop = amount
    payment.category = check_category(body.category)
    payment.due_date = due
    payment.account_mode, payment.source = account_mode, "shared"
    payment.split_mode, payment.split_members, payment.split_shares = split_mode, members, shares
    payment.amount_mode, payment.payment_method = body.amount_mode, body.payment_method
    payment.autopay_type, payment.provider_category = body.autopay_type, body.provider_category
    payment.provider_name = (body.provider_name or "").strip() or None
    payment.provider_identifier = (body.provider_identifier or "").strip() or None
    payment.limit_amount_kop, payment.payment_details = limit, details
    if rule is None and payment.series_id:
        await recurring.stop_series(db, payment)
    await db.flush()
    if rule and not payment.recurring:
        await recurring.start_series(db, payment, rule)
    elif rule:
        payment.recurrence_rule = rule
        if payment.series_id and rule != old_rule:
            await recurring.replace_future(db, payment)
    if payment.series_id:
        await recurring.update_future(db, payment)
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
        if payment.amount_kop <= 0:
            raise ValidationFailed("Сначала укажите сумму выставленного счёта", "amount")
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
                (Expense.source == "shared") |
                Expense.account_mode.in_(("shared_split", "shared_common")),
            ))
            shortage = payment.amount_kop - (incoming - spent)
            if shortage > 0:
                raise Conflict(f"На общем счёте недостаточно денег: не хватает {shortage / 100:,.2f} ₽".replace(",", " "))
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
            source="shared", split_mode=payment.split_mode,
            split_members=payment.split_members, split_shares=payment.split_shares,
        )
        payment.status = "paid"
        db.add(expense)
        await db.flush()
        await db.refresh(expense, ["author"])
        await db.refresh(payment, ["expense"])
        await recurring.ensure_next(db, payment)
        await notifications.debt_reminders(db, payment.family_id)
        return payment, expense

    if payment.status == "upcoming":
        return payment, None
    if payment.expense is not None:
        await db.delete(payment.expense)
    payment.status = "upcoming"
    await db.flush()
    await db.refresh(payment, ["expense"])
    await notifications.debt_reminders(db, payment.family_id)
    return payment, None


async def invoice_payment(db: AsyncSession, member: Member, payment_id: str, amount: float) -> Payment:
    payment = await _get_payment(db, member, payment_id, lock=True)
    if payment is None:
        raise NotFound("Платёж не найден")
    if payment.status != "upcoming" or payment.amount_mode != "invoice":
        raise ValidationFailed("Этот платёж не ожидает выставления счёта", "amount")
    payment.amount_kop = amount_to_kop(amount)
    payment.invoice_issued_at = now_ms()
    await db.flush()
    return payment


async def attempt_autopay(db: AsyncSession, payment: Payment) -> bool:
    """Попытка автоплатежа под блокировкой строки; безопасна при нескольких репликах."""
    payment = await db.get(Payment, payment.id, with_for_update=True, populate_existing=True)
    if payment is None or payment.status != "upcoming" or payment.payment_method != "autopay":
        return False
    if payment.limit_amount_kop is not None and payment.amount_kop > payment.limit_amount_kop:
        await notifications.notify(
            db, payment.family_id, await notifications.everyone(db, payment.family_id), "autopay_limit",
            f"Счёт «{payment.title}» больше лимита — подтвердите оплату",
            f"Счёт {payment.amount_kop / 100:,.2f} ₽, лимит {payment.limit_amount_kop / 100:,.2f} ₽".replace(",", " "),
            {"paymentId": payment.id}, dedupe_key=f"autopay_limit:{payment.id}:{payment.amount_kop}")
        return False
    actor = await db.scalar(select(Member).where(
        Member.family_id == payment.family_id, Member.left_at.is_(None), Member.status == "active"
    ).order_by(Member.joined_at, Member.id).limit(1))
    if actor is None:
        return False
    try:
        await set_payment_paid(db, actor, payment.id, True, from_shared_account=True)
    except Conflict:
        await notifications.notify(
            db, payment.family_id, await notifications.everyone(db, payment.family_id), "autopay_shortage",
            f"Не хватает денег на «{payment.title}»", "Пополните общий счёт или оплатите вручную",
            {"paymentId": payment.id}, dedupe_key=f"autopay_shortage:{payment.id}:{payment.amount_kop}")
        return False
    return True


async def autopay_due(db: AsyncSession) -> int:
    today = clock.today()
    rows = list(await db.scalars(select(Payment).where(
        Payment.status == "upcoming", Payment.payment_method == "autopay",
        ((Payment.autopay_type.in_(("by_date", "by_balance"))) & (Payment.due_date <= today)) |
        ((Payment.autopay_type == "by_invoice") & Payment.invoice_issued_at.is_not(None)),
    ).order_by(Payment.due_date).with_for_update(skip_locked=True)))
    paid = 0
    for payment in rows:
        paid += int(await attempt_autopay(db, payment))
    return paid


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
            source=p.source,
            split_mode=p.split_mode,
            split_members=p.split_members,
            split_shares=p.split_shares,
            amount_mode=p.amount_mode,
            payment_method=p.payment_method,
            autopay_type=p.autopay_type,
            provider_category=p.provider_category,
            provider_name=p.provider_name,
            provider_identifier=p.provider_identifier,
            limit_amount_kop=p.limit_amount_kop,
            payment_details=p.payment_details,
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
