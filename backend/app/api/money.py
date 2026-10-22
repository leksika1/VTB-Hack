"""Карманные деньги, запросы на покупку, разбор QR-кода чека (docs/FEATURES.md §2, §3, §8)."""
from fastapi import APIRouter, Query, Request, Response

from ..deps import CurrentMember, Db, IdempotencyKey, ParentMember, mark_silent
from ..receipts import parse_receipt
from ..schemas import (
    AllowanceIn,
    AllowanceOut,
    DecisionIn,
    ImportConfirmIn,
    ImportIn,
    ImportOut,
    PurchaseRequestIn,
    PurchaseRequestOut,
    ReceiptIn,
    ReceiptOut,
)
from ..services import allowance, finance, idempotency, imports, requests
from ..validation import kop_to_amount

router = APIRouter()


def _dump(model) -> dict:
    return model.model_dump(mode="json", by_alias=True)


# ── Карманные деньги ──


@router.get("/allowances", response_model=list[AllowanceOut], tags=["allowance"],
            summary="Карманные деньги: взрослому — всех детей, ребёнку — свои")
async def list_allowances(member: CurrentMember, db: Db):
    return await allowance.list_allowances(db, member)


@router.put("/family/members/{member_id}/allowance", response_model=AllowanceOut, tags=["allowance"],
            summary="Назначить или изменить карманные деньги ребёнку")
async def set_allowance(member_id: str, body: AllowanceIn, member: ParentMember, db: Db):
    out = await allowance.set_allowance(db, member, member_id, body)
    await db.commit()
    return out


@router.delete("/family/members/{member_id}/allowance", status_code=204, tags=["allowance"])
async def delete_allowance(member_id: str, member: ParentMember, db: Db):
    await allowance.delete_allowance(db, member, member_id)
    return Response(status_code=204)


# ── Запросы на покупку ──


@router.post("/purchase-requests", response_model=PurchaseRequestOut, status_code=201, tags=["requests"])
async def create_request(body: PurchaseRequestIn, member: CurrentMember, db: Db, idem: IdempotencyKey = None):
    async def action():
        return _dump(PurchaseRequestOut.of(await requests.create(db, member, body)))

    fp = idempotency.fingerprint("POST purchase-request", _dump(body))
    return await idempotency.run(db, member.id, idem, fp, action)


@router.get("/purchase-requests", response_model=list[PurchaseRequestOut], tags=["requests"],
            summary="Запросы: взрослому — все в семье (с проверкой покупки), ребёнку — свои")
async def list_requests(member: CurrentMember, db: Db, status: str | None = Query(None)):
    return await requests.to_out_list(db, member, await requests.list_requests(db, member, status))


async def _single(db, member, request) -> PurchaseRequestOut:
    out = PurchaseRequestOut.of(request)
    await db.commit()
    return out


@router.post("/purchase-requests/{request_id}/approve", response_model=PurchaseRequestOut, tags=["requests"],
             summary="Одобрить: создаётся расход на просившего, платил одобривший")
async def approve_request(request_id: str, body: DecisionIn, member: ParentMember, db: Db):
    return await _single(db, member, await requests.approve(db, member, request_id, body))


@router.post("/purchase-requests/{request_id}/reject", response_model=PurchaseRequestOut, tags=["requests"])
async def reject_request(request_id: str, body: DecisionIn, member: ParentMember, db: Db):
    return await _single(db, member, await requests.reject(db, member, request_id, body))


@router.post("/purchase-requests/{request_id}/cancel", response_model=PurchaseRequestOut, tags=["requests"])
async def cancel_request(request_id: str, member: CurrentMember, db: Db):
    return await _single(db, member, await requests.cancel(db, member, request_id))


# ── Чек ──


@router.post("/receipts/parse", response_model=ReceiptOut, tags=["expenses"],
             summary="Разобрать QR-код чека: сумма, дата, не добавлен ли уже")
async def parse_receipt_qr(body: ReceiptIn, request: Request, member: CurrentMember, db: Db):
    mark_silent(request)
    receipt = parse_receipt(body.qr)
    duplicate = await finance.find_by_receipt(db, member.family_id, receipt.key)
    # Ребёнку не раскрываем чужие расходы — только сам факт, что чек уже есть
    duplicate_of = duplicate.id if duplicate and (member.is_parent or duplicate.author_id == member.id) else None
    return ReceiptOut(
        amount=kop_to_amount(receipt.amount_kop),
        date=receipt.date.isoformat(),
        time=receipt.time,
        duplicate=duplicate is not None,
        duplicate_of=duplicate_of,
    )


# ── Импорт выписки ──


@router.post("/imports", response_model=ImportOut, status_code=201, tags=["imports"],
             summary="Загрузить CSV-выписку: строки ждут подтверждения")
async def create_import(body: ImportIn, member: ParentMember, db: Db):
    batch = await imports.create(db, member, body)
    out = ImportOut.of(batch, with_rows=True)
    await db.commit()
    return out


@router.get("/imports", response_model=list[ImportOut], tags=["imports"])
async def list_imports(member: ParentMember, db: Db):
    return [ImportOut.of(i) for i in await imports.list_imports(db, member)]


@router.get("/imports/{import_id}", response_model=ImportOut, tags=["imports"])
async def get_import(import_id: str, member: ParentMember, db: Db):
    return ImportOut.of(await imports.get(db, member, import_id), with_rows=True)


@router.post("/imports/{import_id}/confirm", response_model=ImportOut, tags=["imports"],
             summary="Подтвердить импорт: выбранные строки становятся расходами")
async def confirm_import(import_id: str, body: ImportConfirmIn, member: ParentMember, db: Db):
    batch = await imports.confirm(db, member, import_id, body)
    out = ImportOut.of(batch, with_rows=True)
    await db.commit()
    return out


@router.delete("/imports/{import_id}", status_code=204, tags=["imports"])
async def discard_import(import_id: str, member: ParentMember, db: Db):
    await imports.discard(db, member, import_id)
    await db.commit()
    return Response(status_code=204)
