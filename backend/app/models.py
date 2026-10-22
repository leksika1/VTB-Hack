"""
Таблицы. Деньги хранятся в копейках (BIGINT), чтобы суммы складывались без ошибок округления;
в API они уходят рублями с копейками, как ждёт фронтенд.
"""
import time
import uuid
from datetime import date

from sqlalchemy import JSON, BigInteger, Date, ForeignKey, Index, String
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

    family: Mapped[Family] = relationship(back_populates="members", lazy="joined")

    @property
    def active(self) -> bool:
        return self.left_at is None


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
    __table_args__ = (Index("ix_payments_family_due", "family_id", "due_date"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    family_id: Mapped[str] = mapped_column(ForeignKey("families.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(120))
    amount_kop: Mapped[int] = mapped_column(BigInteger)
    category: Mapped[str] = mapped_column(String(16))
    due_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(16), default="upcoming")  # upcoming | paid
    author_id: Mapped[str | None] = mapped_column(ForeignKey("members.id", ondelete="SET NULL"))
    created_at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

    # Расход, в который превратился платёж (связь хранится на стороне расхода)
    expense: Mapped["Expense | None"] = relationship(back_populates="payment", lazy="selectin", uselist=False)


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = (Index("ix_expenses_family_date", "family_id", "date"),)

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
    created_at: Mapped[int] = mapped_column(BigInteger, default=now_ms)

    author: Mapped[Member | None] = relationship(lazy="selectin")
    payment: Mapped[Payment | None] = relationship(back_populates="expense")


class IdempotencyRecord(Base):
    """Ответ на уже обработанную отправку формы — повтор с тем же ключом получает его же."""

    __tablename__ = "idempotency_records"

    scope: Mapped[str] = mapped_column(String(40), primary_key=True)  # id участника или "anon"
    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    fingerprint: Mapped[str] = mapped_column(String(64))
    response: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[int] = mapped_column(BigInteger, default=now_ms, index=True)
