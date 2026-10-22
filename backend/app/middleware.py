"""
ASGI-middleware (чистые, без BaseHTTPMiddleware — не ломают потоковые ответы SSE).

RequestContextMiddleware: X-Request-ID (принимает от прокси или создаёт), заголовки безопасности,
строка журнала на запрос в JSON, и после успешного изменяющего запроса — событие «данные семьи изменились»
(см. realtime.py). Кто и в какой семье менял, кладёт в scope["state"] зависимость current_member (deps.py).

BodySizeLimitMiddleware: отклоняет тело больше MAX_BODY_BYTES до того, как оно прочитано.
"""
import json
import logging
import re
import time
import uuid
from contextvars import ContextVar

from . import realtime

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")
access_log = logging.getLogger("app.access")

_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{8,64}$")
# Код приглашения — это доступ к семье: в журнал не пишем
_INVITE_PATH_RE = re.compile(r"^/api/invites/[^/]+")
_WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
# Ответы API не кэшируются (в них личные данные семьи) и не исполняются браузером как HTML
_SECURITY_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"no-referrer"),
    (b"cache-control", b"no-store"),
]


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        data = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": request_id_var.get(),
        }
        data.update(getattr(record, "extra_fields", {}))
        if record.exc_info:
            data["exc"] = self.formatException(record.exc_info)
        return json.dumps(data, ensure_ascii=False)


def setup_logging(level: str) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level)


class RequestContextMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        incoming = dict(scope["headers"]).get(b"x-request-id", b"").decode("latin-1")
        request_id = incoming if _REQUEST_ID_RE.match(incoming) else uuid.uuid4().hex
        token = request_id_var.set(request_id)
        scope.setdefault("state", {})
        started = time.perf_counter()
        status = 500

        async def send_wrapper(message):
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                headers = message.setdefault("headers", [])
                present = {name.lower() for name, _ in headers}
                headers.append((b"x-request-id", request_id.encode()))
                headers.extend(h for h in _SECURITY_HEADERS if h[0] not in present)
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            state = scope["state"]
            family_id = state.get("family_id")
            if (
                family_id
                and scope["method"] in _WRITE_METHODS
                and status < 400
                and not state.get("silent")
            ):
                await realtime.publish(family_id, {"type": "changed", "by": state.get("member_id")})
            if scope["path"] not in ("/health", "/api/health"):
                access_log.info(
                    "request",
                    extra={"extra_fields": {
                        "method": scope["method"],
                        "path": _INVITE_PATH_RE.sub("/api/invites/***", scope["path"]),
                        "status": status,
                        "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                        "client": scope["client"][0] if scope.get("client") else None,
                    }},
                )
            request_id_var.reset(token)


class BodySizeLimitMiddleware:
    """Тело запроса — только с Content-Length и не больше max_bytes. Браузеры, httpx и nginx
    всегда передают длину; chunked-тело неизвестного размера отклоняется до чтения."""

    def __init__(self, app, max_bytes: int, overrides: dict[str, int] | None = None):
        self.app = app
        self.max_bytes = max_bytes
        # Пути с другим лимитом: загрузка выписки (docs/FEATURES.md §10)
        self.overrides = overrides or {}

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = dict(scope["headers"])
        length = headers.get(b"content-length")
        if length is not None:
            limit = self.overrides.get(scope["path"], self.max_bytes)
            if not length.isdigit() or int(length) > limit:
                return await _reject(send, 413, "payload_too_large", "Слишком большой запрос")
        elif b"chunked" in headers.get(b"transfer-encoding", b"").lower():
            return await _reject(send, 411, "length_required", "Нужен заголовок Content-Length")
        await self.app(scope, receive, send)


async def _reject(send, status: int, code: str, message: str) -> None:
    body = json.dumps({"error": {"code": code, "message": message, "field": None}}, ensure_ascii=False).encode()
    await send({
        "type": "http.response.start",
        "status": status,
        "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
    })
    await send({"type": "http.response.body", "body": body})
