"""Запросы на покупку: участник просит, взрослый (не автор) одобряет или отклоняет (docs/FEATURES.md §3)."""
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import clock, presenters
from ..domain.budget import check_purchase
from ..errors import Conflict, Forbidden, NotFound, ValidationFailed
from ..models import Expense, Member, PurchaseRequest, now_ms
from ..schemas import DecisionIn, PurchaseRequestIn, PurchaseRequestOut
from ..validation import amount_to_kop, check_category, clean_title
from . import finance

MAX_PENDING_PER_AUTHOR = 20
STATUSES = ("pending", "approved", "rejected", "cancelled")


def _comment(value: str | None, field: str) -> str | None:
    value = (value or "").strip()
    if len(value) > 300:
        raise ValidationFailed("Комментарий длиннее 300 символов", field)
    return value or None


async def create(db: AsyncSession, member: Member, body: PurchaseRequestIn) -> PurchaseRequest:
    pending = await db.scalar(
        select(func.count()).select_from(PurchaseRequest).where(
            PurchaseRequest.author_id == member.id, PurchaseRequest.status == "pending"
        )
    )
    if pending >= MAX_PENDING_PER_AUTHOR:
        raise Conflict(f"Уже {MAX_PENDING_PER_AUTHOR} запросов ждут решения")
    request = PurchaseRequest(
        family_id=member.family_id,
        author_id=member.id,
        title=clean_title(body.title),
        amount_kop=amount_to_kop(body.amount),
        category=check_category(body.category),
        comment=_comment(body.comment, "comment"),
    )
    db.add(request)
    await db.flush()
    await db.refresh(request, ["expense"])
    return request


async def to_out_list(db: AsyncSession, member: Member, items: list[PurchaseRequest]) -> list[PurchaseRequestOut]:
    """Взрослым к ожидающим запросам добавляется проверка покупки на текущий месяц."""
    summary = None
    if member.is_parent and any(r.status == "pending" for r in items):
        summary = await finance.month_summary(db, member.family_id, clock.current_month_key())
    out = []
    for r in items:
        check = None
        if summary is not None and r.status == "pending":
            check = presenters.purchase_check_out(check_purchase(summary, r.amount_kop, r.category))
        out.append(PurchaseRequestOut.of(r, check))
    return out


async def list_requests(db: AsyncSession, member: Member, status: str | None) -> list[PurchaseRequest]:
    q = select(PurchaseRequest).where(PurchaseRequest.family_id == member.family_id)
    if status:
        if status not in STATUSES:
            raise ValidationFailed("Статус: pending, approved, rejected или cancelled", "status")
        q = q.where(PurchaseRequest.status == status)
    if not member.is_parent:
        q = q.where(PurchaseRequest.author_id == member.id)
    return list(await db.scalars(q.order_by(PurchaseRequest.created_at.desc()).limit(200)))


async def _locked(db: AsyncSession, member: Member, request_id: str) -> PurchaseRequest:
    request = await db.get(PurchaseRequest, request_id, with_for_update=True, populate_existing=True)
    if request is None or request.family_id != member.family_id:
        raise NotFound("Запрос не найден")
    if not member.is_parent and request.author_id != member.id:
        raise NotFound("Запрос не найден")
    return request


def _require_pending(request: PurchaseRequest) -> None:
    if request.status != "pending":
        raise Conflict("Запрос уже рассмотрен")


async def _decide(db: AsyncSession, actor: Member, request_id: str, body: DecisionIn, status: str) -> PurchaseRequest:
    # Блокировка строки: два взрослых одновременно — второй увидит, что запрос уже рассмотрен
    request = await _locked(db, actor, request_id)
    _require_pending(request)
    if request.author_id == actor.id:
        raise Forbidden("Свой запрос должен рассмотреть другой взрослый")
    request.status = status
    request.decided_by = actor.id
    request.decided_at = now_ms()
    request.decision_comment = _comment(body.comment, "comment")
    if status == "approved":
        await finance.check_capacity(db, Expense, request.family_id)
        db.add(Expense(
            family_id=request.family_id,
            title=request.title,
            amount_kop=request.amount_kop,
            category=request.category,
            date=clock.today(),
            author_id=request.author_id,
            paid_by=actor.id,
            request_id=request.id,
        ))
    await db.flush()
    await db.refresh(request, ["expense"])
    return request


async def approve(db: AsyncSession, actor: Member, request_id: str, body: DecisionIn) -> PurchaseRequest:
    return await _decide(db, actor, request_id, body, "approved")


async def reject(db: AsyncSession, actor: Member, request_id: str, body: DecisionIn) -> PurchaseRequest:
    return await _decide(db, actor, request_id, body, "rejected")


async def cancel(db: AsyncSession, member: Member, request_id: str) -> PurchaseRequest:
    request = await _locked(db, member, request_id)
    if request.author_id != member.id:
        raise Forbidden("Отменить запрос может только его автор")
    _require_pending(request)
    request.status = "cancelled"
    await db.flush()
    await db.refresh(request, ["expense"])
    return request
