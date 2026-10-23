"""Демо-семья по кнопке — песочница: не затрагивает настоящие аккаунты (docs/FEATURES.md, «Демо-семья»)."""
from .helpers import add_expense, assert_error, auth, create_family, start_demo
from .test_oidc import REDIRECT, bank_login, callback


def login(client, name):
    code, state = bank_login(client, login=name)
    return callback(client, code, state).json()


def test_leaving_demo_only_ends_the_demo(api, new_client):
    """Выход из демо закрывает сессии копии, а не «выходит из семьи»: настоящий аккаунт с ВТБ ID на месте."""
    vtb = new_client()
    link = login(vtb, "demo-isolation-owner")["linkToken"]
    real = vtb.post("/api/families", json={"familyName": "Настоящие", "userName": "Ира", "oidcLinkToken": link}).json()
    real_h = auth(real["token"])

    demo = start_demo(vtb)  # тот же браузер нажал «Посмотреть на примере»
    maria = next(m for m in demo.get("/api/family").json()["members"] if m["name"] == "Мария")
    as_maria = demo.post("/api/family/switch-user", {"userId": maria["id"]}).json()
    add_expense(demo, 100, title="В песочнице")

    assert demo.post("/api/family/leave").status_code == 204
    assert_error(demo.get("/api/state"), 401)  # все сессии копии закрыты,
    assert_error(api.get("/api/state", headers=auth(as_maria["token"])), 401)  # включая переключённых

    # Настоящая семья и привязка ВТБ ID не тронуты
    state = api.get("/api/state", headers=real_h).json()
    assert state["family"]["name"] == "Настоящие" and state["expenses"] == []
    again = login(new_client(), "demo-isolation-owner")
    assert again["status"] == "session" and again["session"]["family"]["id"] == real["family"]["id"]


def test_vtb_id_and_email_cannot_be_attached_to_demo(api, new_client):
    demo = start_demo(new_client())
    r = demo.post("/api/auth/oidc/start", {"intent": "link", "redirectUri": REDIRECT})
    assert_error(r, 403, "demo_restricted")
    assert_error(demo.put("/api/me/email", {"email": "real@example.ru"}), 403, "demo_restricted")
    # Вход через банк из демо-браузера по-прежнему ведёт в свой аккаунт, а не в копию
    assert login(new_client(), "demo-isolation-stranger")["status"] == "unlinked"


def test_nobody_can_join_a_demo_copy(api, new_client):
    demo = start_demo(new_client())
    family = demo.get("/api/family").json()
    for code in (family["inviteCode"], family["childInviteCode"]):
        assert_error(new_client().get(f"/api/invites/{code}"), 404, field="code")
        assert_error(new_client().post(f"/api/invites/{code}/join", json={"userName": "Чужой"}), 404, field="code")
    assert_error(demo.post("/api/family/invite-links", {"role": "parent"}), 403, "demo_restricted")
    assert len(demo.get("/api/family").json()["members"]) == 3


def test_real_family_leave_still_works(api, new_client):
    anna = create_family(api)
    assert anna.post("/api/family/leave").status_code == 204
    assert_error(anna.get("/api/state"), 401)
