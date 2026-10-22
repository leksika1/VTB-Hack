from datetime import date, datetime

from .config import get_settings


def today() -> date:
    return datetime.now(get_settings().tz).date()


def current_month_key() -> str:
    return today().strftime("%Y-%m")
