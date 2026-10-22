from fastapi import APIRouter, Request, Response

from ..deps import CurrentMember, Db, IdempotencyKey, ParentMember, mark_silent
from ..ratelimit import InviteLimit, SignupLimit, client_ip
from ..schemas import (
    BudgetOut,
    ChildInviteOut,
    CreateFamilyIn,
    ExpenseOut,
    FamilyOut,
    InvitePreviewOut,
    JoinFamilyIn,
    PaymentOut,
    RoleIn,
    SessionOut,
    StateOut,
    SwitchUserIn,
)
from ..services import allowance, demo, families, finance

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
async def get_family(member: CurrentMember, db: Db):
    return FamilyOut.of(await families.load_family(db, member.family_id), member)


@router.post("/family/leave", status_code=204, summary="Выйти из семьи")
async def leave_family(member: CurrentMember, db: Db):
    await families.leave_family(db, member)
    return Response(status_code=204)


@router.post("/family/invite-code", response_model=FamilyOut, summary="Сменить код приглашения")
async def rotate_invite_code(member: ParentMember, db: Db):
    """Старый код и ссылки с ним перестают работать. Участники семьи остаются."""
    return await families.rotate_invite_code(db, member)


@router.post("/family/child-invites", response_model=ChildInviteOut, status_code=201,
             summary="Одноразовое приглашение ребёнка")
async def create_child_invite(member: ParentMember, db: Db):
    """Код на 7 дней для одного входа; вошедший по нему получит роль child (docs/FEATURES.md §1)."""
    return await families.create_child_invite(db, member)


@router.put("/family/members/{member_id}", response_model=FamilyOut, summary="Сменить роль участника")
async def set_member_role(member_id: str, body: RoleIn, member: ParentMember, db: Db):
    return await families.set_role(db, member, member_id, body.role)


@router.delete("/family/members/{member_id}", status_code=204, summary="Исключить участника")
async def remove_member(member_id: str, member: ParentMember, db: Db):
    await families.remove_member(db, member, member_id)
    return Response(status_code=204)


@router.post("/family/switch-user", response_model=SessionOut, summary="Демо: войти как другой участник")
async def switch_user(body: SwitchUserIn, request: Request, member: CurrentMember, db: Db):
    mark_silent(request)
    return await families.switch_demo_user(db, member, body.user_id)


@router.get("/state", response_model=StateOut, summary="Все данные семьи для старта приложения")
async def get_state(member: CurrentMember, db: Db):
    family = await families.load_family(db, member.family_id)
    # Ребёнку — только его расходы; бюджет и платежи семьи — только взрослым (docs/FEATURES.md §1)
    adult = member.is_parent
    return StateOut(
        family=FamilyOut.of(family, member),
        current_user_id=member.id,
        budgets=[BudgetOut.of(b) for b in await finance.list_budgets(db, family.id)] if adult else [],
        expenses=[ExpenseOut.of(e) for e in await finance.list_expenses(db, family.id, author_id=None if adult else member.id)],
        payments=[PaymentOut.of(p) for p in await finance.list_payments(db, family.id)] if adult else [],
        allowances=await allowance.list_allowances(db, member),
    )
