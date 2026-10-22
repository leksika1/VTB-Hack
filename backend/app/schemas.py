"""
DTO API. Поля в camelCase и форма объектов совпадают с типами фронтенда (frontend/src/types/index.ts).
Входные модели нарочно мягкие (str/float): содержательные проверки с русскими сообщениями — в validation.py.
"""
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from . import models
from .validation import CATEGORIES, kop_to_amount


class Schema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# ── Входные данные ──


class CreateFamilyIn(Schema):
    family_name: str = Field(max_length=200)
    user_name: str = Field(max_length=200)


class JoinFamilyIn(Schema):
    user_name: str = Field(max_length=200)


class SwitchUserIn(Schema):
    user_id: str


class BudgetIn(Schema):
    total_amount: float
    category_plans: dict[str, float] = {}


class ExpenseIn(Schema):
    title: str = Field(max_length=500)
    amount: float
    category: str
    date: str


class PaymentIn(Schema):
    title: str = Field(max_length=500)
    amount: float
    category: str
    due_date: str


class PaymentPaidIn(Schema):
    paid: bool


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

    @classmethod
    def of(cls, m: models.Member) -> "UserOut":
        return cls(id=m.id, name=m.name, color=m.color)


class FamilyOut(Schema):
    id: str
    name: str
    invite_code: str
    members: list[UserOut]
    is_demo: bool

    @classmethod
    def of(cls, f: models.Family) -> "FamilyOut":
        return cls(
            id=f.id,
            name=f.name,
            invite_code=f.invite_code,
            members=[UserOut.of(m) for m in f.members if m.active],
            is_demo=f.is_demo,
        )


class SessionOut(Schema):
    """Выдаётся при создании семьи, входе по приглашению, демо и смене участника."""

    token: str
    current_user_id: str
    family: FamilyOut


class InvitePreviewOut(Schema):
    code: str
    family_name: str
    members_count: int


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

    @classmethod
    def of(cls, p: models.Payment) -> "PaymentOut":
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
        )


class PaymentPaidOut(Schema):
    payment: PaymentOut
    # Расход, созданный при оплате; null, если платёж вернули в «Предстоит» или он уже был в нужном статусе
    expense: ExpenseOut | None


class CopyPaymentsOut(Schema):
    added: int
    payments: list[PaymentOut]


class StateOut(Schema):
    """Всё, что нужно приложению на старте (loadInitialData)."""

    family: FamilyOut
    current_user_id: str
    budgets: list[BudgetOut]
    expenses: list[ExpenseOut]
    payments: list[PaymentOut]


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


class ErrorBody(Schema):
    code: str
    message: str
    field: str | None = None


class ErrorOut(Schema):
    error: ErrorBody
