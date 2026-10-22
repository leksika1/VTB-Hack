"""
OpenID Connect: вход через ВТБ ID (docs/FEATURES.md §11).

- HttpProvider — настоящий провайдер: discovery, обмен кода на токен (client_secret_post + PKCE), JWKS.
- MockProvider — встроенный тестовый провайдер для демо и тестов (OIDC_MOCK=true): страница «войти как…»,
  ключ RS256 общий для всех копий backend (хранится в Redis), код одноразовый и живёт 60 секунд.
- validate_id_token — одна проверка для обоих: подпись по JWKS, только RS256/ES256, iss, aud, exp, iat, nonce.
"""
import base64
import hashlib
import json
import secrets
import time
from functools import lru_cache

import httpx
import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from .config import get_settings
from .errors import ValidationFailed
from .infra import get_redis

ALLOWED_ALGS = ["RS256", "ES256"]
CACHE_SECONDS = 3600
LEEWAY_SECONDS = 60
MOCK_CODE_TTL = 60


class OidcError(ValidationFailed):
    def __init__(self, message: str = "Не удалось войти через банк. Попробуйте ещё раз."):
        super().__init__(message, "code")


def pkce_challenge(verifier: str) -> str:
    return base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()


class HttpProvider:
    def __init__(self, issuer: str, client_id: str, client_secret: str):
        self.issuer, self.client_id, self.client_secret = issuer.rstrip("/"), client_id, client_secret
        self._discovery: tuple[float, dict] | None = None
        self._jwks: tuple[float, dict] | None = None

    async def _get_json(self, url: str) -> dict:
        async with httpx.AsyncClient(timeout=5, follow_redirects=False) as client:
            r = await client.get(url)
            r.raise_for_status()
            return r.json()

    async def discovery(self) -> dict:
        if not self._discovery or self._discovery[0] < time.time():
            doc = await self._get_json(f"{self.issuer}/.well-known/openid-configuration")
            if doc.get("issuer", "").rstrip("/") != self.issuer:
                raise OidcError("Провайдер вернул чужой issuer")
            self._discovery = (time.time() + CACHE_SECONDS, doc)
        return self._discovery[1]

    async def jwks(self, refresh: bool = False) -> dict:
        if refresh or not self._jwks or self._jwks[0] < time.time():
            self._jwks = (time.time() + CACHE_SECONDS, await self._get_json((await self.discovery())["jwks_uri"]))
        return self._jwks[1]

    async def authorization_endpoint(self) -> str:
        return (await self.discovery())["authorization_endpoint"]

    async def exchange(self, code: str, redirect_uri: str, verifier: str) -> str:
        token_endpoint = (await self.discovery())["token_endpoint"]
        async with httpx.AsyncClient(timeout=5, follow_redirects=False) as client:
            r = await client.post(token_endpoint, data={
                "grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri,
                "client_id": self.client_id, "client_secret": self.client_secret, "code_verifier": verifier,
            })
        if r.status_code != 200 or "id_token" not in r.json():
            raise OidcError()
        return r.json()["id_token"]


class MockProvider:
    """Тестовый провайдер. В бою выключен (OIDC_MOCK=false)."""

    KEY = "mockidp:key"

    def __init__(self, issuer: str, client_id: str):
        self.issuer, self.client_id = issuer.rstrip("/"), client_id

    async def _private_key(self):
        redis = get_redis()
        pem = await redis.get(self.KEY)
        if pem is None:
            key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
            new_pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                        serialization.NoEncryption()).decode()
            await redis.set(self.KEY, new_pem, nx=True)  # первая копия backend задаёт ключ для всех
            pem = await redis.get(self.KEY)
        return serialization.load_pem_private_key(pem.encode(), password=None)

    async def jwks(self, refresh: bool = False) -> dict:
        public = (await self._private_key()).public_key()
        jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(public))
        return {"keys": [{**jwk, "kid": "mock-1", "alg": "RS256", "use": "sig"}]}

    async def authorization_endpoint(self) -> str:
        return f"{self.issuer}/authorize"

    async def issue_code(self, login: str, client_id: str, redirect_uri: str, nonce: str, challenge: str) -> str:
        code = secrets.token_urlsafe(24)
        await get_redis().set(f"mockidp:code:{code}", json.dumps({
            "sub": "mock-" + hashlib.sha256(login.encode()).hexdigest()[:24], "client_id": client_id,
            "redirect_uri": redirect_uri, "nonce": nonce, "challenge": challenge,
        }), ex=MOCK_CODE_TTL)
        return code

    async def exchange(self, code: str, redirect_uri: str, verifier: str) -> str:
        raw = await get_redis().getdel(f"mockidp:code:{code}")  # одноразовый
        if raw is None:
            raise OidcError()
        data = json.loads(raw)
        if (data["redirect_uri"], data["client_id"]) != (redirect_uri, self.client_id) \
                or data["challenge"] != pkce_challenge(verifier):
            raise OidcError()
        now = int(time.time())
        return jwt.encode(
            {"iss": self.issuer, "aud": self.client_id, "sub": data["sub"], "nonce": data["nonce"],
             "iat": now, "exp": now + 300},
            await self._private_key(), algorithm="RS256", headers={"kid": "mock-1"},
        )


@lru_cache
def get_provider() -> HttpProvider | MockProvider:
    s = get_settings()
    if s.oidc_mock:
        return MockProvider(s.oidc_issuer, s.oidc_client_id)
    return HttpProvider(s.oidc_issuer, s.oidc_client_id, s.oidc_client_secret)


async def validate_id_token(
    token: str, provider, nonce: str, issuer: str | None = None, audience: str | None = None
) -> str:
    """Проверить id_token и вернуть sub. Любая ошибка — OidcError (пользователю детали не нужны)."""
    settings = get_settings()
    issuer = (issuer or settings.oidc_issuer).rstrip("/")
    audience = audience or settings.oidc_client_id
    try:
        header = jwt.get_unverified_header(token)
        if header.get("alg") not in ALLOWED_ALGS:
            raise OidcError()
        key = None
        for refresh in (False, True):  # новый kid — один раз перечитать JWKS (ротация ключей провайдера)
            jwks = await provider.jwks(refresh=refresh)
            key = next((k for k in jwks.get("keys", []) if k.get("kid") == header.get("kid")), None)
            if key:
                break
        if key is None:
            raise OidcError()
        claims = jwt.decode(
            token, jwt.PyJWK(key).key, algorithms=ALLOWED_ALGS, audience=audience,
            issuer=issuer, leeway=LEEWAY_SECONDS,
            options={"require": ["exp", "iat", "iss", "aud", "sub", "nonce"]},
        )
    except OidcError:
        raise
    except (jwt.PyJWTError, ValueError, KeyError, httpx.HTTPError):
        raise OidcError() from None
    if not secrets.compare_digest(str(claims.get("nonce", "")), nonce):
        raise OidcError()
    return str(claims["sub"])
