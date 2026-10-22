import hashlib

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..errors import Conflict, Forbidden, NotFound, ValidationFailed
from ..models import ChildInvite, Family, InviteLink, Member, MemberSession, now_ms
from ..schemas import (
    ChildInviteOut,
    CreateFamilyIn,
    FamilyOut,
    InviteLinkOut,
    InvitePreviewOut,
    JoinFamilyIn,
    SessionOut,
)
from ..security import MEMBER_COLORS, hash_token, new_invite_code, new_invite_link_code, new_token
from ..validation import clean_name, normalize_invite_code
from . import idempotency, notifications
from .me import clear_email

MAX_MEMBERS = 10
INVITE_LINK_CODE_LENGTH = 16
INVITE_LINK_TTL_MS = 7 * 86_400_000
MAX_ACTIVE_INVITE_LINKS = 10
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
    """Код, не занятый ни кодом семьи, ни детским кодом, ни старым одноразовым приглашением."""
    while True:
        code = new_invite_code()
        taken = (
            await db.scalar(select(Family.id).where((Family.invite_code == code) | (Family.child_invite_code == code)))
            or await db.get(ChildInvite, code)
        )
        if not taken:
            return code


async def ensure_child_code(db: AsyncSession, family: Family) -> str:
    """Постоянный детский код семьи (у семей, созданных раньше, появляется при первом запросе)."""
    if not family.child_invite_code:
        code = await unique_invite_code(db)
        while code == family.invite_code:
            code = await unique_invite_code(db)
        family.child_invite_code = code
        await db.flush()
    return family.child_invite_code


def anon_scope(client_ip: str) -> str:
    """Ключи идемпотентности анонимных запросов привязаны к IP: чужой ключ с другого адреса не сработает."""
    return "anon:" + hashlib.sha256(client_ip.encode()).hexdigest()[:32]


async def _link_sub(db: AsyncSession, token: str | None) -> str | None:
    # Внутри action: при повторе запроса с тем же Idempotency-Key одноразовый токен не нужен повторно
    from .auth import consume_link_token

    return await consume_link_token(db, token)


def _active(family: Family) -> list[Member]:
    return [m for m in family.members if m.active]


def _next_color(total_ever: int) -> str:
    return MEMBER_COLORS[total_ever % len(MEMBER_COLORS)]


async def create_family(db: AsyncSession, body: CreateFamilyIn, idem_key: str | None, client_ip: str) -> SessionOut:
    family_name = clean_name(body.family_name, "familyName", "Укажите название семьи", max_len=80)
    user_name = clean_name(body.user_name, "userName", "Укажите ваше имя")

    async def action() -> dict:
        family = Family(name=family_name, invite_code=await unique_invite_code(db))
        member = Member(family=family, name=user_name, color=MEMBER_COLORS[0], role="parent",
                        oidc_sub=await _link_sub(db, body.oidc_link_token))
        db.add_all([family, member])
        await db.flush()
        await ensure_child_code(db, family)
        return {"memberId": member.id}

    # В записи идемпотентности только id участника: повтор получит новый токен, а не сохранённый
    fp = idempotency.fingerprint("create_family", family_name, user_name)
    result = await idempotency.run(db, anon_scope(client_ip), idem_key, fp, action)
    return await issue_session(db, result["memberId"])


async def resolve_invite(
    db: AsyncSession, code: str, lock: bool = False
) -> tuple[Family, str, ChildInvite | InviteLink | None]:
    """(семья, роль входящего, одноразовое приглашение или None).
    Код семьи — взрослый, постоянный детский код — ребёнок, ссылка-приглашение — роль, выбранная взрослым;
    старые одноразовые детские приглашения ещё действуют."""
    normalized = normalize_invite_code(code)
    if len(normalized) == INVITE_LINK_CODE_LENGTH:
        q = select(InviteLink).where(InviteLink.code_hash == hash_token(normalized))
        link = await db.scalar(q.with_for_update().execution_options(populate_existing=True) if lock else q)
        if link is None or link.expires_at < now_ms():
            raise NotFound("Ссылка недействительна: её отозвали или срок истёк. Попросите новую.", "code")
        return await load_family(db, link.family_id), link.role, link
    family = await db.scalar(select(Family).where(Family.invite_code == normalized))
    if family is not None:
        return family, "parent", None
    family = await db.scalar(select(Family).where(Family.child_invite_code == normalized))
    if family is not None:
        return family, "child", None
    invite = await db.get(ChildInvite, normalized, with_for_update=lock, populate_existing=lock)
    if invite is None or invite.used_at is not None or invite.expires_at < now_ms():
        raise NotFound("Приглашение не найдено. Попросите прислать ссылку ещё раз.", "code")
    return await load_family(db, invite.family_id), "child", invite


async def invite_preview(db: AsyncSession, code: str) -> InvitePreviewOut:
    family, role, ticket = await resolve_invite(db, code)
    return InvitePreviewOut(
        code=normalize_invite_code(code),
        family_name=family.name,
        members_count=len(_active(family)),
        role=role,
        needs_approval=not isinstance(ticket, InviteLink),
    )


async def join_family(
    db: AsyncSession, code: str, body: JoinFamilyIn, idem_key: str | None, client_ip: str
) -> SessionOut:
    user_name = clean_name(body.user_name, "userName", "Укажите ваше имя")
    normalized = normalize_invite_code(code)

    async def action() -> dict:
        # Блокировка приглашения: одноразовый детский код гасится один раз, счётчик ссылки не теряет входы
        family, role, ticket = await resolve_invite(db, normalized, lock=True)
        direct = isinstance(ticket, InviteLink)
        # Ожидающие тоже занимают место: посторонние с кодом не могут бесконечно «стучаться»
        if sum(1 for m in family.members if m.present) >= MAX_MEMBERS:
            raise Conflict(f"В семье уже {MAX_MEMBERS} участников")
        total_ever = await db.scalar(select(func.count()).where(Member.family_id == family.id))
        member = Member(
            family_id=family.id,
            name=user_name,
            color=_next_color(total_ever),
            role=role,
            # По коду — данные семьи только после подтверждения взрослым; по ссылке-приглашению — сразу
            status="active" if direct else "pending",
            oidc_sub=await _link_sub(db, body.oidc_link_token),
        )
        db.add(member)
        await db.flush()
        if direct:
            ticket.uses += 1
            ticket.last_used_at = now_ms()
        elif ticket:
            ticket.used_at = now_ms()
            ticket.used_by = member.id
        who = "взрослым" if role == "parent" else "ребёнком"
        if direct:
            await notifications.notify(
                db, family.id, [m for m in _active(family) if m.id != member.id], "member_joined",
                f"{member.name} теперь в семье", f"Вошёл {who} по ссылке-приглашению", {"memberId": member.id},
                dedupe_key=f"member_joined:{member.id}",
            )
        else:
            await notifications.notify(
                db, family.id, [m for m in _active(family) if m.is_parent], "member_join_request",
                f"{member.name} просит доступ к семье",
                f"Хочет войти {who}. Подтвердите или отклоните на вкладке «Семья»",
                {"memberId": member.id, "role": role}, dedupe_key=f"member_join_request:{member.id}",
            )
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
    """Постоянный детский код семьи (как код семьи, но вошедший по нему — ребёнок)."""
    family = await load_family(db, member.family_id)
    code = await ensure_child_code(db, family)
    await db.commit()
    return ChildInviteOut(code=code, expires_at=None)


def _live_links(family_id: str):
    return select(InviteLink).where(InviteLink.family_id == family_id, InviteLink.expires_at >= now_ms())


async def create_invite_link(db: AsyncSession, member: Member, role: str) -> InviteLinkOut:
    """Многоразовая ссылка: по ней входят сразу, без подтверждения, пока её не отзовут или не истечёт срок.
    Код виден только в этом ответе."""
    if role not in ROLES:
        raise ValidationFailed("Роль: parent или child", "role")
    # Блокировка семьи — чтобы параллельные запросы не обошли лимит
    await db.execute(select(Family.id).where(Family.id == member.family_id).with_for_update())
    live = await db.scalar(select(func.count()).select_from(_live_links(member.family_id).subquery()))
    if live >= MAX_ACTIVE_INVITE_LINKS:
        raise Conflict(f"Действующих ссылок уже {MAX_ACTIVE_INVITE_LINKS}. Отзовите ненужные.")
    code = new_invite_link_code()
    link = InviteLink(family_id=member.family_id, code_hash=hash_token(code), role=role, created_by=member.id,
                      expires_at=now_ms() + INVITE_LINK_TTL_MS)
    db.add(link)
    await db.commit()
    return InviteLinkOut.of(link, code)


async def list_invite_links(db: AsyncSession, member: Member) -> list[InviteLinkOut]:
    links = await db.scalars(_live_links(member.family_id).order_by(InviteLink.created_at.desc()))
    return [InviteLinkOut.of(link) for link in links]


async def revoke_invite_link(db: AsyncSession, member: Member, link_id: str) -> None:
    result = await db.execute(
        delete(InviteLink).where(InviteLink.id == link_id, InviteLink.family_id == member.family_id)
    )
    if not result.rowcount:
        raise NotFound("Ссылка не найдена — возможно, её уже отозвали")
    await db.commit()


async def _revoke_links_of(db: AsyncSession, member: Member) -> None:
    """Ссылки того, кто больше не взрослый в семье, перестают работать."""
    await db.execute(delete(InviteLink).where(InviteLink.created_by == member.id))


async def rotate_child_code(db: AsyncSession, member: Member) -> FamilyOut:
    """Новый детский код: старый перестаёт работать."""
    family = await load_family(db, member.family_id)
    family.child_invite_code = None
    await db.flush()
    await ensure_child_code(db, family)
    await db.commit()
    return FamilyOut.of(family, member)


async def approve_member(db: AsyncSession, actor: Member, member_id: str) -> FamilyOut:
    """Взрослый подтверждает вход: участник начинает видеть данные семьи."""
    family = await load_family(db, actor.family_id)
    target = next((m for m in family.members if m.id == member_id and m.pending), None)
    if target is None:
        raise NotFound("Заявка не найдена — возможно, её уже рассмотрели")
    target.status = "active"
    await db.flush()
    await notifications.notify(db, family.id, [target], "member_approved", "Вход в семью подтверждён",
                               f"{actor.name} открыл(а) вам доступ к семье «{family.name}»",
                               {"memberId": target.id}, dedupe_key=f"member_approved:{target.id}")
    others = [m for m in _active(family) if m.id not in (target.id, actor.id)]
    await notifications.notify(db, family.id, others, "member_joined", f"{target.name} теперь в семье",
                               "Взрослый" if target.is_parent else "Ребёнок", {"memberId": target.id},
                               dedupe_key=f"member_joined:{target.id}")
    await db.commit()
    return FamilyOut.of(await load_family(db, actor.family_id), actor)


async def _target(
    db: AsyncSession, actor: Member, member_id: str, include_pending: bool = False
) -> tuple[Family, Member]:
    family = await load_family(db, actor.family_id)
    pool = [m for m in family.members if m.present] if include_pending else _active(family)
    target = next((m for m in pool if m.id == member_id), None)
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
    if role == "child":
        await _revoke_links_of(db, target)
    await db.commit()
    return FamilyOut.of(await load_family(db, actor.family_id), actor)


async def _deactivate(db: AsyncSession, member: Member) -> None:
    member.left_at = now_ms()
    clear_email(member)  # 152-ФЗ: не храним адрес того, кто больше не в семье
    await _revoke_links_of(db, member)
    await db.execute(delete(MemberSession).where(MemberSession.member_id == member.id))


async def remove_member(db: AsyncSession, actor: Member, member_id: str) -> None:
    """Исключение участника или отказ ожидающему: сессии закрываются, записи остаются семье."""
    if member_id == actor.id:
        raise ValidationFailed("Чтобы выйти самому, используйте «Выйти из семьи»")
    _, target = await _target(db, actor, member_id, include_pending=True)
    await _deactivate(db, target)
    await db.commit()


async def leave_family(db: AsyncSession, member: Member) -> None:
    """Участник выходит: его записи остаются семье, сессии закрываются. Последний вышедший удаляет семью."""
    family = await load_family(db, member.family_id)
    if member.pending:  # передумал ждать подтверждения
        await _deactivate(db, member)
        await db.commit()
        return
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
