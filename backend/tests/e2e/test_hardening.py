"""Защита от злоупотреблений и исчерпания ресурсов; заголовки безопасности; смена кода приглашения."""
import time

from tests.conftest import run_sql

from .helpers import TODAY, EventStream, assert_error, auth, create_family, join


def test_api_security_headers(api):
    anna = create_family(api)
    for r in (anna.get("/api/state"), api.get("/api/invites/ZZZZZZ"), api.get("/api/health")):
        assert r.headers["x-content-type-options"] == "nosniff"
        assert r.headers["x-frame-options"] == "DENY"
        assert r.headers["referrer-policy"] == "no-referrer"
        assert r.headers["cache-control"] == "no-store"


def test_request_body_size_limit(api):
    anna = create_family(api)
    huge = {"title": "x" * 70_000, "amount": 1, "category": "food", "date": TODAY}
    assert_error(anna.post("/api/expenses", huge), 413, "payload_too_large")
    assert anna.get("/api/expenses").json() == []


def test_body_without_length_is_rejected(api):
    anna = create_family(api)

    def chunks():
        yield b'{"title": "x", "amount": 1, '
        yield b'"category": "food", "date": "2026-01-01"}'

    r = api.post("/api/expenses", content=chunks(),
                 headers={**auth(anna.token), "Content-Type": "application/json"})
    # Через nginx тело приходит уже с длиной (nginx буферизует запрос) — тогда запрос проходит
    assert r.status_code in (411, 201)
    if r.status_code == 411:
        assert_error(r, 411, "length_required")


def test_read_rate_limit_per_member(new_client):
    anna = create_family(new_client())
    statuses = [anna.get("/api/family").status_code for _ in range(650)]
    # Раньше лимита — никогда; после него — сразу или почти сразу: если пачка пришлась на стык минут,
    # скользящее окно учитывает прошлую минуту с весом чуть меньше 1 и пропускает несколько лишних запросов
    assert statuses[:600] == [200] * 600
    assert 429 in statuses[600:650]


def test_event_streams_per_member_are_capped(api, new_client):
    anna = create_family(api)
    streams = [EventStream(new_client(), anna.token) for _ in range(5)]
    try:
        assert all(s.next() == "ready" for s in streams)
        assert_error(new_client().get("/api/events", headers=auth(anna.token)), 429, "rate_limited")
        # Закрытый поток освобождает место. Через прокси сервер узнаёт об обрыве не сразу,
        # а при следующей записи в поток (ping раз в EVENTS_HEARTBEAT_SECONDS), поэтому ждём с запасом
        streams.pop().close()
        deadline = time.time() + 15
        while True:
            extra = EventStream(new_client(), anna.token)
            if extra.response.status_code == 200 or time.time() > deadline:
                break
            extra.close()
            time.sleep(0.3)
        streams.append(extra)
        assert extra.response.status_code == 200 and extra.next() == "ready"
    finally:
        for s in streams:
            s.close()


def test_rotate_invite_code(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna.invite_code)
    old = anna.invite_code
    stream = EventStream(new_client(), boris.token)
    try:
        assert stream.next() == "ready"
        r = anna.post("/api/family/invite-code")
        assert r.status_code == 200
        new = r.json()["inviteCode"]
        assert new != old and len(new) == 6
        assert [m["name"] for m in r.json()["members"]] == ["Анна", "Борис"]
        assert stream.next() == "changed"  # Борис увидит новый код без перезагрузки
    finally:
        stream.close()
    assert_error(new_client().get(f"/api/invites/{old}"), 404)
    assert_error(new_client().post(f"/api/invites/{old}/join", json={"userName": "Чужой"}), 404)
    assert new_client().get(f"/api/invites/{new}").json()["membersCount"] == 2
    assert boris.get("/api/state").status_code == 200  # участники остаются


def test_records_per_family_are_capped(api, needs_db):
    anna = create_family(api)
    run_sql(
        needs_db,
        """INSERT INTO expenses (id, family_id, title, amount_kop, category, date, author_id, created_at)
           SELECT gen_random_uuid()::text, $1, 'bulk', 100, 'food', DATE '2020-01-01', $2, 0
           FROM generate_series(1, 20000)""",
        anna.family_id, anna.id,
    )
    r = anna.post("/api/expenses", {"title": "ещё одна", "amount": 1, "category": "food", "date": TODAY})
    assert_error(r, 409, "conflict")
    assert "предел" in r.json()["error"]["message"]


def test_anonymous_idempotency_key_is_bound_to_client_ip(new_client):
    """Чужой ключ с другого адреса не выдаёт сессию в чужой семье — создаётся новая семья."""
    body = {"familyName": "Ключевые", "userName": "Анна"}
    k = "k" * 32
    first = new_client().post("/api/families", json=body, headers={"Idempotency-Key": k}).json()
    attacker = new_client().post("/api/families", json=body, headers={"Idempotency-Key": k}).json()
    assert attacker["family"]["id"] != first["family"]["id"]


def test_short_idempotency_key_is_rejected(api):
    anna = create_family(api)
    body = {"title": "x", "amount": 1, "category": "food", "date": TODAY}
    assert_error(anna.post("/api/expenses", body, idem="short"), 422, field="Idempotency-Key")
