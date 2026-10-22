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
    # Постоянный детский код: вошедший по нему — ребёнок (после подтверждения взрослым)
    child_invite_code: Mapped[str | None] = mapped_column(String(6), unique=True, default=None)
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
    # pending — вошёл по коду и ждёт подтверждения взрослого: данных семьи не видит; active — участник
    status: Mapped[str] = mapped_column(String(8), default="active", server_default="active")
    # E-mail для уведомлений (docs/FEATURES.md §9): только подтверждённый получает письма.
    # Код подтверждения хранится хешем; при выходе из семьи всё стирается
    email: Mapped[str | None] = mapped_column(String(254), default=None)
    email_verified_at: Mapped[int | None] = mapped_column(BigInteger, default=None)
    notify_by_email: Mapped[bool] = mapped_column(default=False, server_default=text("false"))
    pending_email: Mapped[str | None] = mapped_column(String(254), default=None)
    email_code_hash: Mapped[str | None] = mapped_column(String(64), default=None)
    email_code_expires_at: Mapped[int | None] = mapped_column(BigInteger, default=None)
    email_code_attempts: Mapped[int] = mapped_column(default=0, server_default=text("0"))
    # Учётная запись ВТБ ID (sub из id_token); одна учётная запись — один участник
    oidc_sub: Mapped[str | None] = mapped_column(String(255), unique=True, default=None)

    family: Mapped[Family] = relationship(back_populates="members", lazy="joined")

    @property
    def present(self) -> bool:
        """Не вышел из семьи (в том числе ещё ждёт подтверждения)."""
        return self.left_at is None

    @property
    def active(self) -> bool:
        """Полноправный участник: не вышел и подтверждён."""
        return self.left_at is None and self.status == "active"

    @property
    def pending(self) -> bool:
        return self.left_at is None and self.status == "pending"

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


class InviteLink(Base):
    """Многоразовая ссылка-приглашение: вошедшие по ней сразу в семье, без подтверждения (docs/FEATURES.md §1).
    Действует до отзыва или срока. Хранится только SHA-256 кода — как у токенов сессий."""

    __tablename__ = "invite_links"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"), index=True)
    code_hash: Mapped[str] = mapped_column(String(64), unique=True)
    role: Mapped[str] = mapped_column(String(8))
    created_by: Mapped[str | None] = mapped_column(ForeignKey("members.id", ondelete="SET NULL"))
    created_at: Mapped[int] = mapped_column(BigInteger, default=now_ms)
    expires_at: Mapped[int] = mapped_column(BigInteger)
    uses: Mapped[int] = mapped_column(default=0, server_default="0")
    last_used_at: Mapped[int | None] = mapped_column(BigInteger, default=None)


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
        # Одна строка выписки — один расход в семье (docs/FEATURES.md §10)
        UniqueConstraint("family_id", "import_fingerprint", name="uq_expenses_family_import"),
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
    import_fingerprint: Mapped[str | None] = mapped_column(String(64), default=None)
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


class Notification(Base):
    """Уведомление участнику (docs/FEATURES.md §9). dedupe_key — одно уведомление на событие."""

    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_member_created", "member_id", "created_at"),
        UniqueConstraint("member_id", "dedupe_key", name="uq_notifications_member_dedupe"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"))
    member_id: Mapped[str] = mapped_column(ForeignKey("members.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(32))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(String(500))
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    dedupe_key: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)
    read_at: Mapped[int | None] = mapped_column(BigInteger, default=None)


class EmailOutbox(Base):
    """Очередь писем: отправляет фоновая задача (SMTP) с повторами; в разработке письма остаются здесь."""

    __tablename__ = "email_outbox"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    member_id: Mapped[str | None] = mapped_column(ForeignKey("members.id", ondelete="CASCADE"), index=True)
    to_email: Mapped[str] = mapped_column(String(254))
    subject: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(String(2000))
    created_at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)
    sent_at: Mapped[int | None] = mapped_column(BigInteger, default=None)
    attempts: Mapped[int] = mapped_column(default=0)
    last_error: Mapped[str | None] = mapped_column(String(300), default=None)


class StatementImport(Base):
    """Загруженная выписка: строки ждут подтверждения, расходами становятся только после него (§10)."""

    __tablename__ = "statement_imports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"), index=True)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("members.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(10), default="pending")  # pending | confirmed
    filename: Mapped[str] = mapped_column(String(120))
    total_rows: Mapped[int] = mapped_column(default=0)
    skipped_income: Mapped[int] = mapped_column(default=0)
    imported: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)

    rows: Mapped[list["ImportRow"]] = relationship(lazy="selectin", order_by="ImportRow.row_no",
                                                   cascade="all, delete-orphan", passive_deletes=True)


class ImportRow(Base):
    __tablename__ = "import_rows"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    import_id: Mapped[str] = mapped_column(ForeignKey("statement_imports.id", ondelete="CASCADE"), index=True)
    row_no: Mapped[int] = mapped_column()
    date: Mapped[date | None] = mapped_column(Date, default=None)
    amount_kop: Mapped[int | None] = mapped_column(BigInteger, default=None)
    description: Mapped[str] = mapped_column(String(120), default="")
    mcc: Mapped[str | None] = mapped_column(String(4), default=None)
    suggested_category: Mapped[str] = mapped_column(String(16), default="other")
    fingerprint: Mapped[str | None] = mapped_column(String(64), default=None)
    duplicate: Mapped[bool] = mapped_column(default=False)
    error: Mapped[str | None] = mapped_column(String(120), default=None)
    expense_id: Mapped[str | None] = mapped_column(ForeignKey("expenses.id", ondelete="SET NULL"), default=None)


class CategoryRule(Base):
    """Запомненное исправление категории: «описание похоже на X → категория Y» для семьи."""

    __tablename__ = "category_rules"

    family_id: Mapped[str] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"), primary_key=True)
    pattern: Mapped[str] = mapped_column(String(120), primary_key=True)
    category: Mapped[str] = mapped_column(String(16))
    updated_at: Mapped[int] = mapped_column(BigInteger, default=now_ms, onupdate=now_ms)


class IdempotencyRecord(Base):
    """Ответ на уже обработанную отправку формы — повтор с тем же ключом получает его же."""

    __tablename__ = "idempotency_records"

    scope: Mapped[str] = mapped_column(String(40), primary_key=True)  # id участника или "anon"
    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    fingerprint: Mapped[str] = mapped_column(String(64))
    response: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)
