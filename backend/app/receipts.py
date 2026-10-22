"""
Разбор QR-кода российского кассового чека (docs/FEATURES.md §8), без обращения к ФНС.

Формат: t=20261021T1530[SS]&s=1250.50&fn=<16 цифр>&i=<номер документа>&fp=<фискальный признак>&n=1
Сами фискальные реквизиты не храним — только SHA-256 от «fn:i:fp» для защиты от повторного добавления.
"""
import hashlib
import re
from dataclasses import dataclass
from datetime import date, datetime
from urllib.parse import parse_qsl

from .errors import ValidationFailed

_BAD = "Не похоже на QR-код кассового чека"
_TIME_RE = re.compile(r"^(\d{8})T(\d{4})(\d{2})?$")
_AMOUNT_RE = re.compile(r"^\d{1,9}(\.\d{1,2})?$")
_DIGITS_RE = re.compile(r"^\d{1,20}$")


@dataclass
class Receipt:
    amount_kop: int
    date: date
    time: str  # HH:MM
    key: str  # SHA-256 fn:i:fp


def parse_receipt(qr: str, field: str = "qr") -> Receipt:
    if not qr or len(qr) > 512:
        raise ValidationFailed(_BAD, field)
    try:
        params = dict(parse_qsl(qr.strip(), strict_parsing=True, max_num_fields=12))
    except ValueError:
        raise ValidationFailed(_BAD, field) from None
    t, s = params.get("t", ""), params.get("s", "")
    fn, i, fp = params.get("fn", ""), params.get("i", ""), params.get("fp", "")
    time_match = _TIME_RE.match(t)
    if not (time_match and _AMOUNT_RE.match(s) and all(_DIGITS_RE.match(v) for v in (fn, i, fp))):
        raise ValidationFailed(_BAD, field)
    try:
        moment = datetime.strptime(time_match.group(1) + time_match.group(2), "%Y%m%d%H%M")
    except ValueError:
        raise ValidationFailed(_BAD, field) from None
    rub, _, kop = s.partition(".")
    amount_kop = int(rub) * 100 + int((kop + "00")[:2])
    if amount_kop <= 0:
        raise ValidationFailed(_BAD, field)
    key = hashlib.sha256(f"{fn}:{i}:{fp}".encode()).hexdigest()
    return Receipt(amount_kop=amount_kop, date=moment.date(), time=moment.strftime("%H:%M"), key=key)
