"""Аутентификация, изоляция семей, сроки сессий, лимиты запросов."""
import time

import pytest

from tests.conftest import run_sql

from .helpers import MONTH, TODAY, add_expense, add_payment, assert_error, auth, create_family, set_budget

PROTECTED = [
    ("GET", "/api/state"), ("GET", "/api/family"), ("POST", "/api/family/leave"), ("POST", "/api/family/invite-code"), ("GET", "/api/events"),
    ("GET", "/api/budgets"), ("PUT", f"/api/budgets/{MONTH}"), ("GET", "/api/expenses"), ("POST", "/api/expenses"),
    ("GET", "/api/payments"), ("POST", "/api/payments"), ("GET", f"/api/months/{MONTH}/summary"),
    ("POST", f"/api/months/{MONTH}/purchase-check"), ("POST", "/api/payments/copy-previous-month"),
]


@pytest.mark.parametrize("method,path", PROTECTED)
def test_endpoints_require_token(api, method, path):
    for headers in ({}, {"Authorization": "Basic abc"}, {"Authorization": "Bearer"}, auth("forged-token")):
        r = api.request(method, path, headers=headers, json={})
        assert_error(r, 401, "unauthorized", message="Сессия истекла. Откройте приложение заново.")


def test_bearer_scheme_is_case_insensitive(api):
    anna = create_family(api)
    assert api.get("/api/family", headers={"Authorization": f"bearer {anna.token}"}).status_code == 200


def test_families_are_isolated(api, new_client):
    anna = create_family(api, "Ивановы")
    eve = create_family(new_client(), "Чужие", "Ева")
    set_budget(anna, 5000, {})
    expense = add_expense(anna, 10, title="Секрет")
    payment = add_payment(anna, 20)

    # Чужие данные не видны ни в одном списке
    state = eve.get("/api/state").json()
    assert (state["budgets"], state["expenses"], state["payments"]) == ([], [], [])
    assert eve.get("/api/expenses").json() == [] and eve.get("/api/payments").json() == []
    assert eve.get("/api/budgets").json() == []
    assert_error(eve.get(f"/api/budgets/{MONTH}"), 404)
    assert summary_spent(eve) == 0

    # И не меняются: для чужой семьи объекта «нет»
    body = {"title": "x", "amount": 1, "category": "food", "date": TODAY}
    assert_error(eve.put(f"/api/expenses/{expense['id']}", body), 404)
    assert eve.delete(f"/api/expenses/{expense['id']}").status_code == 204
    assert_error(eve.put(f"/api/payments/{payment['id']}", {**body, "dueDate": TODAY}), 404)
    assert_error(eve.post(f"/api/payments/{payment['id']}/paid", {"paid": True}), 404)
    assert eve.delete(f"/api/payments/{payment['id']}").status_code == 204

    state = anna.get("/api/state").json()
    assert [e["id"] for e in state["expenses"]] == [expense["id"]]
    assert [p["status"] for p in state["payments"]] == ["upcoming"]


def summary_spent(m) -> float:
    return m.get(f"/api/months/{MONTH}/summary").json()["spent"]


def test_tokens_are_not_exposed(api):
    anna = create_family(api)
    state = str(anna.get("/api/state").json())
    family = str(anna.get("/api/family").json())
    assert anna.token not in state and anna.token not in family


def test_inactive_session_expires(api, needs_db):
    anna = create_family(api)
    ninety_one_days = 91 * 86_400_000
    run_sql(needs_db, "UPDATE member_sessions SET last_seen_at = $1 WHERE member_id = $2",
            int(time.time() * 1000) - ninety_one_days, anna.id)
    assert_error(anna.get("/api/state"), 401, "unauthorized")
    # Сессия удалена, а не просто отклонена
    assert run_sql(needs_db, "SELECT count(*) FROM member_sessions WHERE member_id = $1", anna.id) == 0


def test_rate_limit_on_invite_codes(new_client):
    """Перебор кодов приглашения: после 20 попыток в минуту с одного IP — 429."""
    attacker = new_client()
    for i in range(20):
        assert attacker.get(f"/api/invites/AAAA{i:02d}").status_code == 404
    assert_error(attacker.get("/api/invites/AAAA99"), 429, "rate_limited")
    assert_error(attacker.post("/api/invites/AAAA99/join", json={"userName": "x"}), 429, "rate_limited")
    # Другой IP не страдает
    assert new_client().get("/api/invites/AAAA99").status_code == 404


def test_rate_limit_on_signup(new_client):
    client = new_client()
    for i in range(10):
        assert client.post("/api/families", json={"familyName": f"Ф{i}", "userName": "А"}).status_code == 201
    assert_error(client.post("/api/families", json={"familyName": "Ф", "userName": "А"}), 429, "rate_limited")
    assert_error(client.post("/api/demo"), 429, "rate_limited")


def test_rate_limit_on_writes_per_member(new_client):
    anna = create_family(new_client())
    body = {"title": "x", "amount": 1, "category": "food", "date": TODAY}
    statuses = [anna.post("/api/expenses", body).status_code for _ in range(121)]
    assert statuses[:120] == [201] * 120
    assert statuses[120] == 429
    # Чтение не ограничено этим лимитом
    assert anna.get("/api/state").status_code == 200


def test_spoofed_forwarded_for_from_untrusted_client_is_ignored(base_url, local_server):
    """X-Forwarded-For принимается только от доверенного прокси. Здесь клиент = 127.0.0.1 (доверенный),
    поэтому проверяем цепочку: подделка слева, реальный адрес справа — лимит считается по правому."""
    if local_server is None:
        pytest.skip("проверка заголовков на сервере без внешнего прокси")
    import httpx

    real_ip = "198.51.100.77"
    with httpx.Client(base_url=base_url) as client:
        for i in range(20):
            fake = f"8.8.{i}.{i}"
            r = client.get("/api/invites/BBBB00", headers={"X-Forwarded-For": f"{fake}, {real_ip}"})
            assert r.status_code == 404
        r = client.get("/api/invites/BBBB00", headers={"X-Forwarded-For": f"1.1.1.1, {real_ip}"})
        assert r.status_code == 429
