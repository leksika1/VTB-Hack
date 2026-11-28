"""Сквозные сценарии контракта общего плана v2."""
import asyncio

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.db import make_engine
from app.config import get_settings
from app.maintenance import autopay_once
from tests.conftest import run_sql

from .helpers import TODAY, assert_error, create_family, join, key


def test_login_id_duplicate_names_and_owner_approval(api, new_client):
    created = api.post("/api/families", json={"familyName": "Ивановы", "userName": "Саша"}).json()
    assert created["loginId"] and created["family"]["isOwner"] is True
    me = api.get("/api/me", headers={"Authorization": f"Bearer {created['token']}"}).json()
    assert me["loginId"] == created["loginId"] and me["role"] == "member"
    logged = new_client().post("/api/auth/login", json={"loginId": created["loginId"]})
    assert logged.status_code == 200 and logged.json()["currentUserId"] == created["currentUserId"]
    assert_error(new_client().post("/api/auth/login", json={"loginId": "AAAAA-AAAAA"}), 401, "unauthorized")

    owner = create_family(new_client(), user="Саша")
    second = join(new_client(), owner, "Саша")  # одинаковое имя допустимо
    pending = join(new_client(), owner.invite_code, "Саша")
    assert_error(second.post(f"/api/family/members/{pending.id}/approve"), 403, "forbidden")
    assert owner.post(f"/api/family/members/{pending.id}/approve").status_code == 200
    assert len({m["id"] for m in owner.get("/api/family").json()["members"]}) == 3


def test_login_id_has_signup_rate_limit(api, new_client):
    created = api.post("/api/families", json={"familyName": "Лимит", "userName": "Анна"}).json()
    client = new_client()
    responses = [client.post("/api/auth/login", json={"loginId": created["loginId"]})
                 for _ in range(get_settings().rate_limit_signup + 1)]
    assert all(response.status_code == 200 for response in responses[:-1])
    assert_error(responses[-1], 429, "rate_limited")


def test_removed_child_endpoints_are_not_exposed(api):
    owner = create_family(api)
    for method, path in (("get", "/api/allowances"), ("post", "/api/purchase-requests"),
                         ("post", "/api/family/child-invites")):
        response = getattr(owner, method)(path, {} if method == "post" else None) if method == "post" else getattr(owner, method)(path)
        assert response.status_code == 404


def test_three_way_shares_summary_analytics_and_calendar(api, new_client):
    owner = create_family(api)
    two = join(new_client(), owner, "Борис")
    three = join(new_client(), owner, "Вера")
    body = {"title": "Продукты", "amount": 100.01, "category": "food", "date": TODAY,
            "source": "shared", "splitMode": "shares",
            "splitMembers": [owner.id, two.id, three.id],
            "splitShares": {owner.id: 3334, two.id: 3333, three.id: 3333}}
    assert owner.post("/api/expenses", body, idem=key()).status_code == 201
    summary = owner.get(f"/api/account/summary?month={TODAY[:7]}").json()
    assert [m["share"] for m in summary["members"]] == [33.35, 33.33, 33.33]
    assert sum(round(m["due"] * 100) for m in summary["members"]) == 10001
    assert owner.get(f"/api/analytics?month={TODAY[:7]}&months=2").status_code == 200
    assert owner.get(f"/api/calendar?month={TODAY[:7]}").status_code == 200
    assert_error(owner.post("/api/expenses", {**body, "source": "personal"}, idem=key()), 422,
                 "validation_error", "source")


def test_payment_details_masking_and_pay_from_shared_account(api):
    owner = create_family(api)
    catalog = owner.get("/api/payments/autopay-catalog").json()
    assert {row["key"] for row in catalog["categories"]} == {"housing", "mobile", "internet", "traffic_fines"}
    payment = owner.post("/api/payments", {
        "title": "Перевод", "amount": 500, "category": "other", "dueDate": TODAY,
        "paymentMethod": "manual", "paymentDetails": {"recipient": "Иван", "method": "card",
        "cardNumber": "4276000012345678", "purpose": "Оплата"}, "splitMode": "equal",
    }, idem=key()).json()
    assert payment["paymentDetails"]["cardNumber"].endswith("5678")
    assert "1234" not in payment["paymentDetails"]["cardNumber"]
    assert owner.get(f"/api/payments/{payment['id']}").json()["paymentDetails"]["cardNumber"] == "4276000012345678"
    shortage = owner.post(f"/api/payments/{payment['id']}/pay", idem=key())
    assert "не хватает" in assert_error(shortage, 409, "conflict")["message"]
    assert owner.post("/api/account/contributions", {"amount": 500}, idem=key()).status_code == 201
    paid = owner.post(f"/api/payments/{payment['id']}/pay", idem=key())
    assert paid.status_code == 200 and paid.json()["payment"]["status"] == "paid"


def _autopay(member, title: str, kind: str, *, amount=500, limit=None):
    return member.post("/api/payments", {
        "title": title, "amount": amount, "category": "housing", "dueDate": TODAY,
        "amountMode": "invoice" if kind == "by_invoice" else "fixed",
        "paymentMethod": "autopay", "autopayType": kind, "providerCategory": "housing",
        "providerName": "МосОблЕИРЦ", "providerIdentifier": "1234567890", "limitAmount": limit,
    }, idem=key())


def test_autopay_by_date_is_idempotent_between_workers(api, needs_db):
    owner = create_family(api)
    owner.post("/api/account/contributions", {"amount": 2_000}, idem=key())
    payment = _autopay(owner, "ЖКУ по дате", "by_date").json()

    async def run():
        engine = make_engine(needs_db)
        try:
            factory = async_sessionmaker(engine, expire_on_commit=False)
            return await asyncio.gather(autopay_once(factory), autopay_once(factory))
        finally:
            await engine.dispose()

    assert sum(asyncio.run(run())) == 1
    assert owner.get(f"/api/payments/{payment['id']}").json()["status"] == "paid"
    assert run_sql(needs_db, "SELECT count(*) FROM expenses WHERE payment_id = $1", payment["id"]) == 1


def test_invoice_autopay_respects_limit_and_manual_confirmation(api):
    owner = create_family(api)
    owner.post("/api/account/contributions", {"amount": 2_000}, idem=key())
    limited = _autopay(owner, "ЖКУ с лимитом", "by_invoice", amount=0, limit=600).json()
    issued = owner.post(f"/api/payments/{limited['id']}/invoice", {"amount": 800}, idem=key())
    assert issued.status_code == 200 and issued.json()["status"] == "upcoming"
    assert owner.get("/api/notifications").json()[0]["kind"] == "autopay_limit"
    assert owner.post(f"/api/payments/{limited['id']}/pay", idem=key()).json()["payment"]["status"] == "paid"

    automatic = _autopay(owner, "ЖКУ без превышения", "by_invoice", amount=0, limit=600).json()
    paid = owner.post(f"/api/payments/{automatic['id']}/invoice", {"amount": 500}, idem=key()).json()
    assert paid["status"] == "paid"


def test_preferences_and_private_deduplicated_debt_reminder(api, new_client, needs_db):
    owner = create_family(api)
    member = join(new_client(), owner, "Борис")
    for participant in (owner, member):
        response = participant.client.patch(
            "/api/me/preferences", headers=participant.h,
            json={"debtReminderThreshold": 0, "defaultSplit": "equal", "calendarEnabled": False},
        )
        assert response.status_code == 200
        assert response.json() == {"debtReminderThreshold": 0, "defaultSplit": "equal",
                                   "calendarEnabled": False}
    body = {"title": "Продукты", "amount": 2_000, "category": "food", "date": TODAY}
    owner.post("/api/expenses", body, idem=key())
    owner.post("/api/expenses", {**body, "title": "Ещё продукты"}, idem=key())
    for participant in (owner, member):
        notes = [row for row in participant.get("/api/notifications").json()
                 if row["kind"] == "debt_reminder"]
        assert len(notes) == 1 and notes[0]["data"]["due"] == 1_000
    assert run_sql(needs_db, "SELECT count(*) FROM notifications WHERE kind='debt_reminder' AND family_id=$1",
                   owner.family_id) == 2


def test_demo_summary_analytics_and_calendar_are_consistent(api):
    demo = api.post("/api/demo").json()
    headers = {"Authorization": f"Bearer {demo['token']}"}
    month = TODAY[:7]
    state = api.get("/api/state", headers=headers).json()
    summary = api.get(f"/api/account/summary?month={month}", headers=headers).json()
    analytics = api.get(f"/api/analytics?month={month}&months=2", headers=headers).json()
    calendar = api.get(f"/api/calendar?month={month}", headers=headers).json()
    month_expenses = [row for row in state["expenses"] if row["date"].startswith(month)]
    assert analytics["account"] == summary
    assert analytics["series"][-1]["expenses"] == round(sum(row["amount"] for row in month_expenses), 2)
    assert round(sum(row["amount"] for row in analytics["categories"]), 2) == analytics["series"][-1]["expenses"]
    assert round(sum(day["expenseTotal"] for day in calendar["days"]), 2) == analytics["series"][-1]["expenses"]
    assert calendar["days"][-1]["accountBalance"] == summary["afterPlanned"]
