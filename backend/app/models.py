"""
Таблицы. Деньги хранятся в копейках (BIGINT), чтобы суммы складывались без ошибок округления;
в API они уходят рублями с копейками, как ждёт фронтенд.
"""
import time
import uuid
from datetime import date

from sqlalchemy import JSON, BigInteger, Date, ForeignKey, Index, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def new_id() -> str:
    return str(uuid.uuid4())


def now_ms() -> int:
    return int(time.time() * 1000)


class Family(Base):
    __tablename__ = "families"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(80))
    invite_code: Mapped[str] = mapped_column(String(6), unique=True)
    is_demo: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

    members: Mapped[list["Member"]] = relationship(
        back_populates="family", order_by="Member.joined_at", lazy="selectin"
    )


class Member(Base):
    """Участник семьи. После выхода запись остаётся, чтобы у его расходов сохранился автор."""

    __tablename__ = "members"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(60))
    color: Mapped[str] = mapped_column(String(7))
    joined_at: Mapped[int] = mapped_column(BigInteger, default=now_ms)
    left_at: Mapped[int | None] = mapped_column(BigInteger, default=None)
    # parent — взрослый, управляет деньгами семьи; child — ребёнок, видит только свои карманные деньги
    role: Mapped[str] = mapped_column(String(8), default="parent", server_default="parent")

    family: Mapped[Family] = relationship(back_populates="members", lazy="joined")

    @property
    def active(self) -> bool:
        return self.left_at is None

    @property
    def is_parent(self) -> bool:
        return self.role == "parent"


class ChildInvite(Base):
    """Одноразовое приглашение ребёнка: кто войдёт по нему, получит роль child."""

    __tablename__ = "child_invites"

    code: Mapped[str] = mapped_column(String(6), primary_key=True)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"), index=True)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("members.id", ondelete="SET NULL"))
    created_at: Mapped[int] = mapped_column(BigInteger, default=now_ms)
    expires_at: Mapped[int] = mapped_column(BigInteger)
    used_at: Mapped[int | None] = mapped_column(BigInteger, default=None)
    used_by: Mapped[str | None] = mapped_column(ForeignKey("members.id", ondelete="SET NULL"), default=None)


class MemberSession(Base):
    """Сессия устройства. В базе только SHA-256 токена — утечка таблицы не даёт входа."""

    __tablename__ = "member_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    member_id: Mapped[str] = mapped_column(ForeignKey("members.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[int] = mapped_column(BigInteger, default=now_ms)
    # Последняя активность; сессия без запросов дольше SESSION_TTL_DAYS закрывается
    last_seen_at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)


class Budget(Base):
    """План семьи на месяц: общая сумма и лимиты по категориям (копейки)."""

    __tablename__ = "budgets"

    family_id: Mapped[str] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"), primary_key=True)
    month_key: Mapped[str] = mapped_column(String(7), primary_key=True)  # YYYY-MM
    total_kop: Mapped[int] = mapped_column(BigInteger)
    category_plans_kop: Mapped[dict[str, int]] = mapped_column(JSON)
    updated_at: Mapped[int] = mapped_column(BigInteger, default=now_ms, onupdate=now_ms)
    updated_by: Mapped[str | None] = mapped_column(ForeignKey("members.id", ondelete="SET NULL"), default=None)


class Payment(Base):
    """Обязательный платёж. Пока upcoming — сумма зарезервирована; после оплаты становится расходом."""

    __tablename__ = "payments"
    __table_args__ = (
        Index("ix_payments_family_due", "family_id", "due_date"),
        # Один платёж серии на месяц: несколько копий backend не создадут дубль
        UniqueConstraint("series_id", "series_month", name="uq_payments_series_month"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(120))
    amount_kop: Mapped[int] = mapped_column(BigInteger)
    category: Mapped[str] = mapped_column(String(16))
    due_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(16), default="upcoming")  # upcoming | paid
    author_id: Mapped[str | None] = mapped_column(ForeignKey("members.id", ondelete="SET NULL"))
    created_at: Mapped[int] = mapped_column(BigInteger, default=now_ms)
    # Повторяющийся платёж (docs/FEATURES.md §6): серия — платежи с одним series_id, по одному на месяц
    recurring: Mapped[bool] = mapped_column(default=False, server_default=text("false"))
    series_id: Mapped[str | None] = mapped_column(String(36), default=None)
    series_month: Mapped[str | None] = mapped_column(String(7), default=None)

    # Расход, в который превратился платёж (связь хранится на стороне расхода)
    expense: Mapped["Expense | None"] = relationship(back_populates="payment", lazy="selectin", uselist=False)


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = (
        Index("ix_expenses_family_date", "family_id", "date"),
        # Один кассовый чек — один расход в семье (docs/FEATURES.md §8)
        UniqueConstraint("family_id", "receipt_key", name="uq_expenses_family_receipt"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(120))
    amount_kop: Mapped[int] = mapped_column(BigInteger)
    category: Mapped[str] = mapped_column(String(16))
    date: Mapped[date] = mapped_column(Date)
    # Кто внёс запись (не обязательно тот, кто платил)
    author_id: Mapped[str | None] = mapped_column(ForeignKey("members.id", ondelete="SET NULL"))
    payment_id: Mapped[str | None] = mapped_column(
        ForeignKey("payments.id", ondelete="SET NULL"), unique=True, default=None
    )
    # Кто платил (по умолчанию автор) — для расчёта «кто кому должен» (docs/FEATURES.md §7)
    paid_by: Mapped[str | None] = mapped_column(ForeignKey("members.id", ondelete="SET NULL"), default=None)
    # Расход создан одобрением запроса на покупку (§3) — не уменьшает карманные деньги
    request_id: Mapped[str | None] = mapped_column(
        ForeignKey("purchase_requests.id", ondelete="SET NULL"), unique=True, default=None
    )
    # SHA-256 фискальных реквизитов чека (fn:i:fp); сами реквизиты не храним
    receipt_key: Mapped[str | None] = mapped_column(String(64), default=None)
    created_at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

    author: Mapped[Member | None] = relationship(lazy="selectin", foreign_keys=[author_id])
    payment: Mapped[Payment | None] = relationship(back_populates="expense")
    request: Mapped["PurchaseRequest | None"] = relationship(back_populates="expense")


class Allowance(Base):
    """Карманные деньги ребёнка: лимит трат на неделю или месяц (docs/FEATURES.md §2)."""

    __tablename__ = "allowances"

    member_id: Mapped[str] = mapped_column(ForeignKey("members.id", ondelete="CASCADE"), primary_key=True)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"), index=True)
    amount_kop: Mapped[int] = mapped_column(BigInteger)
    period: Mapped[str] = mapped_column(String(8))  # week | month
    updated_at: Mapped[int] = mapped_column(BigInteger, default=now_ms, onupdate=now_ms)
    updated_by: Mapped[str | None] = mapped_column(ForeignKey("members.id", ondelete="SET NULL"))


class PurchaseRequest(Base):
    """Запрос на покупку: участник просит, взрослый одобряет или отклоняет (§3)."""

    __tablename__ = "purchase_requests"
    __table_args__ = (Index("ix_purchase_requests_family_status", "family_id", "status"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"))
    author_id: Mapped[str | None] = mapped_column(ForeignKey("members.id", ondelete="SET NULL"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    amount_kop: Mapped[int] = mapped_column(BigInteger)
    category: Mapped[str] = mapped_column(String(16))
    comment: Mapped[str | None] = mapped_column(String(300), default=None)
    status: Mapped[str] = mapped_column(String(10), default="pending")  # pending|approved|rejected|cancelled
    decided_by: Mapped[str | None] = mapped_column(ForeignKey("members.id", ondelete="SET NULL"), default=None)
    decided_at: Mapped[int | None] = mapped_column(BigInteger, default=None)
    decision_comment: Mapped[str | None] = mapped_column(String(300), default=None)
    created_at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

    expense: Mapped[Expense | None] = relationship(back_populates="request", lazy="selectin", uselist=False)


class Goal(Base):
    """Цель-копилка семьи (docs/FEATURES.md §4)."""

    __tablename__ = "goals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(80))
    target_kop: Mapped[int] = mapped_column(BigInteger)
    deadline: Mapped[date | None] = mapped_column(Date, default=None)
    status: Mapped[str] = mapped_column(String(10), default="active")  # active | achieved | archived
    created_by: Mapped[str | None] = mapped_column(ForeignKey("members.id", ondelete="SET NULL"))
    created_at: Mapped[int] = mapped_column(BigInteger, default=now_ms)
    achieved_at: Mapped[int | None] = mapped_column(BigInteger, default=None)


class GoalContribution(Base):
    __tablename__ = "goal_contributions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    goal_id: Mapped[str] = mapped_column(ForeignKey("goals.id", ondelete="CASCADE"), index=True)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"))
    member_id: Mapped[str | None] = mapped_column(ForeignKey("members.id", ondelete="SET NULL"), index=True)
    amount_kop: Mapped[int] = mapped_column(BigInteger)
    date: Mapped[date] = mapped_column(Date)
    created_at: Mapped[int] = mapped_column(BigInteger, default=now_ms)


class Settlement(Base):
    """Отметка «перевёл долг»: from_id перевёл to_id сумму в счёт расчётов месяца (§7)."""

    __tablename__ = "settlements"
    __table_args__ = (Index("ix_settlements_family_month", "family_id", "month_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"))
    month_key: Mapped[str] = mapped_column(String(7))
    from_id: Mapped[str | None] = mapped_column(ForeignKey("members.id", ondelete="SET NULL"))
    to_id: Mapped[str | None] = mapped_column(ForeignKey("members.id", ondelete="SET NULL"))
    amount_kop: Mapped[int] = mapped_column(BigInteger)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("members.id", ondelete="SET NULL"))
    created_at: Mapped[int] = mapped_column(BigInteger, default=now_ms)


class IdempotencyRecord(Base):
    """Ответ на уже обработанную отправку формы — повтор с тем же ключом получает его же."""

    __tablename__ = "idempotency_records"

    scope: Mapped[str] = mapped_column(String(40), primary_key=True)  # id участника или "anon"
    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    fingerprint: Mapped[str] = mapped_column(String(64))
    response: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)
