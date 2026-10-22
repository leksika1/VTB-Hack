"""Постоянная тестовая семья на сервере (docs/TEST_DATA.md)."""
import asyncio

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.db import make_engine
from app.seed import SHOWCASE_ID, SHOWCASE_NAME, ensure_showcase, showcase_codes

from .test_oidc import bank_login, callback


def run_seed(db_url, reset=False):
    async def go():
        engine = make_engine(db_url)
        try:
            return await ensure_showcase(reset=reset, session_factory=async_sessionmaker(engine, expire_on_commit=False))
        finally:
            await engine.dispose()

    return asyncio.run(go())


def login_as(client, login):
    code, state = bank_login(client, login=login)
    body = callback(client, code, state).json()
    assert body["status"] == "session", body
    return body["session"]


def test_showcase_is_idempotent_and_reachable_by_test_logins(api, new_client, needs_db):
    run_seed(needs_db, reset=True)
    assert run_seed(needs_db) is False  # повторный запуск ничего не создаёт

    alexey = login_as(api, "alexey")
    assert (alexey["family"]["id"], alexey["family"]["name"]) == (SHOWCASE_ID, SHOWCASE_NAME)
    sonya = login_as(new_client(), "sonya")
    assert sonya["family"]["id"] == SHOWCASE_ID and sonya["family"]["inviteCode"] is None  # ребёнок
    maria = login_as(new_client(), "maria")
    roles = {m["name"]: m["role"] for m in maria["family"]["members"]}
    assert roles == {"Алексей": "parent", "Мария": "parent", "Соня": "child"}

    headers = {"Authorization": f"Bearer {alexey['token']}"}
    state = api.get("/api/state", headers=headers).json()
    assert (len(state["expenses"]), len(state["payments"]), len(state["budgets"])) == (13, 7, 2)

    # Пересоздание — свежая семья с теми же логинами, старые сессии больше не действуют
    assert run_seed(needs_db, reset=True) is True
    assert api.get("/api/state", headers=headers).status_code == 401
    assert login_as(api, "alexey")["family"]["id"] == SHOWCASE_ID


def test_showcase_codes_let_jury_join(api, new_client, needs_db):
    run_seed(needs_db, reset=True)

    async def go():
        engine = make_engine(needs_db)
        try:
            return await showcase_codes(async_sessionmaker(engine, expire_on_commit=False))
        finally:
            await engine.dispose()

    family_code, child_code = asyncio.run(go())
    adult = new_client().post(f"/api/invites/{family_code}/join", json={"userName": "Жюри"}).json()
    assert adult["family"]["id"] == SHOWCASE_ID
    assert len(api.get("/api/state", headers={"Authorization": f"Bearer {adult['token']}"}).json()["expenses"]) == 13
    child = new_client().post(f"/api/invites/{child_code}/join", json={"userName": "Ребёнок жюри"}).json()
    assert child["family"]["id"] == SHOWCASE_ID and child["family"]["inviteCode"] is None
