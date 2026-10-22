import hashlib

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..errors import Conflict, Forbidden, NotFound
from ..models import Family, Member, MemberSession, now_ms
from ..schemas import CreateFamilyIn, FamilyOut, InvitePreviewOut, JoinFamilyIn, SessionOut
from ..security import MEMBER_COLORS, hash_token, new_invite_code, new_token
from ..validation import clean_name, normalize_invite_code
from . import idempotency

MAX_MEMBERS = 10


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
    return SessionOut(token=token, current_user_id=member_id, family=FamilyOut.of(family))


async def unique_invite_code(db: AsyncSession) -> str:
    while True:
        code = new_invite_code()
        if not await db.scalar(select(Family.id).where(Family.invite_code == code)):
            return code


def anon_scope(client_ip: str) -> str:
    """Ключи идемпотентности анонимных запросов привязаны к IP: чужой ключ с другого адреса не сработает."""
    return "anon:" + hashlib.sha256(client_ip.encode()).hexdigest()[:32]


async def create_family(db: AsyncSession, body: CreateFamilyIn, idem_key: str | None, client_ip: str) -> SessionOut:
    family_name = clean_name(body.family_name, "familyName", "Укажите название семьи", max_len=80)
    user_name = clean_name(body.user_name, "userName", "Укажите ваше имя")

    async def action() -> dict:
        family = Family(name=family_name, invite_code=await unique_invite_code(db))
        member = Member(family=family, name=user_name, color=MEMBER_COLORS[0])
        db.add_all([family, member])
        await db.flush()
        return {"memberId": member.id}

    # В записи идемпотентности только id участника: повтор получит новый токен, а не сохранённый
    fp = idempotency.fingerprint("create_family", family_name, user_name)
    result = await idempotency.run(db, anon_scope(client_ip), idem_key, fp, action)
    return await issue_session(db, result["memberId"])


async def find_by_invite(db: AsyncSession, code: str) -> Family:
    family = await db.scalar(select(Family).where(Family.invite_code == normalize_invite_code(code)))
    if family is None:
        raise NotFound("Приглашение не найдено. Попросите прислать ссылку ещё раз.", "code")
    return family


async def invite_preview(db: AsyncSession, code: str) -> InvitePreviewOut:
    family = await find_by_invite(db, code)
    return InvitePreviewOut(
        code=family.invite_code,
        family_name=family.name,
        members_count=sum(1 for m in family.members if m.active),
    )


async def join_family(
    db: AsyncSession, code: str, body: JoinFamilyIn, idem_key: str | None, client_ip: str
) -> SessionOut:
    user_name = clean_name(body.user_name, "userName", "Укажите ваше имя")
    family = await find_by_invite(db, code)

    async def action() -> dict:
        if sum(1 for m in family.members if m.active) >= MAX_MEMBERS:
            raise Conflict(f"В семье уже {MAX_MEMBERS} участников")
        total_ever = await db.scalar(select(func.count()).where(Member.family_id == family.id))
        member = Member(family_id=family.id, name=user_name, color=MEMBER_COLORS[total_ever % len(MEMBER_COLORS)])
        db.add(member)
        await db.flush()
        return {"memberId": member.id}

    fp = idempotency.fingerprint("join_family", family.id, user_name)
    result = await idempotency.run(db, anon_scope(client_ip), idem_key, fp, action)
    return await issue_session(db, result["memberId"])


async def rotate_invite_code(db: AsyncSession, member: Member) -> FamilyOut:
    """Новый код приглашения: старые ссылки перестают работать (если ссылка попала не тому человеку)."""
    family = await load_family(db, member.family_id)
    family.invite_code = await unique_invite_code(db)
    await db.commit()
    return FamilyOut.of(family)


async def leave_family(db: AsyncSession, member: Member) -> None:
    """Участник выходит: его записи остаются семье, сессии закрываются. Последний вышедший удаляет семью."""
    member.left_at = now_ms()
    await db.execute(delete(MemberSession).where(MemberSession.member_id == member.id))
    family = await load_family(db, member.family_id)
    if not any(m.active for m in family.members):
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
