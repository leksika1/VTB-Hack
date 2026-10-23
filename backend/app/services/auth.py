"""Вход и привязка через ВТБ ID (docs/FEATURES.md §11). Одноразовые state и linkToken — в Redis."""
import json
import secrets
from urllib.parse import urlencode

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..errors import Conflict, DemoOnly, NotFound, ValidationFailed
from ..infra import get_redis
from ..models import Member
from ..oidc import OidcError, get_provider, pkce_challenge, validate_id_token
from ..schemas import OidcCallbackOut
from . import families

STATE_TTL = 600
LINK_TTL = 600


def _require_enabled() -> None:
    if not get_settings().oidc_enabled:
        raise NotFound("Вход через банк не настроен")


async def start(intent: str, redirect_uri: str, member: Member | None) -> str:
    _require_enabled()
    settings = get_settings()
    if intent not in ("login", "link"):
        raise ValidationFailed("intent: login или link", "intent")
    if intent == "link" and member is None:
        raise ValidationFailed("Чтобы привязать ВТБ ID, войдите в приложение", "intent")
    if intent == "link" and member.family.is_demo:
        # Иначе настоящий ВТБ ID оказался бы у участника копии, которую скоро удалят
        raise DemoOnly("ВТБ ID нельзя привязать к демо-семье. Выйдите из демо и привяжите его в своей семье.")
    # Только заранее разрешённые адреса возврата: иначе код авторизации можно увести на чужой сайт
    if redirect_uri not in settings.oidc_redirect_uri_list:
        raise ValidationFailed("Недопустимый адрес возврата", "redirectUri")
    state, nonce, verifier = (secrets.token_urlsafe(32) for _ in range(3))
    await get_redis().set(f"oidc:state:{state}", json.dumps({
        "nonce": nonce, "verifier": verifier, "intent": intent, "redirectUri": redirect_uri,
        "memberId": member.id if member else None,
    }), ex=STATE_TTL)
    query = urlencode({
        "response_type": "code", "client_id": settings.oidc_client_id, "redirect_uri": redirect_uri,
        "scope": settings.oidc_scopes, "state": state, "nonce": nonce,
        "code_challenge": pkce_challenge(verifier), "code_challenge_method": "S256",
    })
    return f"{await get_provider().authorization_endpoint()}?{query}"


async def callback(db: AsyncSession, code: str, state: str) -> OidcCallbackOut:
    _require_enabled()
    raw = await get_redis().getdel(f"oidc:state:{state}")  # одноразовый: повтор callback не сработает
    if raw is None:
        raise ValidationFailed("Ссылка входа устарела. Начните вход заново.", "state")
    flow = json.loads(raw)
    provider = get_provider()
    id_token = await provider.exchange(code, flow["redirectUri"], flow["verifier"])
    sub = await validate_id_token(id_token, provider, flow["nonce"])
    linked = await db.scalar(select(Member).where(Member.oidc_sub == sub))

    if flow["intent"] == "link":
        member = await db.get(Member, flow["memberId"])
        if member is None or not member.active or member.family.is_demo:
            raise OidcError()
        if linked and linked.id != member.id:
            raise Conflict("Этот ВТБ ID уже привязан к другому участнику")
        member.oidc_sub = sub
        await db.commit()
        return OidcCallbackOut(status="linked")

    if linked and linked.present:  # ожидающий подтверждения получит сессию без данных семьи
        return OidcCallbackOut(status="session", session=await families.issue_session(db, linked.id))
    if linked:  # участник вышел из семьи — учётную запись можно привязать заново
        linked.oidc_sub = None
        await db.commit()
    token = secrets.token_urlsafe(32)
    await get_redis().set(f"oidc:link:{token}", sub, ex=LINK_TTL)
    return OidcCallbackOut(status="unlinked", link_token=token)


async def consume_link_token(db: AsyncSession, token: str | None) -> str | None:
    """sub из одноразового linkToken (для создания семьи / входа по приглашению)."""
    if not token:
        return None
    sub = await get_redis().getdel(f"oidc:link:{token}")
    if sub is None:
        raise ValidationFailed("Привязка ВТБ ID устарела. Войдите через банк заново.", "oidcLinkToken")
    if await db.scalar(select(Member.id).where(Member.oidc_sub == sub)):
        raise Conflict("Этот ВТБ ID уже привязан к другому участнику")
    return sub


async def unlink(db: AsyncSession, member: Member) -> None:
    member.oidc_sub = None
    await db.commit()

