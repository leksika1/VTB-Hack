"""Уведомления и e-mail с подтверждением (docs/FEATURES.md §9)."""
import asyncio
import re

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.clock import today
from app.db import make_engine
from app.maintenance import payment_reminders_once
from tests.conftest import run_sql

from .helpers import (
    TODAY,
    add_expense,
    add_payment,
    assert_error,
    create_family,
    join,
    set_budget,
)


def kinds(m, **params):
    return [n["kind"] for n in m.get("/api/notifications", params=params).json()]


def test_join_notifications_and_read_state(api, new_client):
    owner = create_family(api)
    boris = join(new_client(), owner, "Борис")
    pending = join(new_client(), owner.invite_code, "Вера")
    request_note = owner.get("/api/notifications").json()[0]
    assert (request_note["kind"], request_note["data"]["memberId"], request_note["readAt"]) == (
        "member_join_request", pending.id, None)
    assert_error(boris.post(f"/api/family/members/{pending.id}/approve"), 403, "forbidden")
    owner.post(f"/api/family/members/{pending.id}/approve")
    assert "member_approved" in kinds(pending)
    assert "member_joined" in kinds(boris)

    unread = owner.get("/api/state").json()["unreadNotifications"]
    assert unread >= 1
    first = owner.get("/api/notifications").json()[0]["id"]
    assert owner.post(f"/api/notifications/{first}/read").status_code == 204
    assert owner.get("/api/state").json()["unreadNotifications"] == unread - 1
    assert owner.post("/api/notifications/read-all").status_code == 204
    assert owner.get("/api/notifications", params={"unreadOnly": "true"}).json() == []


def test_notifications_are_private_and_paginated(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna)
    own = boris.get("/api/notifications").json()
    anna_note = anna.get("/api/notifications").json()[0]
    # Чужое уведомление не помечается прочитанным
    boris.post(f"/api/notifications/{anna_note['id']}/read")
    assert anna.get("/api/notifications").json()[0]["readAt"] is None
    assert anna_note["id"] not in {n["id"] for n in own}
    page = anna.get("/api/notifications", params={"before": anna_note["createdAt"]}).json()
    assert all(n["createdAt"] < anna_note["createdAt"] for n in page)


def test_category_limit_notified_once_per_status(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna)
    set_budget(anna, 10000, {"food": 1000})
    add_expense(anna, 900, "food")        # 90% → почти исчерпан
    add_expense(anna, 10, "food")         # всё ещё «почти» — без повтора
    add_expense(anna, 200, "food")        # превышен
    limit = [n for n in boris.get("/api/notifications").json() if n["kind"] == "category_limit"]
    assert [n["data"]["status"] for n in limit] == ["over", "near"]
    assert "category_limit" not in kinds(anna)  # автору траты — не нужно


def test_goal_notification_reaches_all_members(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna)
    goal = anna.post("/api/goals", {"title": "Отпуск", "target": 100}).json()
    anna.post(f"/api/goals/{goal['id']}/contributions", {"amount": 100})
    assert "goal_achieved" in kinds(boris) and "goal_achieved" in kinds(anna)


def test_payment_reminders(api, needs_db):
    anna = create_family(api)
    add_payment(anna, 1000, title="Садик", due=TODAY)
    far = today().replace(day=1).fromordinal(today().toordinal() + 10).isoformat()
    add_payment(anna, 1000, title="Далёкий", due=far)

    async def go():
        engine = make_engine(needs_db)
        try:
            factory = async_sessionmaker(engine, expire_on_commit=False)
            return await payment_reminders_once(factory), await payment_reminders_once(factory)
        finally:
            await engine.dispose()

    first, second = asyncio.run(go())
    assert first >= 1 and second == 0
    titles = [n["title"] for n in anna.get("/api/notifications").json() if n["kind"] == "payment_due"]
    assert titles == ["Платёж «Садик» — сегодня"]


# ── E-mail ──


def last_code(db_url, member_id):
    body = run_sql(db_url, "SELECT body FROM email_outbox WHERE member_id = $1 ORDER BY created_at DESC LIMIT 1",
                   member_id)
    return re.search(r"\b(\d{6})\b", body).group(1)


def test_email_verification_flow(api, new_client, needs_db):
    anna = create_family(api)
    boris = join(new_client(), anna)
    me = anna.get("/api/me").json()
    assert (me["email"], me["emailVerified"], me["notifyByEmail"], me["role"]) == (None, False, False, "member")
    assert_error(anna.put("/api/me/notifications", {"email": True}), 422, field="email")
    assert_error(anna.put("/api/me/email", {"email": "not-an-email"}), 422, field="email")
    assert_error(anna.put("/api/me/email", {"email": "a@b.ru\r\nBcc: x@y.ru"}), 422, field="email")

    assert anna.put("/api/me/email", {"email": "Anna@Example.RU"}).status_code == 202
    assert anna.get("/api/me").json()["pendingEmail"] == "Anna@example.ru"
    code = last_code(needs_db, anna.id)
    # Код хранится только хешем
    assert run_sql(needs_db, "SELECT count(*) FROM members WHERE email_code_hash = $1", code) == 0
    wrong = "000000" if code != "000000" else "111111"
    assert_error(anna.post("/api/me/email/verify", {"code": wrong}), 422, field="code", message="Неверный код")
    verified = anna.post("/api/me/email/verify", {"code": code}).json()
    assert (verified["email"], verified["emailVerified"], verified["pendingEmail"]) == ("Anna@example.ru", True, None)

    assert anna.put("/api/me/notifications", {"email": True}).json()["notifyByEmail"] is True
    before = run_sql(needs_db, "SELECT count(*) FROM email_outbox WHERE member_id = $1", anna.id)
    join(new_client(), anna.invite_code, "Вера")
    assert run_sql(needs_db, "SELECT count(*) FROM email_outbox WHERE member_id = $1", anna.id) == before + 1

    assert anna.delete("/api/me/email").status_code == 204
    assert anna.get("/api/me").json()["email"] is None


def test_email_code_attempts_and_rate_limit(api, needs_db):
    anna = create_family(api)
    anna.put("/api/me/email", {"email": "anna@example.ru"})
    code = last_code(needs_db, anna.id)
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        anna.post("/api/me/email/verify", {"code": wrong})
    # После 5 неверных попыток и правильный код уже не принимается
    assert_error(anna.post("/api/me/email/verify", {"code": code}), 422, message="Код устарел. Запросите новый")
    for _ in range(4):
        assert anna.put("/api/me/email", {"email": "anna@example.ru"}).status_code == 202
    assert_error(anna.put("/api/me/email", {"email": "anna@example.ru"}), 429)


def test_leaving_family_erases_email(api, new_client, needs_db):
    anna = create_family(api)
    boris = join(new_client(), anna)
    boris.put("/api/me/email", {"email": "boris@example.ru"})
    boris.post("/api/me/email/verify", {"code": last_code(needs_db, boris.id)})
    assert anna.delete(f"/api/family/members/{boris.id}").status_code == 204
    assert run_sql(needs_db, "SELECT count(*) FROM members WHERE id = $1 AND email IS NOT NULL", boris.id) == 0
