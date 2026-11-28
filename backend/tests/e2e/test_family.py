"""Семья v2: единая роль, владелец, подтверждение и выход."""
from .helpers import add_expense, assert_error, auth, create_family, join, key, set_budget


def test_create_family_owner_and_login_id(api):
    response = api.post("/api/families", json={"familyName": "  Ивановы ", "userName": " Анна "})
    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"token", "currentUserId", "family", "loginId"}
    assert len(body["loginId"]) == 11 and body["loginId"][5] == "-"
    family = body["family"]
    assert family["name"] == "Ивановы" and family["ownerId"] == body["currentUserId"]
    assert family["isOwner"] is True and family["members"][0]["role"] == "member"
    assert family["members"][0]["isOwner"] is True
    me = api.get("/api/me", headers=auth(body["token"])).json()
    assert me["loginId"] == body["loginId"] and me["isOwner"] is True


def test_create_family_validation_and_idempotency(api):
    for body, field in [
        ({"familyName": " ", "userName": "Анна"}, "familyName"),
        ({"familyName": "Ивановы", "userName": ""}, "userName"),
        ({"familyName": "Я" * 81, "userName": "Анна"}, "familyName"),
    ]:
        assert_error(api.post("/api/families", json=body), 422, "validation_error", field)
    idem = key()
    body = {"familyName": "Петровы", "userName": "Пётр"}
    first = api.post("/api/families", json=body, headers={"Idempotency-Key": idem}).json()
    second = api.post("/api/families", json=body, headers={"Idempotency-Key": idem}).json()
    assert first["family"]["id"] == second["family"]["id"]
    assert first["currentUserId"] == second["currentUserId"] and first["token"] != second["token"]
    assert_error(api.post("/api/families", json={**body, "userName": "Павел"},
                          headers={"Idempotency-Key": idem}), 409, "conflict")


def test_code_join_is_pending_and_only_owner_decides(api, new_client):
    owner = create_family(api, "Сидоровы", "Саша")
    ordinary = join(new_client(), owner, "Саша")  # одинаковые имена допустимы
    set_budget(owner, 10_000, {})
    add_expense(owner, 500, title="Аренда")
    pending = join(new_client(), owner.invite_code, "Саша")
    preview = new_client().get(f"/api/invites/{owner.invite_code.lower()}").json()
    assert preview == {"code": owner.invite_code, "familyName": "Сидоровы", "membersCount": 2,
                       "role": "member", "needsApproval": True}
    limited = pending.get("/api/state").json()
    assert limited["family"]["pending"] is True
    assert limited["budgets"] == limited["expenses"] == limited["payments"] == []
    assert_error(pending.get("/api/expenses"), 403, "pending_approval")
    assert_error(ordinary.post(f"/api/family/members/{pending.id}/approve"), 403, "forbidden")
    approved = owner.post(f"/api/family/members/{pending.id}/approve")
    assert approved.status_code == 200
    assert all(row["role"] == "member" for row in approved.json()["members"])
    assert [row["title"] for row in pending.get("/api/expenses").json()] == ["Аренда"]
    assert pending.get("/api/notifications").json()[0]["kind"] == "member_approved"


def test_owner_rejects_and_removes_but_cannot_leave(api, new_client):
    owner = create_family(api)
    pending = join(new_client(), owner.invite_code, "Ева")
    assert owner.post(f"/api/family/members/{pending.id}/reject").status_code == 204
    assert pending.get("/api/family").json()["pending"] is True  # совместимый флаг изолированного режима
    assert pending.get("/api/me").json()["status"] == "rejected"
    assert pending.get("/api/notifications").json()[0]["kind"] == "member_rejected"
    assert pending.post("/api/family/leave").status_code == 204
    assert_error(pending.get("/api/family"), 401, "unauthorized")
    member = join(new_client(), owner, "Борис")
    assert owner.delete(f"/api/family/members/{member.id}").status_code == 204
    assert_error(member.get("/api/family"), 401, "unauthorized")
    assert_error(owner.post("/api/family/leave"), 409, "conflict")


def test_owner_can_transfer_ownership_then_leave(api, new_client):
    owner = create_family(api)
    successor = join(new_client(), owner, "Борис")
    transferred = owner.post(f"/api/family/members/{successor.id}/make-owner")
    assert transferred.status_code == 200 and transferred.json()["ownerId"] == successor.id
    assert successor.get("/api/family").json()["isOwner"] is True
    assert owner.post("/api/family/leave").status_code == 204


def test_member_leaves_and_records_keep_author(api, new_client):
    owner = create_family(api)
    member = join(new_client(), owner, "Борис")
    add_expense(member, 10, "transport", "Бензин")
    assert member.post("/api/family/leave").status_code == 204
    assert_error(member.get("/api/state"), 401, "unauthorized")
    state = owner.get("/api/state").json()
    assert [row["name"] for row in state["family"]["members"]] == ["Анна"]
    assert state["expenses"][0]["authorName"] == "Борис"


def test_member_limit_counts_pending(api, new_client):
    owner = create_family(api)
    for index in range(9):
        join(new_client(), owner.invite_code, f"Гость {index}")
    assert_error(new_client().post(f"/api/invites/{owner.invite_code}/join",
                                   json={"userName": "Лишний"}), 409, "conflict")
