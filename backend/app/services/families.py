import hashlib

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..errors import Conflict, Forbidden, NotFound, ValidationFailed
from ..models import ChildInvite, Family, Member, MemberSession, now_ms
from ..schemas import ChildInviteOut, CreateFamilyIn, FamilyOut, InvitePreviewOut, JoinFamilyIn, SessionOut
from ..security import MEMBER_COLORS, hash_token, new_invite_code, new_token
from ..validation import clean_name, normalize_invite_code
from . import idempotency

MAX_MEMBERS = 10
MAX_ACTIVE_CHILD_INVITES = 5
CHILD_INVITE_TTL_MS = 7 * 86_400_000
ROLES = ("parent", "child")


async def load_family(db: AsyncSession, family_id: str) -> Family:
    """Свежая семья со списком участников (в обход кэша сессии)."""
    family = await db.scalar(
        select(Family).where(Family.id == family_id).execution_options(populate_existing=True)
    )
    if family is None:
        raise NotFound("Семья не найдена")
    return family


async def issue_session(db: AsyncSession, member_id: str) -> SessionOut:
    """Новый токен для участника. Сам токен в базе не хранится — только его хеш."""
    token = new_token()
    db.add(MemberSession(token_hash=hash_token(token), member_id=member_id))
    await db.commit()
    member = await db.get(Member, member_id)
    family = await load_family(db, member.family_id)
    return SessionOut(token=token, current_user_id=member_id, family=FamilyOut.of(family, member))


async def unique_invite_code(db: AsyncSession) -> str:
    """Код, не занятый ни семьёй, ни детским приглашением: оба вводятся в одно поле."""
    while True:
        code = new_invite_code()
        taken = await db.scalar(select(Family.id).where(Family.invite_code == code)) or await db.get(ChildInvite, code)
        if not taken:
            return code


def anon_scope(client_ip: str) -> str:
    """Ключи идемпотентности анонимных запросов привязаны к IP: чужой ключ с другого адреса не сработает."""
    return "anon:" + hashlib.sha256(client_ip.encode()).hexdigest()[:32]


def _active(family: Family) -> list[Member]:
    return [m for m in family.members if m.active]


def _next_color(total_ever: int) -> str:
    return MEMBER_COLORS[total_ever % len(MEMBER_COLORS)]


async def create_family(db: AsyncSession, body: CreateFamilyIn, idem_key: str | None, client_ip: str) -> SessionOut:
    family_name = clean_name(body.family_name, "familyName", "Укажите название семьи", max_len=80)
    user_name = clean_name(body.user_name, "userName", "Укажите ваше имя")

    async def action() -> dict:
        family = Family(name=family_name, invite_code=await unique_invite_code(db))
        member = Member(family=family, name=user_name, color=MEMBER_COLORS[0], role="parent")
        db.add_all([family, member])
        await db.flush()
        return {"memberId": member.id}

    # В записи идемпотентности только id участника: повтор получит новый токен, а не сохранённый
    fp = idempotency.fingerprint("create_family", family_name, user_name)
    result = await idempotency.run(db, anon_scope(client_ip), idem_key, fp, action)
    return await issue_session(db, result["memberId"])


async def resolve_invite(db: AsyncSession, code: str, lock: bool = False) -> tuple[Family, ChildInvite | None]:
    """Код семьи (вход взрослого) или действующее детское приглашение (вход ребёнка)."""
    normalized = normalize_invite_code(code)
    family = await db.scalar(select(Family).where(Family.invite_code == normalized))
    if family is not None:
        return family, None
    invite = await db.get(ChildInvite, normalized, with_for_update=lock, populate_existing=lock)
    if invite is None or invite.used_at is not None or invite.expires_at < now_ms():
        raise NotFound("Приглашение не найдено. Попросите прислать ссылку ещё раз.", "code")
    return await load_family(db, invite.family_id), invite


async def invite_preview(db: AsyncSession, code: str) -> InvitePreviewOut:
    family, child_invite = await resolve_invite(db, code)
    return InvitePreviewOut(
        code=normalize_invite_code(code),
        family_name=family.name,
        members_count=len(_active(family)),
        role="child" if child_invite else "parent",
    )


async def join_family(
    db: AsyncSession, code: str, body: JoinFamilyIn, idem_key: str | None, client_ip: str
) -> SessionOut:
    user_name = clean_name(body.user_name, "userName", "Укажите ваше имя")
    normalized = normalize_invite_code(code)

    async def action() -> dict:
        # Детский код гасится в той же транзакции; блокировка — чтобы двое не вошли по одному коду
        family, child_invite = await resolve_invite(db, normalized, lock=True)
        if len(_active(family)) >= MAX_MEMBERS:
            raise Conflict(f"В семье уже {MAX_MEMBERS} участников")
        total_ever = await db.scalar(select(func.count()).where(Member.family_id == family.id))
        member = Member(
            family_id=family.id,
            name=user_name,
            color=_next_color(total_ever),
            role="child" if child_invite else "parent",
        )
        db.add(member)
        await db.flush()
        if child_invite:
            child_invite.used_at = now_ms()
            child_invite.used_by = member.id
        return {"memberId": member.id, "familyId": family.id}

    fp = idempotency.fingerprint("join_family", normalized, user_name)
    result = await idempotency.run(db, anon_scope(client_ip), idem_key, fp, action)
    return await issue_session(db, result["memberId"])


async def rotate_invite_code(db: AsyncSession, member: Member) -> FamilyOut:
    """Новый код приглашения: старые ссылки перестают работать (если ссылка попала не тому человеку)."""
    family = await load_family(db, member.family_id)
    family.invite_code = await unique_invite_code(db)
    await db.commit()
    return FamilyOut.of(family, member)


async def create_child_invite(db: AsyncSession, member: Member) -> ChildInviteOut:
    now = now_ms()
    active = await db.scalar(
        select(func.count()).select_from(ChildInvite).where(
            ChildInvite.family_id == member.family_id, ChildInvite.used_at.is_(None), ChildInvite.expires_at > now
        )
    )
    if active >= MAX_ACTIVE_CHILD_INVITES:
        raise Conflict(f"Уже есть {MAX_ACTIVE_CHILD_INVITES} неиспользованных приглашений для детей")
    invite = ChildInvite(
        code=await unique_invite_code(db),
        family_id=member.family_id,
        created_by=member.id,
        expires_at=now + CHILD_INVITE_TTL_MS,
    )
    db.add(invite)
    await db.commit()
    return ChildInviteOut(code=invite.code, expires_at=invite.expires_at)


async def _target(db: AsyncSession, actor: Member, member_id: str) -> tuple[Family, Member]:
    family = await load_family(db, actor.family_id)
    target = next((m for m in _active(family) if m.id == member_id), None)
    if target is None:
        raise NotFound("Участник не найден")
    return family, target


def _other_parents(family: Family, member: Member) -> list[Member]:
    return [m for m in _active(family) if m.is_parent and m.id != member.id]


async def set_role(db: AsyncSession, actor: Member, member_id: str, role: str) -> FamilyOut:
    if role not in ROLES:
        raise ValidationFailed("Роль: parent или child", "role")
    family, target = await _target(db, actor, member_id)
    if target.is_parent and role == "child" and not _other_parents(family, target):
        raise Conflict("В семье должен остаться хотя бы один взрослый")
    target.role = role
    await db.commit()
    return FamilyOut.of(await load_family(db, actor.family_id), actor)


async def _deactivate(db: AsyncSession, member: Member) -> None:
    member.left_at = now_ms()
    await db.execute(delete(MemberSession).where(MemberSession.member_id == member.id))


async def remove_member(db: AsyncSession, actor: Member, member_id: str) -> None:
    """Исключение: сессии закрываются, записи остаются семье с прежним автором."""
    if member_id == actor.id:
        raise ValidationFailed("Чтобы выйти самому, используйте «Выйти из семьи»")
    _, target = await _target(db, actor, member_id)
    await _deactivate(db, target)
    await db.commit()


async def leave_family(db: AsyncSession, member: Member) -> None:
    """Участник выходит: его записи остаются семье, сессии закрываются. Последний вышедший удаляет семью."""
    family = await load_family(db, member.family_id)
    others = [m for m in _active(family) if m.id != member.id]
    if member.is_parent and others and not _other_parents(family, member):
        raise Conflict("Вы последний взрослый в семье. Сначала назначьте взрослым другого участника.")
    await _deactivate(db, member)
    if not others:
        # Удаление каскадом на уровне БД (ON DELETE CASCADE)
        await db.execute(delete(Family).where(Family.id == family.id))
    await db.commit()


async def switch_demo_user(db: AsyncSession, member: Member, user_id: str) -> SessionOut:
    family = await load_family(db, member.family_id)
    if not family.is_demo:
        raise Forbidden("Переключение участников доступно только в демо-режиме")
    if not any(m.id == user_id and m.active for m in family.members):
        raise NotFound("Участник не найден")
    return await issue_session(db, user_id)
