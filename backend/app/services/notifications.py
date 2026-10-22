"""
Уведомления участникам и письма (docs/FEATURES.md §9).

notify() пишет уведомление каждому получателю (повтор того же события отбрасывается по dedupe_key)
и ставит письмо в очередь тем, у кого подтверждён e-mail и включены письма. Отправку делает фоновая
задача (send_pending); в режиме EMAIL_BACKEND=outbox письма только лежат в очереди.
"""
import asyncio
import logging
import smtplib
from email.message import EmailMessage
from email.utils import parseaddr

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from .. import clock
from ..config import get_settings
from ..domain.budget import compute_month_summary
from ..models import Budget, EmailOutbox, Member, Notification, Payment, new_id, now_ms

log = logging.getLogger("app.notifications")

MAX_SEND_ATTEMPTS = 5
PAYMENT_DUE_DAYS = 2


def _clip(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 1] + "…"


async def notify(
    db: AsyncSession, family_id: str, recipients: list[Member], kind: str, title: str, body: str,
    data: dict | None = None, dedupe_key: str | None = None,
) -> int:
    created = 0
    for member in recipients:
        if not member.active:
            continue
        result = await db.execute(
            insert(Notification).values(
                id=new_id(), family_id=family_id, member_id=member.id, kind=kind, title=_clip(title, 200),
                body=_clip(body, 500), data=data or {}, dedupe_key=dedupe_key or new_id(), created_at=now_ms(),
            ).on_conflict_do_nothing(constraint="uq_notifications_member_dedupe")
        )
        if result.rowcount and member.email and member.email_verified_at and member.notify_by_email:
            queue_email(db, member, title, body)
        created += result.rowcount
    return created


def queue_email(db: AsyncSession, member: Member, subject: str, body: str, to: str | None = None) -> None:
    db.add(EmailOutbox(member_id=member.id, to_email=to or member.email, subject=_clip(subject, 200),
                       body=_clip(body + "\n\n— Семейный бюджет", 2000)))


async def _family(db: AsyncSession, family_id: str) -> list[Member]:
    # Запрос, а не family.members: связь из кэша сессии подгружалась бы лениво (в async — ошибка)
    return list(await db.scalars(
        select(Member).where(Member.family_id == family_id, Member.left_at.is_(None)).order_by(Member.joined_at)
    ))


async def parents(db: AsyncSession, family_id: str, exclude: str | None = None) -> list[Member]:
    return [m for m in await _family(db, family_id) if m.is_parent and m.id != exclude]


async def everyone(db: AsyncSession, family_id: str, exclude: str | None = None) -> list[Member]:
    return [m for m in await _family(db, family_id) if m.id != exclude]


# ── События ──


_CATEGORY_NAMES = {"food": "Продукты", "housing": "Жильё", "transport": "Транспорт", "kids": "Дети", "other": "Другое"}


async def check_category_limit(db: AsyncSession, family_id: str, category: str, month_key: str, author_id: str) -> None:
    """После новой траты: категория перешла в «почти исчерпан» или «превышен» — сообщить взрослым."""
    budget = await db.get(Budget, (family_id, month_key))
    if budget is None or not budget.category_plans_kop.get(category):
        return
    from . import finance  # здесь, чтобы не было цикла импорта

    summary = compute_month_summary(
        month_key, budget,
        await finance.list_expenses(db, family_id, month_key),
        await finance.list_payments(db, family_id, month_key),
    )
    cat = next(c for c in summary.categories if c.key == category)
    if cat.status not in ("near", "over"):
        return
    name = _CATEGORY_NAMES[category]
    title = f"«{name}»: лимит превышен" if cat.status == "over" else f"«{name}»: лимит почти исчерпан"
    left = cat.left / 100
    body = f"С учётом предстоящих платежей осталось {left:,.2f} ₽".replace(",", " ").replace(".", ",")
    await notify(db, family_id, await parents(db, family_id, exclude=author_id), "category_limit", title, body,
                 {"category": category, "monthKey": month_key, "status": cat.status},
                 dedupe_key=f"category:{category}:{month_key}:{cat.status}")


async def payments_due(db: AsyncSession) -> int:
    """Фоновая задача: неоплаченные платежи со сроком сегодня–через 2 дня."""
    today = clock.today()
    soon = today.fromordinal(today.toordinal() + PAYMENT_DUE_DAYS)
    rows = await db.scalars(
        select(Payment).where(Payment.status == "upcoming", Payment.due_date >= today, Payment.due_date <= soon)
    )
    created = 0
    for p in rows:
        when = "сегодня" if p.due_date == today else p.due_date.strftime("%d.%m")
        created += await notify(
            db, p.family_id, await parents(db, p.family_id), "payment_due", f"Платёж «{p.title}» — {when}",
            f"Сумма {p.amount_kop / 100:,.2f} ₽".replace(",", " ").replace(".", ","),
            {"paymentId": p.id, "dueDate": p.due_date.isoformat()},
            dedupe_key=f"payment_due:{p.id}:{p.due_date.isoformat()}",
        )
    return created


# ── Отправка писем ──


def _send_smtp(messages: list[EmailMessage]) -> None:
    s = get_settings()
    with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=15) as smtp:
        if s.smtp_starttls:
            smtp.starttls()
        if s.smtp_user:
            smtp.login(s.smtp_user, s.smtp_password)
        for message in messages:
            smtp.send_message(message)


async def send_pending(db: AsyncSession, limit: int = 20) -> int:
    settings = get_settings()
    if settings.email_backend != "smtp" or not settings.smtp_host:
        return 0
    rows = list(await db.scalars(
        select(EmailOutbox).where(EmailOutbox.sent_at.is_(None), EmailOutbox.attempts < MAX_SEND_ATTEMPTS)
        .order_by(EmailOutbox.created_at).limit(limit).with_for_update(skip_locked=True)
    ))
    sent = 0
    for row in rows:
        message = EmailMessage()  # заголовки с переводом строки EmailMessage не пропустит — инъекция невозможна
        message["From"] = settings.smtp_from
        message["To"] = parseaddr(row.to_email)[1]
        message["Subject"] = row.subject
        message.set_content(row.body)
        row.attempts += 1
        try:
            await asyncio.to_thread(_send_smtp, [message])
            row.sent_at = now_ms()
            sent += 1
        except Exception as exc:  # повтор на следующем проходе
            row.last_error = _clip(type(exc).__name__ + ": " + str(exc), 300)
            log.warning("email send failed", extra={"extra_fields": {"outbox_id": row.id}})
    await db.commit()
    return sent


async def mark_read(db: AsyncSession, member: Member, notification_id: str | None = None) -> None:
    q = update(Notification).where(Notification.member_id == member.id, Notification.read_at.is_(None))
    if notification_id:
        q = q.where(Notification.id == notification_id)
    await db.execute(q.values(read_at=now_ms()))
    await db.commit()


async def list_for(db: AsyncSession, member: Member, unread_only: bool, before: int | None) -> list[Notification]:
    q = select(Notification).where(Notification.member_id == member.id)
    if unread_only:
        q = q.where(Notification.read_at.is_(None))
    if before:
        q = q.where(Notification.created_at < before)
    return list(await db.scalars(q.order_by(Notification.created_at.desc()).limit(50)))


async def unread_count(db: AsyncSession, member: Member) -> int:
    return int(await db.scalar(
        select(func.count()).select_from(Notification).where(
            Notification.member_id == member.id, Notification.read_at.is_(None)
        )
    ))

