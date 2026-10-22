"""
Профиль участника: e-mail для уведомлений с подтверждением кодом (docs/FEATURES.md §9).

Код — 6 цифр из secrets, действует 15 минут, 5 попыток; в базе только HMAC-хеш, привязанный к участнику.
Сравнение — за постоянное время. Сменить адрес можно не чаще 5 раз в час (лимит в Redis).
"""
import hashlib
import hmac
import re
import secrets

from sqlalchemy.ext.asyncio import AsyncSession

from ..errors import TooManyRequests, ValidationFailed
from ..models import Member, now_ms
from ..ratelimit import hit
from ..schemas import MeOut
from .notifications import queue_email

CODE_TTL_MS = 15 * 60_000
MAX_CODE_ATTEMPTS = 5
EMAIL_CHANGES_PER_HOUR = 5
_EMAIL_RE = re.compile(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$")


def to_out(m: Member) -> MeOut:
    return MeOut(
        id=m.id, name=m.name, role=m.role, email=m.email, email_verified=m.email_verified_at is not None,
        notify_by_email=m.notify_by_email, pending_email=m.pending_email,
        vtb_linked=m.oidc_sub is not None,
    )


def clean_email(value: str) -> str:
    value = (value or "").strip()
    if len(value) > 254 or not _EMAIL_RE.match(value):
        raise ValidationFailed("Проверьте адрес электронной почты", "email")
    local, _, domain = value.partition("@")
    return f"{local}@{domain.lower()}"


def _code_hash(member_id: str, code: str) -> str:
    return hmac.new(member_id.encode(), code.encode(), hashlib.sha256).hexdigest()


async def request_email(db: AsyncSession, member: Member, email: str) -> None:
    address = clean_email(email)
    if not await hit(f"email-change:{member.id}", EMAIL_CHANGES_PER_HOUR, 3600):
        raise TooManyRequests("Слишком много попыток сменить адрес. Попробуйте через час.")
    code = f"{secrets.randbelow(1_000_000):06d}"
    member.pending_email = address
    member.email_code_hash = _code_hash(member.id, code)
    member.email_code_expires_at = now_ms() + CODE_TTL_MS
    member.email_code_attempts = 0
    queue_email(db, member, "Код подтверждения адреса",
                f"Ваш код: {code}\nОн действует 15 минут. Если вы не запрашивали код — просто удалите письмо.",
                to=address)
    await db.commit()


async def verify_email(db: AsyncSession, member: Member, code: str) -> MeOut:
    if not member.pending_email or not member.email_code_hash:
        raise ValidationFailed("Сначала укажите адрес — мы пришлём код", "code")
    if member.email_code_expires_at < now_ms() or member.email_code_attempts >= MAX_CODE_ATTEMPTS:
        raise ValidationFailed("Код устарел. Запросите новый", "code")
    member.email_code_attempts += 1
    if not hmac.compare_digest(member.email_code_hash, _code_hash(member.id, (code or "").strip())):
        await db.commit()
        raise ValidationFailed("Неверный код", "code")
    member.email, member.email_verified_at = member.pending_email, now_ms()
    member.pending_email = member.email_code_hash = member.email_code_expires_at = None
    member.email_code_attempts = 0
    await db.commit()
    return to_out(member)


def clear_email(member: Member) -> None:
    """Стереть адрес и всё, что с ним связано (выход из семьи, по просьбе участника)."""
    member.email = member.email_verified_at = member.pending_email = None
    member.email_code_hash = member.email_code_expires_at = None
    member.email_code_attempts = 0
    member.notify_by_email = False


async def set_email_notifications(db: AsyncSession, member: Member, enabled: bool) -> MeOut:
    if enabled and not member.email_verified_at:
        raise ValidationFailed("Сначала подтвердите адрес электронной почты", "email")
    member.notify_by_email = enabled
    await db.commit()
    return to_out(member)
