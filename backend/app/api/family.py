from fastapi import APIRouter, Request, Response

from .. import clock
from ..deps import AnyMember, CurrentMember, Db, IdempotencyKey, OwnerMember, mark_silent
from ..ratelimit import InviteLimit, SignupLimit, client_ip
from ..schemas import (
    AccountContributionOut,
    AccountSummaryOut,
    BudgetOut,
    ContributionAmountIn,
    CreateFamilyIn,
    ExpenseOut,
    FamilyOut,
    InviteLinkIn,
    InviteLinkOut,
    InvitePreviewOut,
    JoinFamilyIn,
    PaymentOut,
    SessionOut,
    StateOut,
    SwitchUserIn,
)
from ..services import account, demo, families, finance, idempotency, notifications

router = APIRouter(tags=["family"])


@router.post("/families", response_model=SessionOut, status_code=201, summary="Создать семью")
async def create_family(body: CreateFamilyIn, request: Request, db: Db, _: SignupLimit, idem: IdempotencyKey = None):
    return await families.create_family(db, body, idem, client_ip(request))


@router.get("/invites/{code}", response_model=InvitePreviewOut, summary="Что за семья по приглашению")
async def invite_preview(code: str, db: Db, _: InviteLimit):
    """Публичный: приглашённый видит название семьи до того, как присоединится."""
    return await families.invite_preview(db, code)


@router.post("/invites/{code}/join", response_model=SessionOut, status_code=201, summary="Присоединиться")
async def join_family(
    code: str, body: JoinFamilyIn, request: Request, db: Db, _: InviteLimit, idem: IdempotencyKey = None
):
    session = await families.join_family(db, code, body, idem, client_ip(request))
    # Остальные участники увидят нового сразу (middleware.py)
    request.state.family_id = session.family.id
    request.state.member_id = session.current_user_id
    return session


@router.post("/demo", response_model=SessionOut, status_code=201, summary="Открыть демо-семью")
async def create_demo(db: Db, _: SignupLimit):
    return await demo.create_demo_family(db)


@router.get("/family", response_model=FamilyOut, summary="Моя семья и участники")
async def get_family(member: AnyMember, db: Db):
    """Ожидающему подтверждения — только название семьи и он сам (`pending: true`)."""
    return FamilyOut.of(await families.load_family(db, member.family_id), member)


@router.post("/family/leave", status_code=204, summary="Выйти из семьи")
async def leave_family(member: AnyMember, db: Db):
    await families.leave_family(db, member)
    return Response(status_code=204)


@router.post("/family/invite-code", response_model=FamilyOut, summary="Сменить код приглашения")
async def rotate_invite_code(member: CurrentMember, db: Db):
    """Старый код и ссылки с ним перестают работать. Участники семьи остаются."""
    return await families.rotate_invite_code(db, member)


@router.post("/family/invite-links", response_model=InviteLinkOut, status_code=201,
             summary="Ссылка-приглашение с подтверждением владельцем")
async def create_invite_link(member: CurrentMember, db: Db, request: Request, body: InviteLinkIn | None = None):
    """Ссылка многоразовая, но каждый новый участник ждёт решения владельца."""
    mark_silent(request)
    return await families.create_invite_link(db, member, (body or InviteLinkIn()).role)


@router.get("/family/invite-links", response_model=list[InviteLinkOut], summary="Действующие ссылки")
async def list_invite_links(member: CurrentMember, db: Db):
    return await families.list_invite_links(db, member)


@router.delete("/family/invite-links/{link_id}", status_code=204, summary="Отозвать ссылку")
async def revoke_invite_link(link_id: str, member: CurrentMember, db: Db, request: Request):
    mark_silent(request)
    await families.revoke_invite_link(db, member, link_id)
    return Response(status_code=204)


@router.post("/family/members/{member_id}/approve", response_model=FamilyOut, summary="Подтвердить вход участника")
async def approve_member(member_id: str, member: OwnerMember, db: Db):
    """Только владелец открывает ожидающему данные семьи."""
    return await families.approve_member(db, member, member_id)


@router.post("/family/members/{member_id}/reject", status_code=204, summary="Отклонить заявку")
async def reject_member(member_id: str, member: OwnerMember, db: Db):
    await families.reject_member(db, member, member_id)
    return Response(status_code=204)


@router.delete("/family/members/{member_id}", status_code=204, summary="Исключить участника или отклонить вход")
async def remove_member(member_id: str, member: OwnerMember, db: Db):
    await families.remove_member(db, member, member_id)
    return Response(status_code=204)


@router.post("/family/members/{member_id}/make-owner", response_model=FamilyOut,
             summary="Передать владение семьёй")
async def transfer_ownership(member_id: str, member: OwnerMember, db: Db):
    return await families.transfer_ownership(db, member, member_id)


@router.post("/family/switch-user", response_model=SessionOut, summary="Демо: войти как другой участник")
async def switch_user(body: SwitchUserIn, request: Request, member: CurrentMember, db: Db):
    mark_silent(request)
    return await families.switch_demo_user(db, member, body.user_id)


@router.post("/account/contributions", response_model=AccountContributionOut, status_code=201,
             summary="Записать пополнение демо-счёта")
async def contribute_to_account(body: ContributionAmountIn, member: CurrentMember, db: Db,
                                idem: IdempotencyKey = None):
    async def action():
        contribution = await account.add_contribution(db, member, body.amount)
        current = await account.summary(db, member.family_id, clock.current_month_key())
        own = next((item for item in current.members if item.member_id == member.id), None)
        out = AccountContributionOut.of(contribution)
        out.top_up_suggestion = own.due if own else 0
        return out.model_dump(mode="json", by_alias=True)

    return await idempotency.run(db, member.id, idem, idempotency.fingerprint("account contribution", body.amount), action)


@router.get("/account/summary", response_model=AccountSummaryOut, tags=["account"],
            summary="Остаток общего счёта, взносы и доли")
async def account_summary(month: str, member: CurrentMember, db: Db):
    return await account.summary(db, member.family_id, month)


@router.get("/state", response_model=StateOut, summary="Все данные семьи для старта приложения")
async def get_state(member: AnyMember, db: Db):
    family = await families.load_family(db, member.family_id)
    if not member.active:  # до подтверждения или после отказа — ни одной записи семьи
        return StateOut(family=FamilyOut.of(family, member), current_user_id=member.id, budgets=[], expenses=[],
                        payments=[], unread_notifications=await notifications.unread_count(db, member))
    return StateOut(
        family=FamilyOut.of(family, member),
        current_user_id=member.id,
        budgets=[BudgetOut.of(b) for b in await finance.list_budgets(db, family.id)],
        expenses=[ExpenseOut.of(e) for e in await finance.list_expenses(db, family.id)],
        payments=[PaymentOut.of(p) for p in await finance.list_payments(db, family.id)],
        unread_notifications=await notifications.unread_count(db, member),
        account_contributions=[AccountContributionOut.of(c) for c in await account.list_contributions(db, family.id)],
    )
