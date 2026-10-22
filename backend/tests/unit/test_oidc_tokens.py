"""Проверка id_token: принимаем только честно подписанный токен для нас (docs/FEATURES.md §11)."""
import asyncio
import json
import time

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from app.oidc import OidcError, validate_id_token

ISS, AUD, NONCE = "https://id.bank.example", "family-budget", "nonce-123"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class FakeProvider:
    def __init__(self, key=KEY, kid="k1"):
        jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key()))
        self.keys = {"keys": [{**jwk, "kid": kid, "alg": "RS256"}]}

    async def jwks(self, refresh=False):
        return self.keys


def token(key=KEY, alg="RS256", kid="k1", **overrides):
    now = int(time.time())
    claims = {"iss": ISS, "aud": AUD, "sub": "user-42", "nonce": NONCE, "iat": now, "exp": now + 300, **overrides}
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, key, algorithm=alg, headers={"kid": kid})


def check(tok, provider=None, nonce=NONCE):
    return asyncio.run(validate_id_token(tok, provider or FakeProvider(), nonce, issuer=ISS, audience=AUD))


def test_valid_token():
    assert check(token()) == "user-42"


@pytest.mark.parametrize("bad", [
    {"aud": "someone-else"},
    {"iss": "https://evil.example"},
    {"exp": int(time.time()) - 3600},
    {"nonce": "other"},
    {"nonce": None},
    {"exp": None},
])
def test_rejects_wrong_claims(bad):
    with pytest.raises(OidcError):
        check(token(**bad))


def test_rejects_wrong_signature_and_unknown_key():
    with pytest.raises(OidcError):
        check(token(key=OTHER_KEY))
    with pytest.raises(OidcError):
        check(token(kid="unknown"))


def test_rejects_alg_none_and_hs256_key_confusion():
    unsigned = jwt.encode({"iss": ISS, "aud": AUD, "sub": "x", "nonce": NONCE, "iat": 1, "exp": 9999999999},
                          key=None, algorithm="none")
    with pytest.raises(OidcError):
        check(unsigned)
    # Классическая атака: подписать HS256 публичным ключом провайдера
    public_pem = KEY.public_key().public_bytes(serialization.Encoding.PEM,
                                                serialization.PublicFormat.SubjectPublicKeyInfo)
    header = jwt.utils.base64url_encode(json.dumps({"alg": "HS256", "kid": "k1"}).encode())
    payload = jwt.utils.base64url_encode(json.dumps({"iss": ISS, "aud": AUD, "sub": "x", "nonce": NONCE,
                                                     "iat": 1, "exp": 9999999999}).encode())
    import hashlib
    import hmac
    signature = jwt.utils.base64url_encode(hmac.new(public_pem, header + b"." + payload, hashlib.sha256).digest())
    with pytest.raises(OidcError):
        check((header + b"." + payload + b"." + signature).decode())


def test_rejects_garbage():
    with pytest.raises(OidcError):
        check("not.a.token")
