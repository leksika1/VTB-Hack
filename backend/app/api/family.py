from fastapi import APIRouter, Request, Response

from ..deps import CurrentMember, Db, IdempotencyKey, mark_silent
from ..ratelimit import InviteLimit, SignupLimit, client_ip
from ..schemas import (
    BudgetOut,
    CreateFamilyIn,
    ExpenseOut,
    FamilyOut,
    InvitePreviewOut,
    JoinFamilyIn,
    PaymentOut,
    SessionOut,
    StateOut,
    SwitchUserIn,
)
from ..services import demo, families, finance

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
    return FamilyOut.of(await families.load_family(db, member.family_id))


@router.post("/family/leave", status_code=204, summary="Выйти из семьи")
async def leave_family(member: CurrentMember, db: Db):
    await families.leave_family(db, member)
    return Response(status_code=204)


@router.post("/family/invite-code", response_model=FamilyOut, summary="Сменить код приглашения")
async def rotate_invite_code(member: CurrentMember, db: Db):
    """Старый код и ссылки с ним перестают работать. Участники семьи остаются."""
    return await families.rotate_invite_code(db, member)


@router.post("/family/switch-user", response_model=SessionOut, summary="Демо: войти как другой участник")
async def switch_user(body: SwitchUserIn, request: Request, member: CurrentMember, db: Db):
    mark_silent(request)
    return await families.switch_demo_user(db, member, body.user_id)


@router.get("/state", response_model=StateOut, summary="Все данные семьи для старта приложения")
async def get_state(member: CurrentMember, db: Db):
    family = await families.load_family(db, member.family_id)
    return StateOut(
        family=FamilyOut.of(family),
        current_user_id=member.id,
        budgets=[BudgetOut.of(b) for b in await finance.list_budgets(db, family.id)],
        expenses=[ExpenseOut.of(e) for e in await finance.list_expenses(db, family.id)],
        payments=[PaymentOut.of(p) for p in await finance.list_payments(db, family.id)],
    )
