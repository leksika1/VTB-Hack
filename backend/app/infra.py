"""
Подключение к Redis. В Redis только то, что можно потерять: счётчики лимитов запросов
и рассылка событий между экземплярами backend. Источник истины — PostgreSQL.
"""
from redis.asyncio import Redis

_redis: Redis | None = None


async def init_redis(url: str) -> Redis:
    global _redis
    _redis = Redis.from_url(url, decode_responses=True, health_check_interval=30)
    await _redis.ping()
    return _redis


def get_redis() -> Redis:
    assert _redis is not None, "init_redis() was not called"
    return _redis


async def close_redis() -> None:
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None
