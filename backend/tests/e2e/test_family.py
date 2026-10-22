"""Семья: создание, приглашение, вход, выход, демо, состояние."""
from .helpers import (
    MONTH,
    add_expense,
    assert_error,
    auth,
    create_family,
    join,
    key,
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
    assert family["members"] == [{"id": body["currentUserId"], "name": "Анна", "color": family["members"][0]["color"]}]
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
    assert r.json() == {"code": anna.invite_code, "familyName": "Сидоровы", "membersCount": 1}


def test_invite_preview_errors(api):
    assert_error(api.get("/api/invites/AB"), 422, "validation_error", "code")
    assert_error(api.get("/api/invites/ABC-12"), 422, "validation_error", "code")
    assert_error(api.get("/api/invites/ZZZZZZ"), 404, "not_found", "code")


# ── POST /api/invites/{code}/join ──


def test_join_family(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna.invite_code, " Борис ")
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
    assert len(anna.get("/api/family").json()["members"]) == 2


def test_family_member_limit(api, new_client):
    anna = create_family(api)
    for i in range(9):
        join(new_client(), anna.invite_code, f"Участник {i}")
    r = new_client().post(f"/api/invites/{anna.invite_code}/join", json={"userName": "Лишний"})
    assert_error(r, 409, "conflict", message="В семье уже 10 участников")


# ── GET /api/family, GET /api/state ──


def test_get_family_and_state(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna.invite_code)
    expense = add_expense(boris, 250, "kids")
    family = anna.get("/api/family").json()
    assert family["id"] == anna.family_id and len(family["members"]) == 2

    state = anna.get("/api/state").json()
    assert set(state) == {"family", "currentUserId", "budgets", "expenses", "payments"}
    assert state["currentUserId"] == anna.id
    assert state["budgets"] == [] and state["payments"] == []
    assert [e["id"] for e in state["expenses"]] == [expense["id"]]
    assert state["expenses"][0]["authorName"] == "Борис"


# ── POST /api/family/leave ──


def test_leave_family_keeps_records_and_closes_session(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna.invite_code)
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
    assert [m["name"] for m in family["members"]] == ["Алексей", "Мария"]

    state = demo.get("/api/state").json()
    assert (len(state["budgets"]), len(state["expenses"]), len(state["payments"])) == (2, 12, 7)
    s = summary(demo)
    assert s["plan"] == 140000
    assert s["reserved"] == 6500 + 1800 + 7500 + 5200
    assert s["spent"] == 67889.9  # 38000 + 399 + 8500 + 4200 + 3400 + 6850.4 + 2150 + 1270.5 + 3120


def test_each_visitor_gets_own_demo(api, new_client):
    a, b = start_demo(api), start_demo(new_client())
    assert a.family_id != b.family_id
    add_expense(a, 1)
    assert len(b.get("/api/expenses", params={"month": MONTH}).json()) == 9


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
