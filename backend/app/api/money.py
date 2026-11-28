"""Разбор QR-кода чека и импорт банковской выписки."""
from fastapi import APIRouter, Request, Response

from ..clock import current_month_key
from ..deps import CurrentMember, Db, IdempotencyKey, mark_silent
from ..receipts import parse_receipt
from ..schemas import (
    CardImportIn,
    ImportConfirmIn,
    ImportIn,
    ImportOut,
    ReceiptIn,
    ReceiptOut,
)
from ..services import finance, idempotency, imports
from ..validation import check_month_key, kop_to_amount

router = APIRouter()


# ── Чек ──


@router.post("/receipts/parse", response_model=ReceiptOut, tags=["expenses"],
             summary="Разобрать QR-код чека: сумма, дата, не добавлен ли уже")
async def parse_receipt_qr(body: ReceiptIn, request: Request, member: CurrentMember, db: Db):
    mark_silent(request)
    receipt = parse_receipt(body.qr)
    duplicate = await finance.find_by_receipt(db, member.family_id, receipt.key)
    duplicate_of = duplicate.id if duplicate else None
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
async def create_import(body: ImportIn, member: CurrentMember, db: Db):
    batch = await imports.create(db, member, body)
    out = ImportOut.of(batch, with_rows=True)
    await db.commit()
    return out


@router.post("/imports/card", response_model=ImportOut, status_code=201, tags=["imports"],
             summary="Получить покупки с личной карты ВТБ за месяц")
async def create_card_import(member: CurrentMember, db: Db, body: CardImportIn | None = None,
                             idem: IdempotencyKey = None):
    month = check_month_key((body.month if body else None) or current_month_key(), "month")

    async def action():
        batch = await imports.create_card(db, member, month)
        return ImportOut.of(batch, with_rows=True).model_dump(mode="json", by_alias=True)

    return await idempotency.run(
        db, member.id, idem, idempotency.fingerprint("POST card import", month), action,
    )


@router.get("/imports", response_model=list[ImportOut], tags=["imports"])
async def list_imports(member: CurrentMember, db: Db):
    return [ImportOut.of(i) for i in await imports.list_imports(db, member)]


@router.get("/imports/{import_id}", response_model=ImportOut, tags=["imports"])
async def get_import(import_id: str, member: CurrentMember, db: Db):
    return ImportOut.of(await imports.get(db, member, import_id), with_rows=True)


@router.post("/imports/{import_id}/confirm", response_model=ImportOut, tags=["imports"],
             summary="Подтвердить импорт: выбранные строки становятся расходами")
async def confirm_import(import_id: str, body: ImportConfirmIn, member: CurrentMember, db: Db):
    batch = await imports.confirm(db, member, import_id, body)
    out = ImportOut.of(batch, with_rows=True)
    await db.commit()
    return out


@router.delete("/imports/{import_id}", status_code=204, tags=["imports"])
async def discard_import(import_id: str, member: CurrentMember, db: Db):
    await imports.discard(db, member, import_id)
    await db.commit()
    return Response(status_code=204)
