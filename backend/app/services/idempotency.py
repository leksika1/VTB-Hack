"""
Идемпотентность записи. Фронтенд шлёт заголовок Idempotency-Key — один ключ на открытую форму.
Повтор с тем же ключом (двойной клик, ретрай после обрыва сети) получает сохранённый ответ,
а не создаёт вторую запись.
"""
import hashlib
import json
from collections.abc import Awaitable, Callable
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..errors import Conflict
from ..models import IdempotencyRecord


def fingerprint(*parts: Any) -> str:
    raw = json.dumps(parts, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()


async def replay(db: AsyncSession, scope: str, key: str, fp: str) -> dict | None:
    record = await db.get(IdempotencyRecord, (scope, key))
    if record is None:
        return None
    if record.fingerprint != fp:
        raise Conflict("Повторный запрос отличается от исходного. Обновите страницу и попробуйте ещё раз.")
    return record.response


async def run(
    db: AsyncSession,
    scope: str,
    key: str | None,
    fp: str,
    action: Callable[[], Awaitable[dict]],
) -> dict:
    """Выполнить action и закоммитить вместе с записью о ключе — атомарно."""
    if key:
        cached = await replay(db, scope, key, fp)
        if cached is not None:
            return cached
    result = await action()
    if key:
        db.add(IdempotencyRecord(scope=scope, key=key, fingerprint=fp, response=result))
    try:
        await db.commit()
    except IntegrityError:
        # Параллельный дубль успел первым — отдаём его результат
        await db.rollback()
        if key and (cached := await replay(db, scope, key, fp)) is not None:
            return cached
        raise
    return result
