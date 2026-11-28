import hashlib
import secrets

# Без похожих символов (0/O, 1/I), чтобы код легко продиктовать
_INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

MEMBER_COLORS = ["#1F5BD8", "#C2410C", "#0F766E", "#7C3AED", "#BE185D", "#4D7C0F"]


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_invite_code() -> str:
    return "".join(secrets.choice(_INVITE_ALPHABET) for _ in range(6))


def new_invite_link_code() -> str:
    """Код ссылки-приглашения: 16 символов (80 бит), подтверждаемый владельцем."""
    return "".join(secrets.choice(_INVITE_ALPHABET) for _ in range(16))


def new_login_id() -> str:
    """Личный ID из 10 base32-символов без похожих знаков, формат XXXXX-XXXXX."""
    raw = "".join(secrets.choice(_INVITE_ALPHABET) for _ in range(10))
    return raw[:5] + "-" + raw[5:]


def normalize_login_id(value: str) -> str:
    raw = "".join((value or "").upper().split())
    if len(raw) == 10:
        raw = raw[:5] + "-" + raw[5:]
    return raw
