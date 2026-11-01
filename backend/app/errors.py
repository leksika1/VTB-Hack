"""
Ошибки API. Тело всегда одинаковое — фронтенд показывает message, а field подсвечивает поле формы:
    {"error": {"code": "validation_error", "message": "Сумма должна быть больше нуля", "field": "amount"}}
"""
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.exc import TimeoutError as PoolTimeout
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    status = 400
    code = "bad_request"

    def __init__(self, message: str, field: str | None = None):
        super().__init__(message)
        self.message = message
        self.field = field


class ValidationFailed(ApiError):
    status = 422
    code = "validation_error"


class Unauthorized(ApiError):
    status = 401
    code = "unauthorized"

    def __init__(self, message: str = "Сессия истекла. Откройте приложение заново."):
        super().__init__(message)


class Forbidden(ApiError):
    status = 403
    code = "forbidden"


class PendingApproval(Forbidden):
    code = "pending_approval"

    def __init__(self, message: str = "Взрослый участник семьи ещё не подтвердил ваш вход"):
        super().__init__(message)


class DemoOnly(Forbidden):
    """Действие затронуло бы что-то за пределами демо-копии (docs/FEATURES.md, «Демо-семья»)."""

    code = "demo_restricted"

    def __init__(self, message: str = "В демо-семье это недоступно — она только для примера"):
        super().__init__(message)


class NotFound(ApiError):
    status = 404
    code = "not_found"


class Conflict(ApiError):
    status = 409
    code = "conflict"


class TooManyRequests(ApiError):
    status = 429
    code = "rate_limited"

    def __init__(self, message: str = "Слишком много запросов. Подождите минуту и попробуйте снова."):
        super().__init__(message)


def _body(code: str, message: str, field: str | None = None) -> dict:
    return {"error": {"code": code, "message": message, "field": field}}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError):
        return JSONResponse(_body(exc.code, exc.message, exc.field), status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        first = exc.errors()[0] if exc.errors() else {}
        loc = [str(p) for p in first.get("loc", ()) if p not in ("body", "query", "path", "header")]
        field = loc[-1] if loc else None
        return JSONResponse(_body("validation_error", "Проверьте введённые данные", field), status_code=422)

    @app.exception_handler(IntegrityError)
    async def _integrity(_: Request, __: IntegrityError):
        # Страховка от гонок, которые не закрыты блокировками и upsert
        return JSONResponse(
            _body("conflict", "Данные одновременно изменил другой участник. Обновите страницу и повторите."),
            status_code=409,
        )

    @app.exception_handler(PoolTimeout)
    async def _overloaded(_: Request, __: PoolTimeout):
        logging.getLogger("app.errors").warning("database pool exhausted")
        return JSONResponse(
            _body("overloaded", "Сервер перегружен. Попробуйте через минуту."), status_code=503, headers={"Retry-After": "30"}
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        logging.getLogger("app.errors").error("unhandled error", exc_info=exc)
        return JSONResponse(_body("internal_error", "Что-то пошло не так. Попробуйте ещё раз."), status_code=500)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException):
        message = "Не найдено" if exc.status_code == 404 else str(exc.detail)
        return JSONResponse(_body("http_error", message), status_code=exc.status_code)
