"""
Разбор CSV-выписки и предложение категории (docs/FEATURES.md §10). Чистые функции, без БД.

Формат: первая строка — заголовки; разделитель ; , или табуляция; дата ДД.ММ.ГГГГ или ГГГГ-ММ-ДД;
сумма с запятой или точкой, трата — отрицательная. Неизвестные колонки игнорируются.
"""
import csv
import hashlib
import io
import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime

MAX_ROWS = 1000
MAX_CONTENT_BYTES = 1_048_576

_HEADERS = {
    "date": {"дата", "дата операции", "date"},
    "amount": {"сумма", "сумма операции", "amount"},
    "description": {"описание", "назначение", "описание операции", "description"},
    "mcc": {"mcc"},
}
_AMOUNT_RE = re.compile(r"^[+-]?\d{1,12}([.,]\d{1,2})?$")


class StatementError(ValueError):
    """Файл целиком не читается (нет нужных колонок, пустой, слишком большой)."""


@dataclass
class ParsedRow:
    row_no: int
    date: date | None
    amount_kop: int | None  # трата, > 0
    description: str
    mcc: str | None
    error: str | None


@dataclass
class ParsedStatement:
    rows: list[ParsedRow]
    total_rows: int
    skipped_income: int


def clean_text(value: str, limit: int = 120) -> str:
    """Без управляющих символов и лишних пробелов — описание уходит в название расхода."""
    # Управляющие символы (табуляция, переводы строк, невидимые bidi-метки) — в пробел, чтобы не склеить слова
    value = "".join(" " if unicodedata.category(ch)[0] == "C" else ch for ch in value)
    return re.sub(r"\s+", " ", value).strip()[:limit]


def _parse_date(value: str) -> date | None:
    for fmt in ("%d.%m.%Y", "%Y-%m-%d", "%d.%m.%Y %H:%M", "%d.%m.%Y %H:%M:%S"):
        try:
            d = datetime.strptime(value.strip(), fmt).date()
        except ValueError:
            continue
        return d if 2000 <= d.year <= 2100 else None
    return None


def _parse_amount(value: str) -> int | None:
    """Копейки со знаком или None."""
    raw = value.replace(" ", "").replace(" ", "").replace("₽", "").strip()
    if not _AMOUNT_RE.match(raw):
        return None
    sign = -1 if raw.startswith("-") else 1
    rub, _, kop = raw.lstrip("+-").replace(",", ".").partition(".")
    return sign * (int(rub) * 100 + int((kop + "00")[:2]))


def parse_statement(content: str) -> ParsedStatement:
    if len(content.encode("utf-8")) > MAX_CONTENT_BYTES:
        raise StatementError("Файл больше 1 МБ")
    content = content.lstrip("﻿")
    first_line = content.split("\n", 1)[0]
    delimiter = max((";", ",", "\t"), key=first_line.count)
    reader = csv.reader(io.StringIO(content), delimiter=delimiter)
    try:
        header = next(reader)
    except StopIteration:
        raise StatementError("Файл пустой") from None
    names = [h.strip().lower() for h in header]
    columns = {}
    for key, variants in _HEADERS.items():
        for i, name in enumerate(names):
            if name in variants:
                columns[key] = i
                break
    if not {"date", "amount"} <= columns.keys():
        raise StatementError("Не найдены колонки «Дата» и «Сумма»")

    rows, total, income = [], 0, 0
    for line_no, cells in enumerate(reader, start=2):
        if not any(c.strip() for c in cells):
            continue
        total += 1
        if total > MAX_ROWS:
            raise StatementError(f"Больше {MAX_ROWS} операций — разбейте выписку на части")

        def cell(key: str) -> str:
            i = columns.get(key)
            return cells[i] if i is not None and i < len(cells) else ""

        description = clean_text(cell("description"))
        mcc = cell("mcc").strip()
        mcc = mcc if re.fullmatch(r"\d{4}", mcc) else None
        on = _parse_date(cell("date"))
        amount = _parse_amount(cell("amount"))
        if amount is not None and amount > 0:
            income += 1  # поступления не импортируются
            continue
        error = None
        if on is None:
            error = "Не удалось прочитать дату"
        elif amount is None or amount == 0:
            error = "Не удалось прочитать сумму"
        rows.append(ParsedRow(line_no, on, -amount if amount else None, description, mcc, error))
    return ParsedStatement(rows=rows, total_rows=total, skipped_income=income)


def fingerprints(rows: list[ParsedRow]) -> list[str | None]:
    """Отпечаток строки: дата, сумма, описание и номер среди одинаковых строк файла.
    Две одинаковые покупки в один день — разные отпечатки; повторный импорт той же выписки — те же."""
    seen: dict[tuple, int] = {}
    result = []
    for r in rows:
        if r.error:
            result.append(None)
            continue
        base = (r.date.isoformat(), r.amount_kop, normalize(r.description))
        seen[base] = seen.get(base, 0) + 1
        result.append(hashlib.sha256(repr((*base, seen[base])).encode()).hexdigest())
    return result


# ── Категории ──

# MCC (коды категорий торговых точек) → категория бюджета
_MCC = {
    "food": {"5411", "5412", "5422", "5441", "5451", "5462", "5499", "5811", "5812", "5814"},
    "transport": {"4111", "4112", "4121", "4131", "4784", "5541", "5542", "5983", "7523", "7531", "7538"},
    "housing": {"4900", "6513", "1520", "5200", "5211", "5712", "5719"},
    "kids": {"5641", "5945", "8211", "8220", "8299", "8351", "7911"},
}
_KEYWORDS = {
    "food": ("пятерочка", "пятёрочка", "магнит", "перекресток", "перекрёсток", "вкусвилл", "ашан", "лента",
             "дикси", "азбука вкуса", "самокат", "окей", "spar", "metro", "продукт"),
    "transport": ("азс", "лукойл", "роснефть", "газпромнефть", "татнефть", "такси", "яндекс go", "метро",
                  "мосметро", "тройка", "парковк", "ржд", "аэрофлот"),
    "housing": ("жкх", "жку", "коммунал", "мосэнерго", "мосэнергосбыт", "аренда", "квартплат", "водоканал",
                "газпром межрегионгаз", "управляющая компания"),
    "kids": ("детский мир", "школ", "детский сад", "кружок", "секция", "игрушк", "лас играс"),
}


def normalize(description: str) -> str:
    """Ключ для правил семьи: нижний регистр, без цифр и знаков, первые 3 слова."""
    words = re.sub(r"[^a-zа-яё ]+", " ", description.lower()).split()
    return " ".join(words[:3])


def suggest_category(description: str, mcc: str | None, family_rules: dict[str, str]) -> str:
    key = normalize(description)
    if key and key in family_rules:
        return family_rules[key]
    if mcc:
        for category, codes in _MCC.items():
            if mcc in codes:
                return category
    text = description.lower()
    for category, words in _KEYWORDS.items():
        if any(w in text for w in words):
            return category
    return "other"
