"""
Инфраструктура тестов. Тесты работают с теми же СУБД, что и прод: PostgreSQL и Redis.

Режимы:
- По умолчанию: на сервере TEST_DATABASE_URL создаётся отдельная база, на неё накатываются миграции
  (так тесты проверяют и миграции), в потоке поднимается uvicorn; в конце база удаляется.
  PostgreSQL и Redis для этого: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait db redis`.
- E2E_BASE_URL=http://127.0.0.1:18080 — те же e2e против уже запущенного стека (nginx → backend).
  Если задан и E2E_DATABASE_URL, работают и тесты, которым нужен прямой доступ к базе.

Каждый клиент получает свой X-Forwarded-For, поэтому лимиты запросов разных тестов не пересекаются.
"""
import asyncio
import os
import random
import socket
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path

import asyncpg
import httpx
import pytest
import redis
import uvicorn

BACKEND_DIR = Path(__file__).resolve().parents[1]
REMOTE_URL = os.environ.get("E2E_BASE_URL", "").rstrip("/")
REMOTE_DB_URL = os.environ.get("E2E_DATABASE_URL", "")
TEST_DB_ADMIN_URL = os.environ.get("TEST_DATABASE_URL", "postgresql+asyncpg://family:family@localhost:55432/family")
TEST_REDIS_URL = os.environ.get("TEST_REDIS_URL", "redis://:family@localhost:6379/15")


def asyncpg_dsn(sqlalchemy_url: str) -> str:
    return sqlalchemy_url.replace("postgresql+asyncpg://", "postgresql://", 1)


def run_sql(sqlalchemy_url: str, query: str, *args):
    """Выполнить SQL напрямую в базе (для подготовки состояний, которых не добиться через API)."""
    async def go():
        conn = await asyncpg.connect(asyncpg_dsn(sqlalchemy_url))
        try:
            return await conn.fetchval(query, *args) if query.lstrip().upper().startswith("SELECT") \
                else await conn.execute(query, *args)
        finally:
            await conn.close()

    return asyncio.run(go())


class IsolatedDatabase:
    """Отдельная база на прогон: тесты не трогают данные разработчика и не мешают друг другу."""

    def __init__(self, admin_url: str):
        self.admin_url = admin_url
        self.name = f"e2e_{uuid.uuid4().hex[:12]}"
        base, _, _ = admin_url.rpartition("/")
        self.url = f"{base}/{self.name}"

    def create(self) -> None:
        try:
            run_sql(self.admin_url, f'CREATE DATABASE "{self.name}"')
        except OSError as e:
            pytest.exit(
                f"PostgreSQL недоступен ({self.admin_url}): {e}\n"
                "Запустите: docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait db redis",
                returncode=2,
            )
        subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=BACKEND_DIR, env={**os.environ, "DATABASE_URL": self.url}, check=True, capture_output=True,
        )

    def drop(self) -> None:
        run_sql(self.admin_url, f'DROP DATABASE IF EXISTS "{self.name}" WITH (FORCE)')


class LocalServer:
    def __init__(self, database_url: str):
        self.database_url = database_url
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            self.port = s.getsockname()[1]
        self.url = f"http://127.0.0.1:{self.port}"

    def start(self) -> None:
        redis.Redis.from_url(TEST_REDIS_URL).flushdb()
        os.environ.update(
            DATABASE_URL=self.database_url,
            REDIS_URL=TEST_REDIS_URL,
            MAINTENANCE_INTERVAL_SECONDS="0",
            EVENTS_HEARTBEAT_SECONDS="1",
            LOG_LEVEL="WARNING",
        )
        from app.config import get_settings
        from app.main import create_app

        get_settings.cache_clear()
        config = uvicorn.Config(
            create_app(),
            host="127.0.0.1",
            port=self.port,
            proxy_headers=True,
            forwarded_allow_ips="127.0.0.1",
            log_level="warning",
            access_log=False,
        )
        self.server = uvicorn.Server(config)
        self.thread = threading.Thread(target=self.server.run, daemon=True)
        self.thread.start()
        deadline = time.time() + 20
        while not self.server.started:
            if time.time() > deadline or not self.thread.is_alive():
                raise RuntimeError("test server did not start")
            time.sleep(0.05)

    def stop(self) -> None:
        self.server.should_exit = True
        self.thread.join(timeout=10)


@pytest.fixture(scope="session")
def test_database():
    if REMOTE_URL:
        yield None
        return
    database = IsolatedDatabase(TEST_DB_ADMIN_URL)
    database.create()
    yield database
    database.drop()


@pytest.fixture(scope="session")
def local_server(test_database):
    """Сервер в процессе тестов (None в режиме E2E_BASE_URL)."""
    if test_database is None:
        yield None
        return
    server = LocalServer(test_database.url)
    server.start()
    yield server
    server.stop()


@pytest.fixture(scope="session")
def base_url(local_server) -> str:
    return REMOTE_URL or local_server.url


@pytest.fixture(scope="session")
def db_url(test_database) -> str | None:
    """URL базы, с которой работает сервер, — для тестов, которым нужен прямой доступ к ней."""
    return test_database.url if test_database else (REMOTE_DB_URL or None)


@pytest.fixture
def needs_db(db_url) -> str:
    if not db_url:
        pytest.skip("нужен прямой доступ к базе сервера (E2E_DATABASE_URL)")
    return db_url


def random_ip() -> str:
    # Не из частных сетей: иначе сервер примет адрес за прокси и возьмёт следующий
    return f"203.0.{random.randint(0, 255)}.{random.randint(1, 254)}"


@pytest.fixture
def new_client(base_url):
    """Фабрика клиентов. Каждый — как отдельное устройство со своим IP."""
    clients: list[httpx.Client] = []

    def make(ip: str | None = None) -> httpx.Client:
        client = httpx.Client(base_url=base_url, headers={"X-Forwarded-For": ip or random_ip()}, timeout=15)
        clients.append(client)
        return client

    yield make
    for c in clients:
        c.close()


@pytest.fixture
def api(new_client) -> httpx.Client:
    return new_client()
