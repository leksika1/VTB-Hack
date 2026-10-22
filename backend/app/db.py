from collections.abc import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def make_engine(url: str) -> AsyncEngine:
    return create_async_engine(
        url,
        pool_pre_ping=True,
        # 10 постоянных + 20 временных соединений на экземпляр; у PostgreSQL по умолчанию max_connections=100
        pool_size=10,
        max_overflow=20,
        # Нет свободного соединения 5 с — отвечаем 503, а не копим очередь запросов
        pool_timeout=5,
        connect_args={
            "timeout": 5,
            # Ни один запрос не держит соединение дольше 5 с, транзакция не висит открытой дольше 15 с
            "server_settings": {"statement_timeout": "5000", "idle_in_transaction_session_timeout": "15000"},
        },
    )


def init_engine(url: str) -> AsyncEngine:
    global _engine, _sessionmaker
    _engine = make_engine(url)
    _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


async def dispose_engine() -> None:
    if _engine is not None:
        await _engine.dispose()


def session() -> AsyncSession:
    """Сессия вне запроса (фоновые задачи): `async with db.session() as s: ...`"""
    assert _sessionmaker is not None, "init_engine() was not called"
    return _sessionmaker()


async def get_db() -> AsyncIterator[AsyncSession]:
    async with session() as s:
        yield s


async def ping() -> None:
    assert _engine is not None
    async with _engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
