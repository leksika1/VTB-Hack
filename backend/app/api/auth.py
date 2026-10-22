"""Вход через ВТБ ID (OIDC) и встроенный тестовый провайдер (docs/FEATURES.md §11)."""
import html
from urllib.parse import urlencode

from fastapi import APIRouter, Query, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse

from .. import db as database
from ..config import get_settings
from ..deps import Authorization, CurrentMember, Db, resolve_member
from ..errors import NotFound, ValidationFailed
from ..oidc import MockProvider, get_provider
from ..ratelimit import SignupLimit
from ..schemas import OidcCallbackIn, OidcCallbackOut, OidcConfigOut, OidcStartIn, OidcStartOut
from ..services import auth

router = APIRouter(tags=["auth"])


@router.get("/auth/oidc/config", response_model=OidcConfigOut, summary="Доступен ли вход через банк")
async def oidc_config():
    s = get_settings()
    return OidcConfigOut(enabled=s.oidc_enabled, provider_name=s.oidc_provider_name)


@router.post("/auth/oidc/start", response_model=OidcStartOut, summary="Начать вход или привязку ВТБ ID")
async def oidc_start(body: OidcStartIn, _: SignupLimit, authorization: Authorization = None):
    member = None
    if authorization:
        async with database.session() as session:
            member = await resolve_member(session, authorization)
    return OidcStartOut(authorization_url=await auth.start(body.intent, body.redirect_uri, member))


@router.post("/auth/oidc/callback", response_model=OidcCallbackOut, summary="Завершить вход: код и state от банка")
async def oidc_callback(body: OidcCallbackIn, db: Db, _: SignupLimit):
    return await auth.callback(db, body.code, body.state)


@router.delete("/me/oidc", status_code=204, tags=["me"], summary="Отвязать ВТБ ID")
async def oidc_unlink(member: CurrentMember, db: Db):
    await auth.unlink(db, member)
    return Response(status_code=204)


# ── Встроенный тестовый провайдер (только OIDC_MOCK=true) ──


def _mock() -> MockProvider:
    provider = get_provider()
    if not get_settings().oidc_mock or not isinstance(provider, MockProvider):
        raise NotFound("Не найдено")
    return provider


_PAGE = """<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Тестовый вход через банк</title>
<body style="font-family:sans-serif;max-width:360px;margin:48px auto;padding:0 16px">
<h1 style="font-size:20px">Тестовый вход через ВТБ ID</h1>
<p>Демо-провайдер: настоящий банк здесь не участвует.</p>
<form method="get">{hidden}
<label>Войти как <input name="login" required maxlength="40" autofocus></label>
<p><button type="submit">Войти</button></p></form></body></html>"""


@router.get("/mock-idp/authorize", include_in_schema=False)
async def mock_authorize(
    request: Request,
    client_id: str = Query(max_length=200), redirect_uri: str = Query(max_length=500),
    state: str = Query(max_length=100), nonce: str = Query(max_length=100),
    code_challenge: str = Query(max_length=100), code_challenge_method: str = Query(max_length=10),
    response_type: str = Query(max_length=10), scope: str = Query("openid", max_length=100),
    login: str | None = Query(None, max_length=40),
):
    provider = _mock()
    s = get_settings()
    if client_id != s.oidc_client_id or redirect_uri not in s.oidc_redirect_uri_list \
            or code_challenge_method != "S256" or response_type != "code":
        raise ValidationFailed("Неверный запрос авторизации")
    if not login:
        hidden = "".join(
            f'<input type="hidden" name="{html.escape(k)}" value="{html.escape(v)}">'
            for k, v in request.query_params.items() if k != "login"
        )
        return HTMLResponse(_PAGE.format(hidden=hidden), headers={
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'"})
    code = await provider.issue_code(login.strip(), client_id, redirect_uri, nonce, code_challenge)
    return RedirectResponse(f"{redirect_uri}?{urlencode({'code': code, 'state': state})}", status_code=302)


@router.get("/mock-idp/.well-known/openid-configuration", include_in_schema=False)
async def mock_discovery():
    provider = _mock()
    return {"issuer": provider.issuer, "authorization_endpoint": f"{provider.issuer}/authorize",
            "jwks_uri": f"{provider.issuer}/jwks", "response_types_supported": ["code"],
            "id_token_signing_alg_values_supported": ["RS256"]}


@router.get("/mock-idp/jwks", include_in_schema=False)
async def mock_jwks():
    return await _mock().jwks()
