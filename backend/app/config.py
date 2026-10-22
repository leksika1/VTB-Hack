from functools import lru_cache
from zoneinfo import ZoneInfo

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Все настройки — переменные окружения (или backend/.env). Полный список: docs/OPERATIONS.md."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # По умолчанию — PostgreSQL и Redis из docker-compose.dev.yml. В контейнере задаются compose/Dokploy;
    # если забыть, backend не запустится, а не станет молча работать без базы
    database_url: str = "postgresql+asyncpg://family:family@localhost:55432/family"
    redis_url: str = "redis://:family@localhost:6379/0"
    # Через запятую: https://app.example.ru,http://localhost:5173
    cors_origins: str = "http://localhost:5173"
    # «Сегодня» и «текущий месяц» считаются в этом поясе, а не в поясе сервера
    timezone: str = "Europe/Moscow"
    # Swagger и OpenAPI на /api/docs; в контуре банка можно выключить
    enable_docs: bool = True

    # Демо-семьи старше этого срока удаляются фоновой очисткой
    demo_ttl_hours: int = 24
    # Сессия устройства закрывается после стольких дней без запросов
    session_ttl_days: int = 90
    # Сколько хранить ответы для Idempotency-Key
    idempotency_ttl_hours: int = 24
    # Период фоновой очистки; 0 — выключена
    maintenance_interval_seconds: int = 3600

    # Лимиты запросов: «сколько» за rate_limit_window_seconds
    rate_limit_enabled: bool = True
    rate_limit_window_seconds: int = 60
    rate_limit_invite: int = 20  # просмотр и вход по коду — с одного IP
    rate_limit_signup: int = 10  # создание семьи и демо — с одного IP
    rate_limit_write: int = 120  # изменения данных — на участника
    rate_limit_read: int = 600  # чтение — на участника

    # Защита от исчерпания ресурсов
    max_body_bytes: int = 64 * 1024  # тело запроса
    max_streams_per_member: int = 5  # одновременных потоков /api/events у участника (на экземпляр)
    max_records_per_family: int = 20_000  # расходов и, отдельно, платежей у семьи

    # Интервал пустых сообщений в потоке событий, чтобы прокси не рвали соединение
    events_heartbeat_seconds: int = 15

    # Уведомления и письма (docs/FEATURES.md §9)
    notification_ttl_days: int = 90
    # outbox — письма только складываются в email_outbox (разработка, тесты); smtp — отправляются
    email_backend: str = "outbox"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "Семейный бюджет <no-reply@example.ru>"
    smtp_starttls: bool = True
    email_send_interval_seconds: int = 10

    log_level: str = "INFO"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.timezone)


@lru_cache
def get_settings() -> Settings:
    return Settings()
