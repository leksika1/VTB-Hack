"""
Лимиты запросов: скользящее окно (текущее окно + взвешенный остаток предыдущего), счётчики в Redis —
общие для всех экземпляров backend. Скользящее, а не фиксированное: на стыке двух окон нельзя
удвоить лимит, отправив пачку в конце одного окна и пачку в начале следующего.
Первый рубеж — nginx (limit_req по IP), здесь — лимиты по смыслу: перебор кодов приглашения,
массовое создание семей, слишком частые чтения и записи одного участника.
"""
import logging
import time
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, Request

from .config import get_settings
from .errors import TooManyRequests
from .infra import get_redis

log = logging.getLogger("app.ratelimit")


async def hit(key: str, limit: int, window: int) -> bool:
    """Засчитать запрос. True — укладываемся в лимит."""
    now = time.time()
    index = int(now // window)
    current, previous = f"rl:{key}:{index}", f"rl:{key}:{index - 1}"
    try:
        async with get_redis().pipeline(transaction=True) as pipe:
            count, _, before = await pipe.incr(current).expire(current, window * 2).get(previous).execute()
    except Exception:
        # Redis недоступен: лучше временно пропустить запрос, чем положить весь сервис
        log.exception("rate limit check failed")
        return True
    elapsed_share = (now % window) / window
    return count + int(before or 0) * (1 - elapsed_share) <= limit


def client_ip(request: Request) -> str:
    # Реальный IP подставлен uvicorn из X-Forwarded-For — только от прокси из FORWARDED_ALLOW_IPS
    return request.client.host if request.client else "unknown"


def limit_by_ip(scope: str, limit_of: Callable[[], int]):
    async def dependency(request: Request) -> None:
        settings = get_settings()
        if settings.rate_limit_enabled and not await hit(
            f"{scope}:{client_ip(request)}", limit_of(), settings.rate_limit_window_seconds
        ):
            raise TooManyRequests()

    return Depends(dependency)


InviteLimit = Annotated[None, limit_by_ip("invite", lambda: get_settings().rate_limit_invite)]
SignupLimit = Annotated[None, limit_by_ip("signup", lambda: get_settings().rate_limit_signup)]


async def check_member_limit(member_id: str, write: bool) -> None:
    settings = get_settings()
    if not settings.rate_limit_enabled:
        return
    scope, limit = ("write", settings.rate_limit_write) if write else ("read", settings.rate_limit_read)
    if not await hit(f"{scope}:{member_id}", limit, settings.rate_limit_window_seconds):
        raise TooManyRequests()
