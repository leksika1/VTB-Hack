"""Проверки ввода с понятными сообщениями — те же правила, что в форме на фронтенде."""
import math
import re
from datetime import date

from .errors import ValidationFailed

CATEGORIES = ("food", "housing", "transport", "kids", "other")
MAX_AMOUNT_KOP = 100_000_000 * 100

_MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
_INVITE_RE = re.compile(r"^[A-Z0-9]{6}$")


def amount_to_kop(value: float, field: str = "amount", allow_zero: bool = False) -> int:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
        raise ValidationFailed("Введите число, например 1 500 или 1 500,50", field)
    kop = round(value * 100)
    if abs(value * 100 - kop) > 1e-6:
        raise ValidationFailed("Не больше двух знаков после запятой", field)
    if kop < 0:
        raise ValidationFailed("Сумма не может быть отрицательной", field)
    if kop == 0 and not allow_zero:
        raise ValidationFailed("Сумма должна быть больше нуля", field)
    if kop > MAX_AMOUNT_KOP:
        raise ValidationFailed("Слишком большая сумма", field)
    return kop


def kop_to_amount(kop: int) -> float:
    return kop / 100


def clean_title(title: str, field: str = "title") -> str:
    title = (title or "").strip()
    if not title:
        raise ValidationFailed("Укажите название", field)
    if len(title) > 120:
        raise ValidationFailed("Название длиннее 120 символов", field)
    return title


def clean_name(value: str, field: str, empty_message: str, max_len: int = 60) -> str:
    value = (value or "").strip()
    if not value:
        raise ValidationFailed(empty_message, field)
    if len(value) > max_len:
        raise ValidationFailed(f"Не длиннее {max_len} символов", field)
    return value


def parse_date(value: str, field: str = "date") -> date:
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise ValidationFailed("Укажите дату", field) from None


def check_category(value: str, field: str = "category") -> str:
    if value not in CATEGORIES:
        raise ValidationFailed("Выберите категорию", field)
    return value


def check_month_key(value: str, field: str = "monthKey") -> str:
    if not _MONTH_RE.match(value or ""):
        raise ValidationFailed("Месяц в формате ГГГГ-ММ", field)
    return value


def normalize_invite_code(code: str) -> str:
    normalized = (code or "").strip().upper()
    if not _INVITE_RE.match(normalized):
        raise ValidationFailed("Код состоит из 6 латинских букв и цифр", "code")
    return normalized


def month_bounds(month_key: str) -> tuple[date, date]:
    """[первый день месяца, первый день следующего)"""
    year, month = map(int, month_key.split("-"))
    start = date(year, month, 1)
    end = date(year + (month == 12), month % 12 + 1, 1)
    return start, end


def shift_month(month_key: str, delta: int) -> str:
    year, month = map(int, month_key.split("-"))
    index = year * 12 + (month - 1) + delta
    return f"{index // 12:04d}-{index % 12 + 1:02d}"
