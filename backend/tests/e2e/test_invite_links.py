"""Многоразовые ссылки v2: каждый вход ожидает решения владельца."""
from tests.conftest import run_sql

from .helpers import assert_error, create_family, join
from .test_maintenance import ago, run_cleanup


def new_link(member) -> dict:
    response = member.post("/api/family/invite-links")
    assert response.status_code == 201, response.text
    return response.json()


def test_link_is_reusable_but_every_join_is_pending(api, new_client):
    owner = create_family(api)
    link = new_link(owner)
    assert len(link["code"]) == 16 and link["role"] == "member"
    preview = new_client().get(f"/api/invites/{link['code'].lower()}").json()
    assert (preview["role"], preview["needsApproval"]) == ("member", True)
    first = join(new_client(), link["code"], "Борис")
    second = join(new_client(), link["code"], "Вера")
    assert first.get("/api/family").json()["pending"] is True
    assert second.get("/api/family").json()["pending"] is True
    listed = owner.get("/api/family/invite-links").json()[0]
    assert listed["code"] is None and listed["uses"] == 2 and listed["lastUsedAt"] is not None
    assert [row["name"] for row in owner.get("/api/family").json()["pendingMembers"]] == ["Борис", "Вера"]


def test_any_member_manages_links_and_pending_cannot(api, new_client):
    owner = create_family(api)
    member = join(new_client(), owner, "Борис")
    assert new_link(member)["createdBy"] == member.id
    pending = join(new_client(), owner.invite_code, "Гость")
    for method, path in (("POST", "/api/family/invite-links"), ("GET", "/api/family/invite-links")):
        assert_error(pending.client.request(method, path, headers=pending.h), 403, "pending_approval")


def test_list_revoke_limits_and_validation(api, new_client):
    owner = create_family(api)
    first, second = new_link(owner), new_link(owner)
    assert [row["id"] for row in owner.get("/api/family/invite-links").json()] == [second["id"], first["id"]]
    assert owner.delete(f"/api/family/invite-links/{first['id']}").status_code == 204
    assert_error(new_client().get(f"/api/invites/{first['code']}"), 404)
    assert_error(owner.post("/api/family/invite-links", {"role": "child"}), 422, field="role")
    for _ in range(9):
        new_link(owner)
    assert_error(owner.post("/api/family/invite-links"), 409, "conflict")


def test_link_of_departed_member_is_revoked(api, new_client):
    owner = create_family(api)
    member = join(new_client(), owner)
    code = new_link(member)["code"]
    assert member.post("/api/family/leave").status_code == 204
    assert_error(new_client().get(f"/api/invites/{code}"), 404)


def test_expired_link(api, new_client, needs_db):
    owner = create_family(api)
    link = new_link(owner)
    run_sql(needs_db, "UPDATE invite_links SET expires_at = $1 WHERE id = $2", ago(1), link["id"])
    assert_error(new_client().post(f"/api/invites/{link['code']}/join", json={"userName": "Поздно"}), 404)
    assert run_cleanup(needs_db)["invite_links"] >= 1
