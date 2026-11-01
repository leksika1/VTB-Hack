"""Вход через ВТБ ID на встроенном тестовом провайдере (docs/FEATURES.md §11)."""
from urllib.parse import parse_qs, urlparse

from .helpers import assert_error, auth, create_family

REDIRECT = "http://localhost:5173/auth/callback"


def bank_login(client, intent="login", login="ivan", headers=None):
    """Пройти путь браузера: start → страница банка → «войти как» → redirect с code и state."""
    r = client.post("/api/auth/oidc/start", json={"intent": intent, "redirectUri": REDIRECT}, headers=headers or {})
    assert r.status_code == 200, r.text
    url = urlparse(r.json()["authorizationUrl"])
    params = {k: v[0] for k, v in parse_qs(url.query).items()}
    assert params["code_challenge_method"] == "S256" and params["redirect_uri"] == REDIRECT
    page = client.get(url.path, params=params)
    assert page.status_code == 200 and 'name="login"' in page.text
    redirect = client.get(url.path, params={**params, "login": login}, follow_redirects=False)
    assert redirect.status_code == 302
    back = urlparse(redirect.headers["location"])
    assert f"{back.scheme}://{back.netloc}{back.path}" == REDIRECT
    returned = {k: v[0] for k, v in parse_qs(back.query).items()}
    assert returned["state"] == params["state"]
    return returned["code"], returned["state"]


def callback(client, code, state):
    return client.post("/api/auth/oidc/callback", json={"code": code, "state": state})


def test_config(api):
    assert api.get("/api/auth/oidc/config").json() == {"enabled": True, "providerName": "ВТБ ID"}


def test_first_login_creates_family_then_logs_in(api, new_client):
    code, state = bank_login(api, login="ivan-first")
    r = callback(api, code, state).json()
    assert r["status"] == "unlinked" and r["linkToken"] and r["session"] is None

    created = api.post("/api/families", json={"familyName": "Ивановы", "userName": "Иван",
                                              "oidcLinkToken": r["linkToken"]})
    assert created.status_code == 201
    member_id = created.json()["currentUserId"]
    assert api.get("/api/me", headers=auth(created.json()["token"])).json()["vtbLinked"] is True

    # Тот же банковский логин с другого устройства — сразу сессия этого участника
    other = new_client()
    code, state = bank_login(other, login="ivan-first")
    again = callback(other, code, state).json()
    assert again["status"] == "session" and again["session"]["currentUserId"] == member_id
    assert other.get("/api/family", headers=auth(again["session"]["token"])).status_code == 200


def test_link_existing_member_and_unlink(api, new_client):
    anna = create_family(api)
    code, state = bank_login(api, intent="link", login="anna-bank", headers=anna.h)
    assert callback(api, code, state).json()["status"] == "linked"
    assert anna.get("/api/me").json()["vtbLinked"] is True
    code, state = bank_login(new_client(), login="anna-bank")
    assert callback(api, code, state).json()["session"]["currentUserId"] == anna.id
    assert anna.delete("/api/me/oidc").status_code == 204
    code, state = bank_login(api, login="anna-bank")
    assert callback(api, code, state).json()["status"] == "unlinked"


def test_one_bank_account_one_member(api, new_client):
    anna = create_family(api)
    boris = create_family(new_client(), "Другие", "Борис")
    code, state = bank_login(api, intent="link", login="shared", headers=anna.h)
    callback(api, code, state)
    code, state = bank_login(api, intent="link", login="shared", headers=boris.h)
    assert_error(callback(api, code, state), 409)


def test_state_and_code_are_single_use(api):
    code, state = bank_login(api, login="replay")
    assert callback(api, code, state).status_code == 200
    assert_error(callback(api, code, state), 422, field="state")
    # Код с чужим state не принимается
    code2, _ = bank_login(api, login="replay")
    _, state3 = bank_login(api, login="replay")
    assert_error(callback(api, code2, state3), 422)


def test_link_token_is_single_use(api):
    code, state = bank_login(api, login="token-once")
    token = callback(api, code, state).json()["linkToken"]
    assert api.post("/api/families", json={"familyName": "А", "userName": "Б", "oidcLinkToken": token}).status_code == 201
    r = api.post("/api/families", json={"familyName": "А", "userName": "Б", "oidcLinkToken": token})
    assert_error(r, 422, field="oidcLinkToken")


def test_start_validation(api):
    assert_error(api.post("/api/auth/oidc/start", json={"intent": "login", "redirectUri": "https://evil.example/cb"}),
                 422, field="redirectUri")
    assert_error(api.post("/api/auth/oidc/start", json={"intent": "hack", "redirectUri": REDIRECT}), 422, field="intent")
    assert_error(api.post("/api/auth/oidc/start", json={"intent": "link", "redirectUri": REDIRECT}), 422, field="intent")


def test_mock_authorize_rejects_foreign_redirect_and_escapes_input(api):
    r = api.post("/api/auth/oidc/start", json={"intent": "login", "redirectUri": REDIRECT}).json()
    url = urlparse(r["authorizationUrl"])
    params = {k: v[0] for k, v in parse_qs(url.query).items()}
    assert_error(api.get(url.path, params={**params, "redirect_uri": "https://evil.example/cb"}), 422)
    page = api.get(url.path, params={**params, "state": '"><script>alert(1)</script>'})
    assert "<script>alert(1)" not in page.text and "&lt;script&gt;" in page.text
    csp = page.headers["content-security-policy"]
    # После отправки формы браузер уходит на фронтенд — его origin тоже должен быть разрешён
    assert "default-src 'none'" in csp and "form-action 'self' http://localhost:5173" in csp
    # «Отменить» возвращает на фронтенд как отказ пользователя, с тем же state
    assert "error=access_denied&amp;state=" in page.text
    # Тема страницы — выбранная в приложении (cookie fb-theme), по умолчанию светлая
    assert 'data-theme="light"' in page.text
    dark = api.get(url.path, params=params, cookies={"fb-theme": "dark"})
    assert 'data-theme="dark"' in dark.text


def test_mock_authorize_empty_login_shows_russian_error(api):
    r = api.post("/api/auth/oidc/start", json={"intent": "login", "redirectUri": REDIRECT}).json()
    url = urlparse(r["authorizationUrl"])
    params = {k: v[0] for k, v in parse_qs(url.query).items()}
    # Форма без проверки браузера: пустой и пробельный логин — снова страница с ошибкой, а не вход
    for blank in ("", "   "):
        page = api.get(url.path, params={**params, "login": blank}, follow_redirects=False)
        assert page.status_code == 200 and "Введите логин" in page.text and 'aria-invalid="true"' in page.text
    assert "Введите логин" not in api.get(url.path, params=params).text
