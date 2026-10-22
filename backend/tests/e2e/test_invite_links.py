"""Многоразовые ссылки-приглашения: вход сразу, без подтверждения взрослым (docs/FEATURES.md §1)."""
import pytest
from tests.conftest import run_sql

from .helpers import add_child, add_expense, assert_error, create_family, join
from .test_maintenance import ago, run_cleanup


def new_link(parent, role: str | None = None) -> dict:
    r = parent.post("/api/family/invite-links", None if role is None else {"role": role})
    assert r.status_code == 201, r.text
    return r.json()


def test_link_joins_without_approval_and_is_reusable(api, new_client):
    anna = create_family(api)
    add_expense(anna, 500, title="Аренда")
    link = new_link(anna)
    assert len(link["code"]) == 16 and link["role"] == "parent" and link["createdBy"] == anna.id
    preview = new_client().get(f"/api/invites/{link['code'].lower()}").json()  # регистр не важен
    assert (preview["role"], preview["needsApproval"], preview["familyName"]) == ("parent", False, "Ивановы")
    assert api.get(f"/api/invites/{anna.invite_code}").json()["needsApproval"] is True

    boris = join(new_client(), link["code"])  # без подтверждения
    family = boris.get("/api/family").json()
    assert family["pending"] is False and family["inviteCode"] == anna.invite_code
    assert [e["title"] for e in boris.get("/api/expenses").json()] == ["Аренда"]
    assert anna.get("/api/notifications").json()[0]["kind"] == "member_joined"
    assert anna.get("/api/family").json()["pendingMembers"] == []

    # Многоразовая: следующий тоже входит сразу, ссылка считает входы
    vera = join(new_client(), link["code"], "Вера")
    assert vera.get("/api/family").json()["pending"] is False
    [listed] = anna.get("/api/family/invite-links").json()
    assert (listed["id"], listed["uses"]) == (link["id"], 2) and listed["lastUsedAt"] is not None
    assert [m["name"] for m in anna.get("/api/family").json()["members"]] == ["Анна", "Борис", "Вера"]


def test_child_link(api, new_client):
    anna = create_family(api)
    sonya = join(new_client(), new_link(anna, "child")["code"], "Соня")
    family = sonya.get("/api/family").json()
    assert family["pending"] is False and family["inviteCode"] is None
    assert {m["name"]: m["role"] for m in family["members"]}["Соня"] == "child"
    assert_error(sonya.get("/api/budgets"), 403, "forbidden")


def test_list_and_revoke_links(api, new_client):
    anna = create_family(api)
    first, second = new_link(anna), new_link(anna, "child")
    listed = anna.get("/api/family/invite-links").json()
    assert [x["id"] for x in listed] == [second["id"], first["id"]]
    assert all(x["code"] is None and x["uses"] == 0 for x in listed)  # код показывается только при создании
    join(new_client(), first["code"])

    assert anna.delete(f"/api/family/invite-links/{first['id']}").status_code == 204  # отзыв после входов
    assert_error(new_client().get(f"/api/invites/{first['code']}"), 404)
    assert_error(new_client().post(f"/api/invites/{first['code']}/join", json={"userName": "Поздно"}), 404)
    assert_error(anna.delete(f"/api/family/invite-links/{first['id']}"), 404)
    other = create_family(new_client(), "Чужие", "Ева")
    assert_error(other.delete(f"/api/family/invite-links/{second['id']}"), 404)


def test_link_limits_and_validation(api, new_client):
    anna = create_family(api)
    assert_error(anna.post("/api/family/invite-links", {"role": "admin"}), 422, field="role")
    for _ in range(10):
        new_link(anna)
    assert_error(anna.post("/api/family/invite-links"), 409, "conflict")
    assert_error(new_client().get("/api/invites/ABCDEFGHJKLMNPQR"), 404)
    assert_error(new_client().get("/api/invites/ABCDEFGH"), 422, field="code")  # ни 6, ни 16 символов


@pytest.mark.parametrize("method,path", [
    ("POST", "/api/family/invite-links"),
    ("GET", "/api/family/invite-links"),
    ("DELETE", "/api/family/invite-links/x"),
])
def test_only_adults_manage_links(api, new_client, method, path):
    anna = create_family(api)
    child = add_child(anna, new_client())
    assert_error(child.client.request(method, path, headers=child.h), 403, "forbidden")
    pending = join(new_client(), anna.invite_code, "Гость")
    assert_error(pending.client.request(method, path, headers=pending.h), 403, "pending_approval")


def test_links_of_departed_adult_stop_working(api, new_client):
    anna = create_family(api)
    boris = join(new_client(), anna)
    by_boris = new_link(boris)
    by_anna = new_link(anna)
    assert anna.put(f"/api/family/members/{boris.id}", {"role": "child"}).status_code == 200
    assert_error(new_client().get(f"/api/invites/{by_boris['code']}"), 404)
    assert boris.post("/api/family/leave").status_code == 204
    assert new_client().get(f"/api/invites/{by_anna['code']}").status_code == 200


def test_expired_link(api, new_client, needs_db):
    anna = create_family(api)
    link = new_link(anna)
    run_sql(needs_db, "UPDATE invite_links SET expires_at = $1 WHERE id = $2", ago(1), link["id"])
    assert_error(new_client().post(f"/api/invites/{link['code']}/join", json={"userName": "Поздно"}), 404)
    assert anna.get("/api/family/invite-links").json() == []
    assert run_cleanup(needs_db)["invite_links"] >= 1
    assert run_sql(needs_db, "SELECT count(*) FROM invite_links WHERE id = $1", link["id"]) == 0


def test_parallel_joins_by_one_link_count_every_use(api, new_client):
    from concurrent.futures import ThreadPoolExecutor

    anna = create_family(api)
    code = new_link(anna)["code"]
    guests = [new_client() for _ in range(6)]
    with ThreadPoolExecutor(max_workers=len(guests)) as pool:
        responses = list(pool.map(
            lambda c: c.post(f"/api/invites/{code}/join", json={"userName": "Гость"}), guests
        ))
    assert all(r.status_code == 201 for r in responses), [r.text for r in responses]
    assert len(anna.get("/api/family").json()["members"]) == 7
    assert anna.get("/api/family/invite-links").json()[0]["uses"] == 6


def test_link_respects_member_limit(api, new_client):
    anna = create_family(api)
    code = new_link(anna)["code"]
    for i in range(9):
        join(new_client(), code, f"Гость {i}")
    assert_error(new_client().post(f"/api/invites/{code}/join", json={"userName": "Лишний"}), 409, "conflict")
