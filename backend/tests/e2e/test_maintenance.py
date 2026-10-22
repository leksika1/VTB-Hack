"""Фоновая очистка: устаревшие ответы идемпотентности, сессии и демо-семьи."""
import asyncio
import time

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.db import make_engine
from app.maintenance import cleanup_once
from tests.conftest import run_sql

from .helpers import assert_error, create_family, key, start_demo

DAY_MS = 86_400_000


def ago(days: float) -> int:
    return int(time.time() * 1000 - days * DAY_MS)


def run_cleanup(db_url: str) -> dict:
    async def go():
        engine = make_engine(db_url)
        try:
            return await cleanup_once(async_sessionmaker(engine, expire_on_commit=False))
        finally:
            await engine.dispose()

    return asyncio.run(go())


def test_cleanup(api, new_client, needs_db):
    demo = start_demo(new_client())
    anna = create_family(api)
    k = key()
    anna.post("/api/expenses", {"title": "x", "amount": 1, "category": "food", "date": "2026-01-01"}, idem=k)
    fresh = create_family(new_client(), "Свежие")

    run_sql(needs_db, "UPDATE families SET created_at = $1 WHERE id = $2", ago(2), demo.family_id)
    run_sql(needs_db, "UPDATE idempotency_records SET created_at = $1 WHERE scope = $2 AND key = $3", ago(2), anna.id, k)
    run_sql(needs_db, "UPDATE member_sessions SET last_seen_at = $1 WHERE member_id = $2", ago(100), anna.id)

    removed = run_cleanup(needs_db)
    assert removed["demo_families"] >= 1 and removed["idempotency"] >= 1 and removed["sessions"] >= 1

    assert_error(demo.get("/api/state"), 401)     # демо-семья удалена вместе с сессиями
    assert_error(anna.get("/api/state"), 401)     # сессия просрочена
    assert fresh.get("/api/state").status_code == 200  # свежие данные не тронуты
    assert run_sql(needs_db, "SELECT count(*) FROM members WHERE family_id = $1", demo.family_id) == 0
