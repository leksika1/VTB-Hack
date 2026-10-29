"""Вход через ВТБ ID (OIDC) и встроенный тестовый провайдер (docs/FEATURES.md §11)."""
import html
from pathlib import Path
from string import Template
from urllib.parse import urlencode, urlsplit

from fastapi import APIRouter, Query, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse

from .. import db as database
from ..config import get_settings
from ..deps import Authorization, CurrentMember, Db, resolve_member
from ..errors import NotFound, ValidationFailed
from ..oidc import MockProvider, get_provider
from ..ratelimit import SignupLimit
from ..schemas import OidcCallbackIn, OidcCallbackOut, OidcConfigOut, OidcStartIn, OidcStartOut
from ..security import MEMBER_COLORS
from ..seed import SHOWCASE_LOGINS
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


_PAGE = Template((Path(__file__).parent.parent / "templates" / "mock_idp.html").read_text(encoding="utf-8"))
_MARK = (
    '<svg width="27" height="27" viewBox="0 0 22 22" fill="none" aria-hidden="true">'
    '<circle cx="8" cy="7" r="3" fill="#fff"/><circle cx="15" cy="8.2" r="2.4" fill="#7ea6ff"/>'
    '<path d="M2.8 18c0-3.2 2.3-5.4 5.2-5.4s5.2 2.2 5.2 5.4" stroke="#fff" stroke-width="2.1" stroke-linecap="round"/>'
    '<path d="M12.3 14c.8-.8 1.7-1.2 2.7-1.2 2.4 0 4.2 1.9 4.2 4.9" stroke="#7ea6ff" stroke-width="1.9" stroke-linecap="round"/>'
    "</svg>"
)
_CHILD_LOGINS = {"sonya"}  # остальные участники витрины — взрослые
_CHEVRON = (
    '<svg class="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>'
)


_ERROR_ICON = (
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>'
)


def _render_page(request: Request, redirect_uri: str, state: str, login_error: str | None = None) -> str:
    hidden = "".join(
        f'<input type="hidden" name="{html.escape(k)}" value="{html.escape(v)}">'
        for k, v in request.query_params.items() if k != "login"
    )
    # Каждый участник витрины — своя форма: кнопка с login не спорит с полем «Логин» основной формы.
    # Цвета — как у этих участников в витрине (services/demo.py)
    accounts = "".join(
        f'<form method="get">{hidden}<button class="account" type="submit" name="login" value="{html.escape(login)}">'
        f'<span class="avatar" style="background:{MEMBER_COLORS[i % len(MEMBER_COLORS)]}" aria-hidden="true">'
        f'{html.escape(name[0])}</span>'
        f'<span class="who"><strong>{html.escape(name)}</strong>'
        f'<span>{"ребёнок" if login in _CHILD_LOGINS else "взрослый"}</span></span>'
        f'{_CHEVRON}</button></form>'
        for i, (name, login) in enumerate(SHOWCASE_LOGINS.items())
    )
    # Отмена — как у настоящего провайдера: error=access_denied; фронтенд сразу вернёт туда, откуда ушли
    cancel_url = f"{redirect_uri}?{urlencode({'error': 'access_denied', 'state': state})}"
    # Тема — выбранная в приложении (cookie ставит frontend/src/utils/theme.ts); без неё светлая, как в приложении
    theme = "dark" if request.cookies.get("fb-theme") == "dark" else "light"
    return _PAGE.substitute(
        theme=theme, provider=html.escape(get_settings().oidc_provider_name), mark=_MARK,
        accounts=accounts, hidden=hidden, cancel_url=html.escape(cancel_url),
        login_value=html.escape(request.query_params.get("login", "")),
        login_invalid=' aria-invalid="true" autofocus' if login_error else "",
        login_error=f'<p class="error" role="alert">{_ERROR_ICON}<span>{html.escape(login_error)}</span></p>'
        if login_error else "",
    )


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
    login = (login or "").strip()
    if not login:
        # Пустая отправка формы — та же страница с подсказкой (проверку браузера выключает novalidate)
        error = "Введите логин — любое слово, например ivan" if "login" in request.query_params else None
        # form-action проверяется и на редиректе после отправки: без адреса фронтенда браузер
        # блокирует вход, когда фронтенд и API на разных origin (redirect_uri уже сверен со списком)
        target = urlsplit(redirect_uri)
        return HTMLResponse(_render_page(request, redirect_uri, state, error), headers={
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; "
                                       f"form-action 'self' {target.scheme}://{target.netloc}"})
    code = await provider.issue_code(login, client_id, redirect_uri, nonce, code_challenge)
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
