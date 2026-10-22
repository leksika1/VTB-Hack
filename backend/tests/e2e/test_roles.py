"""Роли в семье: детский код, права ребёнка, смена роли, исключение (docs/FEATURES.md §1)."""
import pytest

from .helpers import MONTH, TODAY, add_child, add_expense, approve, assert_error, create_family, join, set_budget

PARENT_ONLY = "Это доступно только взрослым участникам семьи"


def test_child_joins_by_permanent_child_code(api, new_client):
    anna = create_family(api)
    code = anna.get("/api/family").json()["childInviteCode"]
    assert len(code) == 6 and code != anna.invite_code
    r = anna.post("/api/family/child-invites")
    assert r.status_code == 200 and r.json() == {"code": code, "expiresAt": None}  # тот же постоянный код
    assert new_client().get(f"/api/invites/{code}").json()["role"] == "child"

    sonya = approve(anna, join(new_client(), code, "Соня"))
    approve(anna, join(new_client(), code, "Петя"))  # код многоразовый, как код семьи
    members = {m["name"]: m["role"] for m in anna.get("/api/family").json()["members"]}
    assert members == {"Анна": "parent", "Соня": "child", "Петя": "child"}
    assert sonya.get("/api/state").status_code == 200


def test_rotate_child_code(api, new_client):
    anna = create_family(api)
    child = add_child(anna, new_client())
    old = anna.get("/api/family").json()["childInviteCode"]
    r = anna.post("/api/family/child-invite-code")
    assert r.status_code == 200
    new = r.json()["childInviteCode"]
    assert new != old and len(new) == 6 and r.json()["inviteCode"] == anna.invite_code
    assert_error(new_client().get(f"/api/invites/{old}"), 404)
    assert new_client().get(f"/api/invites/{new}").json()["role"] == "child"
    assert child.get("/api/state").status_code == 200  # дети в семье остаются


def test_family_code_still_makes_parent(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna)
    assert next(m for m in anna.get("/api/family").json()["members"] if m["id"] == boris.id)["role"] == "parent"


def test_child_cannot_invite(api, new_client):
    anna = create_family(api)
    child = add_child(anna, new_client())
    assert_error(child.post("/api/family/child-invites"), 403, "forbidden", message=PARENT_ONLY)
    assert child.get("/api/family").json()["childInviteCode"] is None


@pytest.mark.parametrize("method,path,body", [
    ("GET", "/api/budgets", None),
    ("PUT", f"/api/budgets/{MONTH}", {"totalAmount": 1, "categoryPlans": {}}),
    ("GET", "/api/payments", None),
    ("POST", "/api/payments", {"title": "x", "amount": 1, "category": "food", "dueDate": TODAY}),
    ("POST", "/api/payments/copy-previous-month", {"monthKey": MONTH}),
    ("GET", f"/api/months/{MONTH}/summary", None),
    ("POST", f"/api/months/{MONTH}/purchase-check", {"amount": 1}),
    ("POST", "/api/family/invite-code", None),
    ("POST", "/api/family/child-invite-code", None),
    ("POST", "/api/family/members/x/approve", None),
    ("PUT", "/api/family/members/x", {"role": "parent"}),
    ("DELETE", "/api/family/members/x", None),
    ("PUT", "/api/family/members/x/allowance", {"amount": 1, "period": "week"}),
])
def test_child_cannot_manage_family_money(api, new_client, method, path, body):
    anna = create_family(api)
    child = add_child(anna, new_client())
    r = child.client.request(method, path, headers=child.h, json=body)
    assert_error(r, 403, "forbidden", message=PARENT_ONLY)


def test_child_sees_only_own_data(api, new_client):
    anna = create_family(api)
    set_budget(anna, 10000, {})
    add_expense(anna, 500, title="Секрет взрослых")
    anna.post("/api/payments", {"title": "Аренда", "amount": 100, "category": "housing", "dueDate": TODAY})
    child = add_child(anna, new_client())
    state = child.get("/api/state").json()
    assert (state["budgets"], state["payments"], state["expenses"]) == ([], [], [])
    assert len(state["family"]["members"]) == 2  # состав семьи виден
    assert child.get("/api/expenses").json() == []


def test_change_role(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna)
    r = anna.put(f"/api/family/members/{boris.id}", {"role": "child"})
    assert r.status_code == 200
    assert {m["id"]: m["role"] for m in r.json()["members"]}[boris.id] == "child"
    assert_error(boris.get("/api/budgets"), 403)  # права меняются сразу, без перевхода
    anna.put(f"/api/family/members/{boris.id}", {"role": "parent"})
    assert boris.get("/api/budgets").status_code == 200
    assert_error(anna.put(f"/api/family/members/{boris.id}", {"role": "admin"}), 422, field="role")
    assert_error(anna.put("/api/family/members/nope", {"role": "child"}), 404)


def test_last_parent_is_protected(api, new_client):
    anna = create_family(api)
    child = add_child(anna, new_client())
    assert_error(anna.put(f"/api/family/members/{anna.id}", {"role": "child"}), 409, "conflict")
    assert_error(anna.post("/api/family/leave"), 409, "conflict")
    # Когда есть второй взрослый — можно
    boris = join(new_client(), anna)
    assert anna.put(f"/api/family/members/{anna.id}", {"role": "child"}).status_code == 200
    assert boris.get("/api/family").status_code == 200 and child.get("/api/family").status_code == 200


def test_remove_member(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna)
    add_expense(boris, 100, title="Бензин")
    assert_error(anna.delete(f"/api/family/members/{anna.id}"), 422)  # себя — только через «выйти»
    assert anna.delete(f"/api/family/members/{boris.id}").status_code == 204
    assert_error(boris.get("/api/state"), 401)  # сессии закрыты
    state = anna.get("/api/state").json()
    assert [m["name"] for m in state["family"]["members"]] == ["Анна"]
    assert state["expenses"][0]["authorName"] == "Борис"  # записи остались
    assert_error(anna.delete(f"/api/family/members/{boris.id}"), 404)


def test_cannot_manage_members_of_other_family(api, new_client):
    anna = create_family(api)
    eve = create_family(new_client(), "Чужие", "Ева")
    assert_error(anna.delete(f"/api/family/members/{eve.id}"), 404)
    assert_error(anna.put(f"/api/family/members/{eve.id}", {"role": "child"}), 404)


def test_child_does_not_get_family_invite_code(api, new_client):
    """Код семьи даёт вход взрослого: ребёнок не должен его видеть, иначе войдёт заново взрослым."""
    anna = create_family(api)
    r = anna.post("/api/family/child-invites")
    joined = new_client().post(f"/api/invites/{r.json()['code']}/join", json={"userName": "Соня"}).json()
    assert joined["family"]["inviteCode"] is None
    assert anna.post(f"/api/family/members/{joined['currentUserId']}/approve").status_code == 200
    child_headers = {"Authorization": f"Bearer {joined['token']}"}
    assert api.get("/api/family", headers=child_headers).json()["inviteCode"] is None
    assert api.get("/api/state", headers=child_headers).json()["family"]["inviteCode"] is None
    assert anna.get("/api/family").json()["inviteCode"] == anna.invite_code
