"""Семьи, приглашения, владелец и сессии участников."""
import hashlib

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..errors import Conflict, NotFound, ValidationFailed
from ..models import Family, InviteLink, Member, MemberSession, now_ms
from ..schemas import CreateFamilyIn, FamilyOut, InviteLinkOut, InvitePreviewOut, JoinFamilyIn, SessionOut
from ..security import MEMBER_COLORS, hash_token, new_invite_code, new_invite_link_code, new_login_id, new_token
from ..validation import clean_name, normalize_invite_code
from . import idempotency, notifications
from .me import clear_email

MAX_MEMBERS = 10
INVITE_LINK_CODE_LENGTH = 16
INVITE_LINK_TTL_MS = 7 * 86_400_000
MAX_ACTIVE_INVITE_LINKS = 10


async def load_family(db: AsyncSession, family_id: str) -> Family:
    family = await db.scalar(select(Family).where(Family.id == family_id).execution_options(populate_existing=True))
    if family is None:
        raise NotFound("Семья не найдена")
    return family


async def issue_session(db: AsyncSession, member_id: str, *, reveal_login_id: bool = False) -> SessionOut:
    token = new_token()
    db.add(MemberSession(token_hash=hash_token(token), member_id=member_id))
    await db.commit()
    member = await db.get(Member, member_id)
    family = await load_family(db, member.family_id)
    return SessionOut(token=token, current_user_id=member_id, family=FamilyOut.of(family, member),
                      login_id=member.login_id if reveal_login_id else None)


async def unique_invite_code(db: AsyncSession) -> str:
    while True:
        code = new_invite_code()
        if not await db.scalar(select(Family.id).where(Family.invite_code == code)):
            return code


async def _assign_login_id(db: AsyncSession, member: Member) -> str:
    while True:
        value = new_login_id()
        digest = hash_token(value)
        if not await db.scalar(select(Member.id).where(Member.login_id_hash == digest)):
            member.login_id, member.login_id_hash = value, digest
            return value


def anon_scope(client_ip: str) -> str:
    return "anon:" + hashlib.sha256(client_ip.encode()).hexdigest()[:32]


async def _link_sub(db: AsyncSession, token: str | None) -> str | None:
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
        member = Member(family=family, name=user_name, color=MEMBER_COLORS[0], role="member",
                        oidc_sub=await _link_sub(db, body.oidc_link_token))
        db.add_all([family, member])
        await db.flush()
        family.owner_id = member.id
        await _assign_login_id(db, member)
        await db.flush()
        return {"memberId": member.id}

    fp = idempotency.fingerprint("create_family", family_name, user_name)
    result = await idempotency.run(db, anon_scope(client_ip), idem_key, fp, action)
    return await issue_session(db, result["memberId"], reveal_login_id=True)


async def resolve_invite(db: AsyncSession, code: str, lock: bool = False) -> tuple[Family, InviteLink | None]:
    normalized = normalize_invite_code(code)
    link = None
    if len(normalized) == INVITE_LINK_CODE_LENGTH:
        q = select(InviteLink).where(InviteLink.code_hash == hash_token(normalized))
        link = await db.scalar(q.with_for_update().execution_options(populate_existing=True) if lock else q)
        if link is None or link.expires_at < now_ms():
            raise NotFound("Ссылка недействительна: её отозвали или срок истёк. Попросите новую.", "code")
        family = await load_family(db, link.family_id)
    else:
        family = await db.scalar(select(Family).where(Family.invite_code == normalized))
        if family is None:
            raise NotFound("Приглашение не найдено. Попросите прислать ссылку ещё раз.", "code")
    return family, link


async def invite_preview(db: AsyncSession, code: str) -> InvitePreviewOut:
    family, _ = await resolve_invite(db, code)
    return InvitePreviewOut(code=normalize_invite_code(code), family_name=family.name,
                            members_count=len(_active(family)), role="member", needs_approval=True)


async def join_family(db: AsyncSession, code: str, body: JoinFamilyIn, idem_key: str | None,
                      client_ip: str) -> SessionOut:
    user_name = clean_name(body.user_name, "userName", "Укажите ваше имя")
    normalized = normalize_invite_code(code)

    async def action() -> dict:
        family, link = await resolve_invite(db, normalized, lock=True)
        if sum(1 for m in family.members if m.active or m.pending) >= MAX_MEMBERS:
            raise Conflict(f"В семье уже {MAX_MEMBERS} участников")
        total_ever = await db.scalar(select(func.count()).where(Member.family_id == family.id))
        member = Member(family_id=family.id, name=user_name, color=_next_color(total_ever), role="member",
                        status="pending", oidc_sub=await _link_sub(db, body.oidc_link_token))
        await _assign_login_id(db, member)
        db.add(member)
        await db.flush()
        if link:
            link.uses += 1
            link.last_used_at = now_ms()
        owner = next((m for m in family.members if m.id == family.owner_id and m.active), None)
        if owner:
            await notifications.notify(
                db, family.id, [owner], "member_join_request", f"{member.name} просит доступ к семье",
                "Подтвердите или отклоните заявку на вкладке «Семья»", {"memberId": member.id, "role": "member"},
                dedupe_key=f"member_join_request:{member.id}")
        return {"memberId": member.id}

    fp = idempotency.fingerprint("join_family", normalized, user_name)
    result = await idempotency.run(db, anon_scope(client_ip), idem_key, fp, action)
    return await issue_session(db, result["memberId"], reveal_login_id=True)


async def rotate_invite_code(db: AsyncSession, member: Member) -> FamilyOut:
    family = await load_family(db, member.family_id)
    family.invite_code = await unique_invite_code(db)
    await db.commit()
    return FamilyOut.of(family, member)


def _live_links(family_id: str):
    return select(InviteLink).where(InviteLink.family_id == family_id, InviteLink.expires_at >= now_ms())


async def create_invite_link(db: AsyncSession, member: Member, role: str = "member") -> InviteLinkOut:
    if role not in {"member", "parent"}:  # parent принимается от старого фронта
        raise ValidationFailed("Роль приглашённого: member", "role")
    await db.execute(select(Family.id).where(Family.id == member.family_id).with_for_update())
    live = await db.scalar(select(func.count()).select_from(_live_links(member.family_id).subquery()))
    if live >= MAX_ACTIVE_INVITE_LINKS:
        raise Conflict(f"Действующих ссылок уже {MAX_ACTIVE_INVITE_LINKS}. Отзовите ненужные.")
    code = new_invite_link_code()
    link = InviteLink(family_id=member.family_id, code_hash=hash_token(code), role="member",
                      created_by=member.id, expires_at=now_ms() + INVITE_LINK_TTL_MS)
    db.add(link)
    await db.commit()
    return InviteLinkOut.of(link, code)


async def list_invite_links(db: AsyncSession, member: Member) -> list[InviteLinkOut]:
    links = await db.scalars(_live_links(member.family_id).order_by(InviteLink.created_at.desc()))
    return [InviteLinkOut.of(link) for link in links]


async def revoke_invite_link(db: AsyncSession, member: Member, link_id: str) -> None:
    result = await db.execute(delete(InviteLink).where(InviteLink.id == link_id,
                                                       InviteLink.family_id == member.family_id))
    if not result.rowcount:
        raise NotFound("Ссылка не найдена — возможно, её уже отозвали")
    await db.commit()


async def _target(db: AsyncSession, actor: Member, member_id: str,
                  pending: bool | None = None) -> tuple[Family, Member]:
    family = await load_family(db, actor.family_id)
    target = next((m for m in family.members if m.id == member_id and m.present), None)
    if target is None or (pending is True and not target.pending) or (pending is False and not target.active):
        raise NotFound("Участник или заявка не найдены")
    return family, target


async def approve_member(db: AsyncSession, actor: Member, member_id: str) -> FamilyOut:
    family, target = await _target(db, actor, member_id, pending=True)
    target.status = "active"
    await db.flush()
    await notifications.notify(db, family.id, [target], "member_approved", "Вход в семью подтверждён",
                               f"{actor.name} открыл(а) вам доступ к семье «{family.name}»",
                               {"memberId": target.id}, dedupe_key=f"member_approved:{target.id}")
    await notifications.notify(db, family.id, [m for m in _active(family) if m.id not in (target.id, actor.id)],
                               "member_joined", f"{target.name} теперь в семье",
                               "Новый участник подтверждён владельцем", {"memberId": target.id},
                               dedupe_key=f"member_joined:{target.id}")
    await db.commit()
    return FamilyOut.of(await load_family(db, actor.family_id), actor)


async def _revoke_links_of(db: AsyncSession, member: Member) -> None:
    await db.execute(delete(InviteLink).where(InviteLink.created_by == member.id))


async def _deactivate(db: AsyncSession, member: Member) -> None:
    member.left_at = now_ms()
    clear_email(member)
    await _revoke_links_of(db, member)
    await db.execute(delete(MemberSession).where(MemberSession.member_id == member.id))


async def reject_member(db: AsyncSession, actor: Member, member_id: str) -> None:
    family, target = await _target(db, actor, member_id, pending=True)
    await notifications.notify(db, family.id, [target], "member_rejected", "Заявка отклонена",
                               f"Владелец семьи «{family.name}» отклонил заявку", {"memberId": target.id},
                               dedupe_key=f"member_rejected:{target.id}")
    # Сессию сохраняем в изолированном состоянии: заявитель должен увидеть решение, но семейные данные закрыты.
    target.status = "rejected"
    await _revoke_links_of(db, target)
    await db.commit()


async def remove_member(db: AsyncSession, actor: Member, member_id: str) -> None:
    if member_id == actor.id:
        raise ValidationFailed("Чтобы выйти самому, используйте «Выйти из семьи»")
    family, target = await _target(db, actor, member_id)
    if target.id == family.owner_id:
        raise Conflict("Владельца семьи нельзя исключить")
    await _deactivate(db, target)
    await db.commit()


async def transfer_ownership(db: AsyncSession, actor: Member, member_id: str) -> FamilyOut:
    family, target = await _target(db, actor, member_id, pending=False)
    if target.id == actor.id:
        return FamilyOut.of(family, actor)
    family.owner_id = target.id
    await notifications.notify(
        db, family.id, [target], "ownership_transferred", "Теперь вы владелец семьи",
        f"{actor.name} передал(а) вам управление семьёй «{family.name}»", {"memberId": target.id},
        dedupe_key=f"ownership_transferred:{family.id}:{target.id}:{now_ms()}",
    )
    await db.commit()
    return FamilyOut.of(await load_family(db, family.id), actor)


async def leave_family(db: AsyncSession, member: Member) -> None:
    family = await load_family(db, member.family_id)
    if not member.active:
        await _deactivate(db, member)
        await db.commit()
        return
    if family.owner_id == member.id:
        raise Conflict("Владелец не может выйти, пока не передаст владение семьёй")
    await _deactivate(db, member)
    await db.commit()
