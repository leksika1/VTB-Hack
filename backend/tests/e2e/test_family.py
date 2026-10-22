"""Семья: создание, приглашение, вход, выход, демо, состояние."""
from .helpers import (
    MONTH,
    TODAY,
    add_child,
    add_expense,
    assert_error,
    auth,
    create_family,
    join,
    key,
    set_budget,
    start_demo,
    summary,
)

# ── POST /api/families ──


def test_create_family(api):
    r = api.post("/api/families", json={"familyName": "  Ивановы ", "userName": " Анна "})
    assert r.status_code == 201
    body = r.json()
    assert set(body) == {"token", "currentUserId", "family"}
    family = body["family"]
    assert family["name"] == "Ивановы"
    assert family["isDemo"] is False
    assert len(family["inviteCode"]) == 6 and family["inviteCode"].isalnum() and family["inviteCode"].isupper()
    assert family["members"] == [
        {"id": body["currentUserId"], "name": "Анна", "color": family["members"][0]["color"], "role": "parent"}]
    assert family["members"][0]["color"].startswith("#")


def test_create_family_validation(api):
    cases = [
        ({"familyName": " ", "userName": "Анна"}, "familyName", "Укажите название семьи"),
        ({"familyName": "Ивановы", "userName": ""}, "userName", "Укажите ваше имя"),
        ({"familyName": "Я" * 81, "userName": "Анна"}, "familyName", None),
        ({"familyName": "Ивановы", "userName": "Я" * 61}, "userName", None),
        ({"familyName": "Ивановы"}, "userName", None),
    ]
    for body, field, message in cases:
        assert_error(api.post("/api/families", json=body), 422, "validation_error", field, message)


def test_create_family_idempotent(api):
    k = key()
    body = {"familyName": "Петровы", "userName": "Пётр"}
    first = api.post("/api/families", json=body, headers={"Idempotency-Key": k}).json()
    second = api.post("/api/families", json=body, headers={"Idempotency-Key": k}).json()
    assert first["family"]["id"] == second["family"]["id"]
    assert first["currentUserId"] == second["currentUserId"]
    # Повтор получает новый токен (старые токены в базе не хранятся), оба рабочие
    assert first["token"] != second["token"]
    for token in (first["token"], second["token"]):
        assert api.get("/api/family", headers=auth(token)).status_code == 200
    # Тот же ключ с другими данными — конфликт
    other = api.post("/api/families", json={**body, "userName": "Павел"}, headers={"Idempotency-Key": k})
    assert_error(other, 409, "conflict")


# ── GET /api/invites/{code} ──


def test_invite_preview(api, new_client):
    anna = create_family(api, "Сидоровы")
    guest = new_client()
    r = guest.get(f"/api/invites/{anna.invite_code.lower()}")
    assert r.status_code == 200
    assert r.json() == {"code": anna.invite_code, "familyName": "Сидоровы", "membersCount": 1, "role": "parent"}


def test_invite_preview_errors(api):
    assert_error(api.get("/api/invites/AB"), 422, "validation_error", "code")
    assert_error(api.get("/api/invites/ABC-12"), 422, "validation_error", "code")
    assert_error(api.get("/api/invites/ZZZZZZ"), 404, "not_found", "code")


# ── POST /api/invites/{code}/join ──


def test_join_family(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna, " Борис ")
    assert boris.family_id == anna.family_id
    family = anna.get("/api/family").json()
    names = [m["name"] for m in family["members"]]
    assert names == ["Анна", "Борис"]
    assert len({m["color"] for m in family["members"]}) == 2
    assert api.get(f"/api/invites/{anna.invite_code}").json()["membersCount"] == 2


def test_join_validation(api, new_client):
    anna = create_family(api)
    guest = new_client()
    assert_error(guest.post(f"/api/invites/{anna.invite_code}/join", json={"userName": " "}), 422, field="userName")
    assert_error(guest.post("/api/invites/ZZZZZZ/join", json={"userName": "Ева"}), 404, "not_found", "code")
    assert_error(guest.post("/api/invites/zz/join", json={"userName": "Ева"}), 422, field="code")


def test_join_idempotent(api, new_client):
    anna = create_family(api)
    guest = new_client()
    k = key()
    first = guest.post(f"/api/invites/{anna.invite_code}/join", json={"userName": "Ева"}, headers={"Idempotency-Key": k})
    second = guest.post(f"/api/invites/{anna.invite_code}/join", json={"userName": "Ева"}, headers={"Idempotency-Key": k})
    assert first.json()["currentUserId"] == second.json()["currentUserId"]
    assert len(anna.get("/api/family").json()["pendingMembers"]) == 1


def test_joiner_sees_nothing_until_adult_approves(api, new_client):
    anna = create_family(api)
    set_budget(anna, 10000, {})
    add_expense(anna, 500, title="Аренда")
    boris = join(new_client(), anna.invite_code)  # по коду, без подтверждения
    family = boris.get("/api/family").json()
    assert family["pending"] is True and [m["name"] for m in family["members"]] == ["Борис"]
    assert (family["inviteCode"], family["childInviteCode"], family["pendingMembers"]) == (None, None, [])
    state = boris.get("/api/state").json()
    assert (state["budgets"], state["expenses"], state["payments"], state["allowances"]) == ([], [], [], [])
    assert_error(boris.get("/api/expenses"), 403, "pending_approval")
    assert_error(boris.get(f"/api/months/{MONTH}/summary"), 403, "pending_approval")
    assert_error(boris.post("/api/expenses", {"title": "x", "amount": 1, "category": "food", "date": TODAY}),
                 403, "pending_approval")
    assert boris.get("/api/me").json()["status"] == "pending"

    # Взрослые видят заявку; в составе семьи ожидающего нет
    family = anna.get("/api/family").json()
    assert [m["name"] for m in family["members"]] == ["Анна"] and family["pending"] is False
    assert [m["id"] for m in family["pendingMembers"]] == [boris.id]
    note = anna.get("/api/notifications").json()[0]
    assert (note["kind"], note["data"]["memberId"]) == ("member_join_request", boris.id)
    assert api.get(f"/api/invites/{anna.invite_code}").json()["membersCount"] == 1

    r = anna.post(f"/api/family/members/{boris.id}/approve")
    assert r.status_code == 200 and r.json()["pendingMembers"] == []
    assert [m["name"] for m in r.json()["members"]] == ["Анна", "Борис"]
    assert [e["title"] for e in boris.get("/api/expenses").json()] == ["Аренда"]
    assert boris.get("/api/family").json()["inviteCode"] == anna.invite_code
    assert boris.get("/api/me").json()["status"] == "active"
    assert boris.get("/api/notifications").json()[0]["kind"] == "member_approved"
    assert_error(anna.post(f"/api/family/members/{boris.id}/approve"), 404)  # уже подтверждён


def test_reject_or_cancel_join_request(api, new_client):
    anna = create_family(api)
    eve = join(new_client(), anna.invite_code, "Ева")
    assert anna.delete(f"/api/family/members/{eve.id}").status_code == 204  # отказ
    assert_error(eve.get("/api/family"), 401)
    gleb = join(new_client(), anna.invite_code, "Глеб")
    assert gleb.post("/api/family/leave").status_code == 204  # передумал
    assert_error(gleb.get("/api/family"), 401)
    assert anna.get("/api/family").json()["pendingMembers"] == []


def test_only_active_adult_can_approve(api, new_client):
    anna = create_family(api)
    first = join(new_client(), anna.invite_code, "Ева")
    second = join(new_client(), anna.invite_code, "Глеб")
    assert_error(first.post(f"/api/family/members/{second.id}/approve"), 403, "pending_approval")
    child = add_child(anna, new_client())
    assert_error(child.post(f"/api/family/members/{second.id}/approve"), 403, "forbidden")
    other = create_family(new_client(), "Чужие", "Ира")
    assert_error(other.post(f"/api/family/members/{second.id}/approve"), 404)
    # Ожидающих нельзя «повысить» в обход подтверждения
    assert_error(anna.put(f"/api/family/members/{second.id}", {"role": "child"}), 404)


def test_pending_requests_count_toward_member_limit(api, new_client):
    anna = create_family(api)
    for i in range(9):
        join(new_client(), anna.invite_code, f"Гость {i}")
    r = new_client().post(f"/api/invites/{anna.invite_code}/join", json={"userName": "Лишний"})
    assert_error(r, 409, "conflict")


def test_family_member_limit(api, new_client):
    anna = create_family(api)
    for i in range(9):
        join(new_client(), anna, f"Участник {i}")
    r = new_client().post(f"/api/invites/{anna.invite_code}/join", json={"userName": "Лишний"})
    assert_error(r, 409, "conflict", message="В семье уже 10 участников")


# ── GET /api/family, GET /api/state ──


def test_get_family_and_state(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna)
    expense = add_expense(boris, 250, "kids")
    family = anna.get("/api/family").json()
    assert family["id"] == anna.family_id and len(family["members"]) == 2

    state = anna.get("/api/state").json()
    assert set(state) == {"family", "currentUserId", "budgets", "expenses", "payments", "allowances", "unreadNotifications"}
    assert state["currentUserId"] == anna.id
    assert state["budgets"] == [] and state["payments"] == []
    assert [e["id"] for e in state["expenses"]] == [expense["id"]]
    assert state["expenses"][0]["authorName"] == "Борис"


# ── POST /api/family/leave ──


def test_leave_family_keeps_records_and_closes_session(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna)
    add_expense(boris, 10, "transport", "Бензин")
    assert boris.post("/api/family/leave").status_code == 204
    assert_error(boris.get("/api/state"), 401, "unauthorized")

    state = anna.get("/api/state").json()
    assert [m["name"] for m in state["family"]["members"]] == ["Анна"]
    assert state["expenses"][0]["authorName"] == "Борис"


def test_last_member_leaving_deletes_family(api):
    anna = create_family(api)
    code = anna.invite_code
    assert anna.post("/api/family/leave").status_code == 204
    assert_error(api.get(f"/api/invites/{code}"), 404)


# ── POST /api/demo, POST /api/family/switch-user ──


def test_demo_family(api):
    demo = start_demo(api)
    family = demo.get("/api/family").json()
    assert family["isDemo"] is True and family["name"] == "Семья Смирновых"
    assert [(m["name"], m["role"]) for m in family["members"]] == [
        ("Алексей", "parent"), ("Мария", "parent"), ("Соня", "child")]

    state = demo.get("/api/state").json()
    assert (len(state["budgets"]), len(state["expenses"]), len(state["payments"])) == (2, 13, 7)
    assert [a["amount"] for a in state["allowances"]] == [1500]
    s = summary(demo)
    assert s["plan"] == 140000
    assert s["reserved"] == 6500 + 1800 + 7500 + 5200
    # 38000 + 399 + 8500 + 4200 + 3400 + 6850.4 + 2150 + 1270.5 + 3120 + 180 (мороженое Сони)
    assert s["spent"] == 68069.9
    requests = demo.get("/api/purchase-requests").json()
    assert [(r["title"], r["status"]) for r in requests] == [("Беспроводные наушники", "pending")]
    assert requests[0]["check"]["verdict"] in ("ok", "tight")


def test_each_visitor_gets_own_demo(api, new_client):
    a, b = start_demo(api), start_demo(new_client())
    assert a.family_id != b.family_id
    add_expense(a, 1)
    assert len(b.get("/api/expenses", params={"month": MONTH}).json()) == 10


def test_switch_demo_user(api):
    demo = start_demo(api)
    maria = next(m for m in demo.get("/api/family").json()["members"] if m["name"] == "Мария")
    r = demo.post("/api/family/switch-user", {"userId": maria["id"]})
    assert r.status_code == 200
    as_maria = r.json()
    assert as_maria["currentUserId"] == maria["id"]
    created = api.post("/api/expenses", headers=auth(as_maria["token"]),
                       json={"title": "Кофе", "amount": 200, "category": "food", "date": "2026-01-01"}).json()
    assert created["authorName"] == "Мария"


def test_switch_user_errors(api, new_client):
    demo = start_demo(api)
    assert_error(demo.post("/api/family/switch-user", {"userId": "nope"}), 404, "not_found")
    regular = create_family(new_client())
    alien = demo.get("/api/family").json()["members"][1]["id"]
    assert_error(regular.post("/api/family/switch-user", {"userId": alien}), 403, "forbidden")
    # Участник чужой демо-семьи
    other_demo = start_demo(new_client())
    assert_error(other_demo.post("/api/family/switch-user", {"userId": alien}), 404)
