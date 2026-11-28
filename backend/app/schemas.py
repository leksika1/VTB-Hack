"""
DTO API. Поля в camelCase и форма объектов совпадают с типами фронтенда (frontend/src/types/index.ts).
Входные модели нарочно мягкие (str/float): содержательные проверки с русскими сообщениями — в validation.py.
"""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt
from pydantic.alias_generators import to_camel

from . import models
from .validation import CATEGORIES, kop_to_amount


class Schema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# ── Входные данные ──


class CreateFamilyIn(Schema):
    family_name: str = Field(max_length=200)
    user_name: str = Field(max_length=200)
    oidc_link_token: str | None = Field(default=None, max_length=100)  # §11: привязать ВТБ ID к новому участнику


class JoinFamilyIn(Schema):
    user_name: str = Field(max_length=200)
    oidc_link_token: str | None = Field(default=None, max_length=100)


class LoginIdIn(Schema):
    login_id: str = Field(min_length=5, max_length=32)


class OidcStartIn(Schema):
    intent: str  # login | link
    redirect_uri: str = Field(max_length=500)


class OidcCallbackIn(Schema):
    code: str = Field(max_length=500)
    state: str = Field(max_length=100)


class BudgetIn(Schema):
    total_amount: float
    category_plans: dict[str, float] = {}


AccountMode = Literal["shared_split", "shared_common", "personal_split", "outside"]


class ContributionAmountIn(Schema):
    amount: float


class ExpenseIn(Schema):
    title: str = Field(max_length=500)
    amount: float
    category: str
    date: str
    account_mode: AccountMode | None = None
    source: Literal["shared", "personal"] | None = None
    split_mode: Literal["none", "equal", "shares"] | None = None
    split_members: list[str] | None = Field(default=None, max_length=50)
    split_shares: dict[str, StrictInt] | None = None  # базисные пункты, сумма 10 000
    split_percentages: dict[str, StrictInt] | None = None
    paid_by: str | None = None  # кто платил; по умолчанию автор (docs/FEATURES.md §7)
    receipt: str | None = Field(default=None, max_length=512)  # строка QR-кода чека (§8)


class ReceiptIn(Schema):
    qr: str = Field(max_length=512)


class ReceiptOut(Schema):
    amount: float
    date: str
    time: str
    duplicate: bool
    duplicate_of: str | None


class PaymentIn(Schema):
    title: str = Field(max_length=500)
    amount: float = 0
    category: str
    due_date: str
    # true — начать серию, false — остановить; не указано — не менять (docs/FEATURES.md §6)
    recurring: bool | None = None
    account_mode: Literal["shared_split", "shared_common", "outside"] | None = None
    amount_mode: Literal["fixed", "invoice"] = "fixed"
    recurrence: Literal["once", "weekly", "monthly", "quarterly", "yearly", "custom"] | None = None
    interval: int = Field(default=1, ge=1, le=365)
    interval_unit: Literal["days", "weeks", "months"] | None = None
    end_mode: Literal["never", "date", "count"] = "never"
    end_date: str | None = None
    occurrences: int | None = Field(default=None, ge=1, le=1000)
    split_mode: Literal["none", "equal", "shares"] = "none"
    split_members: list[str] | None = Field(default=None, max_length=50)
    split_shares: dict[str, StrictInt] | None = None
    payment_method: Literal["autopay", "manual"] = "manual"
    autopay_type: Literal["by_invoice", "by_date", "by_balance"] | None = None
    provider_category: Literal["housing", "mobile", "internet", "traffic_fines"] | None = None
    provider_name: str | None = Field(default=None, max_length=120)
    provider_identifier: str | None = Field(default=None, max_length=120)
    limit_amount: float | None = None
    payment_details: dict | None = None


class InvoiceIn(Schema):
    amount: float


class PreferencesIn(Schema):
    debt_reminder_threshold: float | None = None
    default_split: Literal["equal", "none", "ask"] | None = None
    calendar_enabled: bool | None = None


class GoalIn(Schema):
    title: str = Field(max_length=500)
    target: float
    deadline: str | None = None


class ContributionIn(Schema):
    amount: float
    date: str | None = None


class EmailIn(Schema):
    email: str = Field(max_length=320)


class CodeIn(Schema):
    code: str = Field(max_length=20)


class NotificationSettingsIn(Schema):
    email: bool


class ImportIn(Schema):
    filename: str = Field(max_length=200)
    content: str = Field(max_length=2_000_000)


class CardImportIn(Schema):
    month: str | None = None


class ImportRowChoice(Schema):
    id: str
    category: str | None = None
    include: bool = True
    account_mode: Literal["personal_split", "outside"] | None = None


class ImportConfirmIn(Schema):
    rows: list[ImportRowChoice] = Field(default=[], max_length=1000)


class SettlementIn(Schema):
    from_id: str
    to_id: str
    amount: float


class PaymentPaidIn(Schema):
    paid: bool
    record_today: bool = False
    from_shared_account: bool = False


class CopyPaymentsIn(Schema):
    month_key: str


class PurchaseCheckIn(Schema):
    amount: float
    category: str | None = None


# ── Ответы ──


class UserOut(Schema):
    id: str
    name: str
    color: str
    role: str  # всегда member
    is_owner: bool = False
    status: str = "active"
    requested_at: int | None = None

    @classmethod
    def of(cls, m: models.Member) -> "UserOut":
        return cls(id=m.id, name=m.name, color=m.color, role="member", is_owner=m.family.owner_id == m.id,
                   status=m.status, requested_at=m.joined_at if m.pending else None)


class FamilyOut(Schema):
    id: str
    name: str
    owner_id: str | None
    is_owner: bool
    # Код семьи видят все подтверждённые участники.
    invite_code: str | None
    # Устарело: в v2 детских приглашений нет.
    child_invite_code: str | None = None
    members: list[UserOut]
    # Ждут подтверждения входа. Видят все, решает только владелец.
    pending_members: list[UserOut]
    # true — сам зритель ждёт подтверждения: видит только название семьи и себя
    pending: bool
    is_demo: bool

    @classmethod
    def of(cls, f: models.Family, viewer: models.Member) -> "FamilyOut":
        if not viewer.active:
            return cls(id=f.id, name=f.name, owner_id=f.owner_id, is_owner=False, invite_code=None,
                       child_invite_code=None, members=[UserOut.of(viewer)],
                       pending_members=[], pending=True, is_demo=False)
        return cls(
            id=f.id, owner_id=f.owner_id, is_owner=f.owner_id == viewer.id,
            name=f.name,
            invite_code=f.invite_code,
            child_invite_code=None,
            members=[UserOut.of(m) for m in f.members if m.active],
            pending_members=[UserOut.of(m) for m in f.members if m.pending],
            pending=False,
            is_demo=False,
        )


class SessionOut(Schema):
    """Выдаётся при создании семьи, входе по приглашению или личному ID."""

    token: str
    current_user_id: str
    family: FamilyOut
    # При создании участника показывается сразу; затем доступен только самому участнику через GET /me.
    login_id: str | None = None


class InvitePreviewOut(Schema):
    code: str
    family_name: str
    members_count: int
    role: str  # member
    # Код и ссылка всегда требуют решения владельца.
    needs_approval: bool


class InviteLinkIn(Schema):
    # Поле оставлено для старого клиента, но сервер всегда создаёт ссылку для member.
    role: str = "member"


class InviteLinkOut(Schema):
    id: str
    # Код показывается один раз — при создании; в списке null (в базе хранится только хэш)
    code: str | None
    role: str
    created_by: str | None
    created_at: int
    expires_at: int
    uses: int  # сколько человек уже вошло по ссылке
    last_used_at: int | None

    @classmethod
    def of(cls, link: models.InviteLink, code: str | None = None) -> "InviteLinkOut":
        return cls(id=link.id, code=code, role=link.role, created_by=link.created_by, created_at=link.created_at,
                   expires_at=link.expires_at, uses=link.uses, last_used_at=link.last_used_at)


class BudgetOut(Schema):
    family_id: str
    month_key: str
    total_amount: float
    category_plans: dict[str, float]
    updated_at: int

    @classmethod
    def of(cls, b: models.Budget) -> "BudgetOut":
        return cls(
            family_id=b.family_id,
            month_key=b.month_key,
            total_amount=kop_to_amount(b.total_kop),
            category_plans={c: kop_to_amount(b.category_plans_kop.get(c, 0)) for c in CATEGORIES},
            updated_at=b.updated_at,
        )


class ExpenseOut(Schema):
    id: str
    family_id: str
    title: str
    amount: float
    category: str
    date: str
    author_id: str | None
    author_name: str | None
    payment_id: str | None
    paid_by: str | None
    account_mode: AccountMode | None
    source: str
    split_mode: str
    split_members: list[str] | None
    split_percentages: dict[str, int] | None = None
    split_shares: dict[str, int] | None = None
    created_at: int

    @classmethod
    def of(cls, e: models.Expense) -> "ExpenseOut":
        return cls(
            id=e.id,
            family_id=e.family_id,
            title=e.title,
            amount=kop_to_amount(e.amount_kop),
            category=e.category,
            date=e.date.isoformat(),
            author_id=e.author_id,
            author_name=e.author.name if e.author else None,
            payment_id=e.payment_id,
            paid_by=e.paid_by,
            account_mode=e.account_mode,
            source=e.source,
            split_mode=e.split_mode,
            split_members=e.split_members,
            split_percentages=e.split_percentages,
            split_shares=e.split_shares,
            created_at=e.created_at,
        )


class PaymentOut(Schema):
    id: str
    family_id: str
    title: str
    amount: float
    category: str
    due_date: str
    status: str
    expense_id: str | None
    author_id: str | None
    created_at: int
    account_mode: AccountMode | None
    recurring: bool
    series_id: str | None
    amount_mode: str
    recurrence: str
    recurrence_rule: dict | None
    source: str
    split_mode: str
    split_members: list[str] | None
    split_shares: dict[str, int] | None
    payment_method: str
    autopay_type: str | None
    provider_category: str | None
    provider_name: str | None
    provider_identifier: str | None
    limit_amount: float | None
    payment_details: dict | None
    invoice_issued_at: int | None

    @classmethod
    def of(cls, p: models.Payment, *, detailed: bool = False) -> "PaymentOut":
        details = dict(p.payment_details or {}) or None
        if details and details.get("method") == "card" and not detailed and details.get("cardNumber"):
            digits = "".join(ch for ch in str(details["cardNumber"]) if ch.isdigit())
            details["cardNumber"] = ("•••• " + digits[-4:]) if digits else "••••"
        rule = p.recurrence_rule or None
        return cls(
            id=p.id,
            family_id=p.family_id,
            title=p.title,
            amount=kop_to_amount(p.amount_kop),
            category=p.category,
            due_date=p.due_date.isoformat(),
            status=p.status,
            expense_id=p.expense.id if p.expense else None,
            author_id=p.author_id,
            created_at=p.created_at,
            recurring=p.recurring,
            account_mode=p.account_mode,
            series_id=p.series_id,
            amount_mode=p.amount_mode,
            recurrence=(rule or {}).get("frequency", "monthly" if p.recurring else "once"),
            recurrence_rule=rule,
            source=p.source,
            split_mode=p.split_mode,
            split_members=p.split_members,
            split_shares=p.split_shares,
            payment_method=p.payment_method,
            autopay_type=p.autopay_type,
            provider_category=p.provider_category,
            provider_name=p.provider_name,
            provider_identifier=p.provider_identifier,
            limit_amount=kop_to_amount(p.limit_amount_kop) if p.limit_amount_kop is not None else None,
            payment_details=details,
            invoice_issued_at=p.invoice_issued_at,
        )


class PaymentPaidOut(Schema):
    payment: PaymentOut
    # Расход, созданный при оплате; null, если платёж вернули в «Предстоит» или он уже был в нужном статусе
    expense: ExpenseOut | None


class CopyPaymentsOut(Schema):
    added: int
    payments: list[PaymentOut]


class AccountContributionOut(Schema):
    id: str
    member_id: str | None
    amount: float
    date: str
    created_at: int
    top_up_suggestion: float | None = None

    @classmethod
    def of(cls, contribution: models.AccountContribution) -> "AccountContributionOut":
        return cls(id=contribution.id, member_id=contribution.member_id,
                   amount=kop_to_amount(contribution.amount_kop), date=contribution.date.isoformat(),
                   created_at=contribution.created_at)


class StateOut(Schema):
    """Всё, что нужно приложению на старте (loadInitialData)."""

    family: FamilyOut
    current_user_id: str
    budgets: list[BudgetOut]
    expenses: list[ExpenseOut]
    payments: list[PaymentOut]
    unread_notifications: int = 0
    account_contributions: list[AccountContributionOut] = Field(default_factory=list)


class AccountMemberOut(Schema):
    member_id: str
    name: str
    share: float
    contributed: float
    paid_personally: float
    due: float
    top_up_suggestion: float
    overpaid: float
    share_percent: float
    contribution_percent: float
    status: str


class AccountSummaryOut(Schema):
    month_key: str
    balance: float
    planned: float
    after_planned: float
    members: list[AccountMemberOut]
    contributions: list[AccountContributionOut]


class AnalyticsMonthOut(Schema):
    month: str
    expenses: float
    account_balance: float
    expense_change_percent: float | None


class AnalyticsCategoryOut(Schema):
    category: str
    amount: float
    percent: float


class AnalyticsOut(Schema):
    month: str
    series: list[AnalyticsMonthOut]
    categories: list[AnalyticsCategoryOut]
    top_categories: list[AnalyticsCategoryOut]
    account: AccountSummaryOut
    payments: list[PaymentOut]


class CalendarDayOut(Schema):
    date: str
    expenses: list[ExpenseOut]
    expense_total: float
    payments: list[PaymentOut]
    account_balance: float


class CalendarOut(Schema):
    month: str
    days: list[CalendarDayOut]
    upcoming_payments: list[PaymentOut]


class CategorySummaryOut(Schema):
    key: str
    plan: float
    spent: float
    reserved: float
    left: float
    status: str
    over_by_expenses: bool


class MonthSummaryOut(Schema):
    month_key: str
    has_budget: bool
    plan: float
    spent: float
    reserved: float
    left_by_plan: float
    free_by_plan: float
    unallocated: float
    # Справочно: взносы в цели за месяц; в формулы бюджета не входят (docs/FEATURES.md §4)
    saved_this_month: float = 0
    categories: list[CategorySummaryOut]
    upcoming_payments: list[PaymentOut]
    paid_payments: list[PaymentOut]
    expenses: list[ExpenseOut]


class PurchaseCheckOut(Schema):
    verdict: str  # ok | tight | category-over | not-enough
    amount: float
    free_before: float
    free_after: float
    category: CategorySummaryOut | None
    category_left_after: float | None
    reserved_payments: list[PaymentOut]


class GoalOut(Schema):
    id: str
    family_id: str
    title: str
    target: float
    deadline: str | None
    status: str  # active | achieved | archived
    saved: float
    left: float
    percent: int
    monthly_needed: float | None
    eta_month: str | None
    created_by: str | None
    created_at: int
    achieved_at: int | None


class ContributionOut(Schema):
    id: str
    goal_id: str
    member_id: str | None
    amount: float
    date: str
    created_at: int

    @classmethod
    def of(cls, c: models.GoalContribution) -> "ContributionOut":
        return cls(id=c.id, goal_id=c.goal_id, member_id=c.member_id, amount=kop_to_amount(c.amount_kop),
                   date=c.date.isoformat(), created_at=c.created_at)


class ContributionResultOut(Schema):
    goal: GoalOut
    contribution: ContributionOut
    account_contribution: AccountContributionOut | None = None


class CategoryForecastOut(Schema):
    key: str
    plan: float
    spent: float
    projected: float
    status: str


class ForecastOut(Schema):
    month_key: str
    kind: str
    plan: float
    spent: float
    reserved: float
    variable_spent: float
    daily_average: float
    days_passed: int
    days_in_month: int
    projected_spent: float
    projected_left: float
    low_confidence: bool
    categories: list[CategoryForecastOut]


class SettlementMemberOut(Schema):
    member_id: str
    name: str
    paid: float
    share: float
    sent: float
    received: float
    balance: float


class TransferOut(Schema):
    from_id: str
    to_id: str
    amount: float


class RecordedSettlementOut(Schema):
    id: str
    from_id: str | None
    to_id: str | None
    amount: float
    created_by: str | None
    created_at: int


class SettlementOut(Schema):
    month_key: str
    shared_total: float
    members: list[SettlementMemberOut]
    transfers: list[TransferOut]
    recorded: list[RecordedSettlementOut]


class MeOut(Schema):
    id: str
    name: str
    role: str
    status: str  # active | pending | rejected
    email: str | None
    email_verified: bool
    notify_by_email: bool
    pending_email: str | None
    vtb_linked: bool
    login_id: str | None
    is_owner: bool
    debt_reminder_threshold: float
    default_split: str
    calendar_enabled: bool


class PreferencesOut(Schema):
    debt_reminder_threshold: float
    default_split: str
    calendar_enabled: bool


class NotificationOut(Schema):
    id: str
    kind: str
    title: str
    body: str
    data: dict
    created_at: int
    read_at: int | None

    @classmethod
    def of(cls, n: models.Notification) -> "NotificationOut":
        return cls(id=n.id, kind=n.kind, title=n.title, body=n.body, data=n.data or {},
                   created_at=n.created_at, read_at=n.read_at)


class ImportRowOut(Schema):
    id: str
    row_no: int
    date: str | None
    amount: float | None
    description: str
    mcc: str | None
    suggested_category: str
    duplicate: bool
    error: str | None
    expense_id: str | None


class ImportOut(Schema):
    id: str
    status: str
    filename: str
    created_at: int
    created_by: str | None
    total_rows: int
    spending_rows: int
    skipped_income: int
    duplicates: int
    errors: int
    imported: int
    rows: list[ImportRowOut] | None = None

    @classmethod
    def of(cls, i: models.StatementImport, with_rows: bool = False) -> "ImportOut":
        rows = i.rows
        return cls(
            id=i.id, status=i.status, filename=i.filename, created_at=i.created_at, created_by=i.created_by,
            total_rows=i.total_rows, spending_rows=len(rows), skipped_income=i.skipped_income,
            duplicates=sum(r.duplicate for r in rows), errors=sum(r.error is not None for r in rows),
            imported=i.imported,
            rows=[ImportRowOut(
                id=r.id, row_no=r.row_no, date=r.date.isoformat() if r.date else None,
                amount=kop_to_amount(r.amount_kop) if r.amount_kop is not None else None,
                description=r.description, mcc=r.mcc, suggested_category=r.suggested_category,
                duplicate=r.duplicate, error=r.error, expense_id=r.expense_id,
            ) for r in rows] if with_rows else None,
        )


class OidcConfigOut(Schema):
    enabled: bool
    provider_name: str


class OidcStartOut(Schema):
    authorization_url: str


class OidcCallbackOut(Schema):
    status: str  # session | unlinked | linked
    session: "SessionOut | None" = None
    link_token: str | None = None


class ErrorBody(Schema):
    code: str
    message: str
    field: str | None = None


class ErrorOut(Schema):
    error: ErrorBody


StateOut.model_rebuild()
