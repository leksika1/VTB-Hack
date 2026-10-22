"""Профиль участника и уведомления (docs/FEATURES.md §9)."""
from fastapi import APIRouter, Query, Response

from ..deps import AnyMember, CurrentMember, Db
from ..schemas import CodeIn, EmailIn, MeOut, NotificationOut, NotificationSettingsIn
from ..services import me, notifications

router = APIRouter(tags=["me"])


@router.get("/me", response_model=MeOut, summary="Мой профиль")
async def get_me(member: AnyMember):
    return me.to_out(member)


@router.put("/me/email", status_code=202, summary="Указать e-mail — придёт письмо с кодом")
async def set_email(body: EmailIn, member: CurrentMember, db: Db):
    await me.request_email(db, member, body.email)
    return Response(status_code=202)


@router.post("/me/email/verify", response_model=MeOut, summary="Подтвердить e-mail кодом из письма")
async def verify_email(body: CodeIn, member: CurrentMember, db: Db):
    return await me.verify_email(db, member, body.code)


@router.delete("/me/email", status_code=204, summary="Удалить e-mail")
async def delete_email(member: CurrentMember, db: Db):
    me.clear_email(member)
    await db.commit()
    return Response(status_code=204)


@router.put("/me/notifications", response_model=MeOut, summary="Включить или выключить письма")
async def notification_settings(body: NotificationSettingsIn, member: CurrentMember, db: Db):
    return await me.set_email_notifications(db, member, body.email)


@router.get("/notifications", response_model=list[NotificationOut], tags=["notifications"],
            summary="Мои уведомления, до 50, новые сверху")
async def list_notifications(member: CurrentMember, db: Db, unread_only: bool = Query(False, alias="unreadOnly"),
                             before: int | None = Query(None, description="createdAt для следующей страницы")):
    return [NotificationOut.of(n) for n in await notifications.list_for(db, member, unread_only, before)]


@router.post("/notifications/read-all", status_code=204, tags=["notifications"])
async def read_all(member: CurrentMember, db: Db):
    await notifications.mark_read(db, member)
    return Response(status_code=204)


@router.post("/notifications/{notification_id}/read", status_code=204, tags=["notifications"])
async def read_one(notification_id: str, member: CurrentMember, db: Db):
    await notifications.mark_read(db, member, notification_id)
    return Response(status_code=204)
