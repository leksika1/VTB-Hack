"""Служебные эндпоинты и общие свойства API: health, ready, документация, формат ошибок, CORS, request id."""
from .helpers import assert_error


def test_health(api, local_server):
    # /health — для healthcheck контейнера, наружу через nginx не проксируется; снаружи — /api/health
    paths = ["/api/health"] + (["/health"] if local_server else [])
    for path in paths:
        r = api.get(path)
        assert r.status_code == 200
        assert r.json() == {"status": "ok", "service": "backend"}


def test_ready_checks_database(api):
    r = api.get("/api/ready")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["checks"]["database"] == "ok"
    assert body["checks"]["redis"] == "ok"


def test_openapi_and_docs(api):
    spec = api.get("/api/openapi.json").json()
    paths = set(spec["paths"])
    for expected in (
        "/api/families", "/api/invites/{code}", "/api/invites/{code}/join", "/api/demo", "/api/family",
        "/api/family/leave", "/api/family/switch-user", "/api/family/invite-code", "/api/state", "/api/events", "/api/ready",
        "/api/budgets", "/api/budgets/{month_key}", "/api/expenses", "/api/expenses/{expense_id}",
        "/api/payments", "/api/payments/{payment_id}", "/api/payments/{payment_id}/paid",
        "/api/payments/copy-previous-month", "/api/months/{month_key}/summary",
        "/api/months/{month_key}/purchase-check",
    ):
        assert expected in paths, expected
    assert api.get("/api/docs").status_code == 200


def test_unknown_route_returns_json_error(api):
    assert_error(api.get("/api/nope"), 404, "http_error", message="Не найдено")


def test_wrong_method(api):
    assert api.delete("/api/families").status_code == 405


def test_malformed_json_is_validation_error(api):
    r = api.post("/api/families", content=b"{not json", headers={"Content-Type": "application/json"})
    assert_error(r, 422, "validation_error")


def test_request_id_is_generated_and_propagated(api):
    generated = api.get("/api/health").headers["x-request-id"]
    assert len(generated) == 32
    given = "trace-1234567890"
    assert api.get("/api/health", headers={"X-Request-ID": given}).headers["x-request-id"] == given
    # Мусор не принимаем — генерируем свой
    assert api.get("/api/health", headers={"X-Request-ID": "bad id!"}).headers["x-request-id"] != "bad id!"


def test_cors_preflight_for_frontend_origin(api):
    r = api.options(
        "/api/state",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization,idempotency-key",
        },
    )
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_cors_rejects_unknown_origin(api):
    r = api.options(
        "/api/state",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in r.headers
