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
