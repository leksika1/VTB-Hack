"""
Постоянная тестовая семья на сервере («витрина») — docs/TEST_DATA.md.

Одна на сервер, с фиксированным id, поэтому запуск повторяется безопасно (в том числе из нескольких копий
backend одновременно). Вход — через тестовый ВТБ ID (OIDC_MOCK=true) логинами alexey, maria, sonya.
Даты в данных — относительно дня создания, поэтому витрину стоит пересоздавать (--reset) перед показом.

    python -m app.seed            # создать, если нет
    python -m app.seed --reset    # пересоздать со свежими датами
Или при старте контейнера: SEED_SHOWCASE=true.
"""
import argparse
import asyncio
import logging
import uuid

from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError

from . import db, infra
from .config import get_settings
from .models import Family
from .oidc import mock_sub
from .services.demo import build_sample_family

log = logging.getLogger("app.seed")

SHOWCASE_ID = str(uuid.uuid5(uuid.NAMESPACE_URL, "family-budget/showcase"))
SHOWCASE_NAME = "Семья Смирновых (тестовая)"
SHOWCASE_LOGINS = {"Алексей": "alexey", "Мария": "maria", "Соня": "sonya"}


async def ensure_showcase(reset: bool = False, session_factory=None) -> bool:
    """True — витрина создана сейчас, False — уже была."""
    async with (session_factory or db.session)() as session:
        if reset:
            await session.execute(delete(Family).where(Family.id == SHOWCASE_ID))
            await session.commit()
        elif await session.get(Family, SHOWCASE_ID):
            return False
        subs = {name: mock_sub(login) for name, login in SHOWCASE_LOGINS.items()}
        try:
            await build_sample_family(session, name=SHOWCASE_NAME, is_demo=False, family_id=SHOWCASE_ID,
                                      oidc_subs=subs)
        except IntegrityError:
            # Другая копия backend успела создать витрину (или логины уже привязаны к другим участникам)
            await session.rollback()
            return False
    log.info("showcase family created", extra={"extra_fields": {"family_id": SHOWCASE_ID}})
    return True


async def _main(reset: bool) -> None:
    settings = get_settings()
    db.init_engine(settings.database_url)
    await infra.init_redis(settings.redis_url)
    try:
        created = await ensure_showcase(reset=reset)
        print("Витрина создана" if created else "Витрина уже есть (для пересоздания: --reset)")
    finally:
        await infra.close_redis()
        await db.dispose_engine()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Тестовая семья на сервере")
    parser.add_argument("--reset", action="store_true", help="пересоздать со свежими датами")
    asyncio.run(_main(parser.parse_args().reset))
