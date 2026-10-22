import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db, infra, maintenance, realtime
from .api import auth, family, finance, me, money, planning, system
from .config import get_settings
from .errors import install_error_handlers
from .middleware import BodySizeLimitMiddleware, RequestContextMiddleware, setup_logging
from .schemas import ErrorOut

log = logging.getLogger("app")


def create_app() -> FastAPI:
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        # Схему ведут миграции (alembic upgrade head) — их запускает контейнер перед стартом
        setup_logging(settings.log_level)
        db.init_engine(settings.database_url)
        await infra.init_redis(settings.redis_url)
        if settings.oidc_mock:
            log.warning("OIDC_MOCK=true: включён тестовый провайдер входа — только для демо и тестов")
        realtime.start_listener()
        cleanup = (
            asyncio.create_task(maintenance.run_periodically(settings.maintenance_interval_seconds))
            if settings.maintenance_interval_seconds > 0
            else None
        )
        mailer = asyncio.create_task(maintenance.send_emails_periodically(settings.email_send_interval_seconds))
        yield
        for task in (cleanup, mailer):
            if task:
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task
        await realtime.stop_listener()
        await infra.close_redis()
        await db.dispose_engine()

    docs = settings.enable_docs
    app = FastAPI(
        title="Семейный бюджет — API",
        version="0.3.0",
        description=(
            "Общий бюджет семьи: план на месяц, расходы, обязательные платежи и проверка покупки. "
            "Полное описание — docs/API.md."
        ),
        lifespan=lifespan,
        docs_url="/api/docs" if docs else None,
        redoc_url="/api/redoc" if docs else None,
        openapi_url="/api/openapi.json" if docs else None,
        responses={code: {"model": ErrorOut} for code in (400, 401, 403, 404, 409, 413, 422, 429)},
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "Idempotency-Key", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )
    app.add_middleware(RequestContextMiddleware)
    # Последний добавленный — внешний: большие тела отсекаются раньше всего остального
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_body_bytes,
                       overrides={"/api/imports": settings.max_import_bytes})
    install_error_handlers(app)

    # /health без префикса — для healthcheck контейнера
    app.add_api_route("/health", system.health, include_in_schema=False)
    app.include_router(system.router, prefix="/api")
    app.include_router(family.router, prefix="/api")
    app.include_router(finance.router, prefix="/api")
    app.include_router(money.router, prefix="/api")
    app.include_router(planning.router, prefix="/api")
    app.include_router(me.router, prefix="/api")
    app.include_router(auth.router, prefix="/api")
    return app


app = create_app()
