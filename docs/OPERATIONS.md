# Эксплуатация

Как развернуть, настроить, проверить и обслуживать сервис.

## Состав стека

`docker-compose.yml` в корне репозитория:

| Сервис | Образ | Порт внутри сети | Данные |
|---|---|---|---|
| `frontend` | сборка `frontend/Dockerfile` (nginx) | 80 | — |
| `backend` | сборка `backend/Dockerfile` (uvicorn) | 8000 | — |
| `db` | `postgres:16-alpine` | 5432 | том `pgdata` |
| `redis` | `redis:7.4-alpine`, с паролем, без записи на диск, 64 МБ | 6379 | — |

Порты наружу не публикуются: домены и TLS назначает Traefik в Dokploy. Внешний трафик идёт
только во `frontend`, он сам проксирует `/api` на `backend`. Сети: `edge` (frontend ↔ backend) и внутренняя
`data` (backend ↔ PostgreSQL, Redis) без выхода наружу. Подробно о защите — [SECURITY.md](SECURITY.md).

## Развёртывание в Dokploy

1. Сервис типа **Compose**, источник — этот репозиторий, файл `docker-compose.yml`.
2. **Environment** сервиса:
   ```
   POSTGRES_PASSWORD=<длинный случайный пароль, только латиница и цифры>
   REDIS_PASSWORD=<другой длинный случайный пароль, только латиница и цифры>
   CORS_ORIGINS=https://<домен фронтенда>
   ```
   Без паролей compose не запустится — это намеренно. Сгенерировать: `openssl rand -hex 32`.
3. **Domains**: домен → сервис `frontend`, порт 80. Отдельный домен для `backend` не нужен.
4. Деплой запускает GitHub Actions после успешных тестов (вебхуки `DOKPLOY_WEBHOOK_FRONTEND`
   и `DOKPLOY_WEBHOOK_BACKEND` в окружениях `dev`/`prod` репозитория). Ветка `dev` → окружение dev,
   `main` → prod.

> Если frontend и backend заведены в Dokploy как два отдельных **Application** (а не один Compose),
> то `db` и `redis` из compose не поднимутся. Тогда создайте в Dokploy базы данных PostgreSQL и Redis
> (раздел Databases) и задайте backend переменные `DATABASE_URL` и `REDIS_URL`, а frontend —
> `BACKEND_UPSTREAM=http://<внутреннее имя backend>:8000`. Без `DATABASE_URL` и `REDIS_URL` backend
> не запустится (ошибка подключения в журнале) — молча работать без базы он не умеет.

При старте контейнер backend применяет миграции (`alembic upgrade head`) и только потом принимает запросы.

## Переменные окружения

### backend

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `DATABASE_URL` | PostgreSQL из `docker-compose.dev.yml` | `postgresql+asyncpg://user:pass@host:5432/db`. В compose собирается из `POSTGRES_PASSWORD` |
| `REDIS_URL` | Redis из `docker-compose.dev.yml` | `redis://:pass@host:6379/0`. В compose собирается из `REDIS_PASSWORD` |
| `CORS_ORIGINS` | `http://localhost:5173` | Домены фронтенда через запятую. Не нужен, если фронтенд ходит через свой nginx на тот же домен |
| `TIMEZONE` | `Europe/Moscow` | Пояс для «сегодня» и «текущего месяца» |
| `FORWARDED_ALLOW_IPS` | частные сети (`10/8, 172.16/12, 192.168/16, 127.0.0.1`) | Чьему `X-Forwarded-For` верить. Не ставьте `*` — клиент обойдёт лимиты, подставив чужой IP |
| `SESSION_TTL_DAYS` | `90` | Сессия закрывается после стольких дней без запросов |
| `DEMO_TTL_HOURS` | `24` | Срок жизни демо-семей |
| `IDEMPOTENCY_TTL_HOURS` | `24` | Сколько хранить ответы для `Idempotency-Key` |
| `MAINTENANCE_INTERVAL_SECONDS` | `3600` | Период фоновой очистки; `0` — выключить |
| `RATE_LIMIT_ENABLED` | `true` | Включить лимиты запросов |
| `RATE_LIMIT_WINDOW_SECONDS` | `60` | Окно лимитов |
| `RATE_LIMIT_INVITE` | `20` | Запросов к приглашениям с IP за окно |
| `RATE_LIMIT_SIGNUP` | `10` | Созданий семьи/демо с IP за окно |
| `RATE_LIMIT_WRITE` | `120` | Изменений данных на участника за окно |
| `EVENTS_HEARTBEAT_SECONDS` | `15` | Интервал `: ping` в потоке событий |
| `RATE_LIMIT_READ` | `600` | Чтений на участника за окно |
| `MAX_BODY_BYTES` | `65536` | Максимальный размер тела запроса |
| `MAX_STREAMS_PER_MEMBER` | `5` | Одновременных потоков событий у участника (на копию backend) |
| `MAX_RECORDS_PER_FAMILY` | `20000` | Расходов и, отдельно, платежей у семьи |
| `ENABLE_DOCS` | `true` | Swagger и OpenAPI на `/api/docs` |
| `MAX_IMPORT_BYTES` | `2097152` | Тело `POST /api/imports` (выписка в JSON) |
| `NOTIFICATION_TTL_DAYS` | `90` | Сколько хранить уведомления |
| `EMAIL_BACKEND` | `outbox` | `outbox` — письма только в таблице `email_outbox`; `smtp` — отправлять |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_STARTTLS` | —, `587`, —, —, `true` | Почтовый сервер |
| `SMTP_FROM` | `Семейный бюджет <no-reply@example.ru>` | Отправитель |
| `EMAIL_SEND_INTERVAL_SECONDS` | `10` | Период разбора очереди писем |
| `OIDC_ENABLED` | `false` | Вход через ВТБ ID |
| `OIDC_PROVIDER_NAME` | `ВТБ ID` | Название на кнопке |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | — | Параметры провайдера (выдаёт банк) |
| `OIDC_REDIRECT_URIS` | — | Разрешённые адреса возврата во фронтенд, через запятую (точное совпадение) |
| `OIDC_SCOPES` | `openid` | Запрашиваемые scope |
| `OIDC_MOCK` | `false` | Встроенный тестовый провайдер (только демо и тесты!); тогда `OIDC_ISSUER=https://<домен>/api/mock-idp` |
| `SEED_SHOWCASE` | `false` | Создать постоянную тестовую семью при старте — [TEST_DATA.md](TEST_DATA.md) |
| `LOG_LEVEL` | `INFO` | Уровень журнала |

### frontend

| Переменная | Когда | По умолчанию | Назначение |
|---|---|---|---|
| `BACKEND_UPSTREAM` | при запуске контейнера | `http://backend:8000` | Куда nginx проксирует `/api` |
| `VITE_API_URL` | при сборке (build arg) | пусто | Адрес API, если он на другом домене. Пусто — тот же домен |
| `VITE_API_PROXY` | `npm run dev` | `http://localhost:8000` | Куда dev-сервер vite проксирует `/api` |
| `API_RATE`, `API_BURST` | при запуске | `20r/s`, `40` | Лимит запросов к `/api` с одного IP в nginx |
| `STATIC_RATE` | при запуске | `50r/s` | Лимит запросов к статике с одного IP |
| `CONN_PER_IP`, `EVENTS_PER_IP` | при запуске | `50`, `10` | Одновременных соединений и потоков событий с одного IP |
| `CSP_CONNECT_EXTRA` | при запуске | пусто | Доп. адрес API для CSP, если фронтенд собран с `VITE_API_URL` на другой домен |

### docker-compose

| Переменная | Назначение |
|---|---|
| `POSTGRES_PASSWORD` | Пароль PostgreSQL. Обязателен |
| `REDIS_PASSWORD` | Пароль Redis. Обязателен |
| `CORS_ORIGINS` | Пробрасывается в backend |

Локально пароли берутся из `.env` в корне (скопируйте `.env.example`).

## Проверки здоровья

| Путь | Что проверяет | Для чего |
|---|---|---|
| `GET /health` (внутри сети) | Процесс отвечает | Healthcheck контейнера, liveness |
| `GET /api/health` | То же, снаружи через nginx | Внешний мониторинг доступности |
| `GET /api/ready` | Доступны PostgreSQL и Redis; `503`, если нет | Readiness балансировщика, алерты |

## Журнал

backend пишет в stdout по строке JSON на событие:

```json
{"ts": "2026-10-22T10:15:03+0000", "level": "INFO", "logger": "app.access", "msg": "request",
 "request_id": "8a7bc5bd…", "method": "POST", "path": "/api/expenses", "status": 201,
 "duration_ms": 5.3, "client": "203.0.113.7"}
```

- Найти всё по запросу пользователя: `X-Request-ID` из ответа → поиск по `request_id`.
- Ошибки сервера: `"level": "ERROR"` с полем `exc` (трассировка).
- Тела запросов, токены и суммы в журнал не попадают.

## Масштабирование

- Больше копий backend на одном сервере: `deploy.replicas` / `scale` в compose (проверено в CI на двух копиях).
  nginx распределяет запросы между копиями через DNS Docker; лимиты и события общие через Redis.
- Больше трёх копий — поставить PgBouncer: каждая копия держит до 30 соединений, у PostgreSQL по умолчанию 100.
- Целевая схема для контура банка (Kubernetes, автоскейлинг, HA PostgreSQL) — [ARCHITECTURE.md, раздел 6](ARCHITECTURE.md#6-надёжность-и-масштабирование).

## Резервные копии

Все данные — в PostgreSQL; Redis восстанавливать не нужно.

```bash
# копия
docker compose exec -T db pg_dump -U family -d family --format=custom > backup_$(date +%F).dump
# восстановление в пустую базу
docker compose exec -T db pg_restore -U family -d family --clean --if-exists < backup_2026-10-22.dump
```

## Миграции

- Применяются автоматически при старте backend; копии стартуют по очереди (advisory lock).
- Откат на одну версию: `docker compose exec backend alembic downgrade -1`.
- Текущая версия: `docker compose exec backend alembic current`.

## Частые проблемы

| Симптом | Причина и решение |
|---|---|
| Во фронтенде «Не удалось связаться с сервером» | backend не запущен или nginx не находит его: проверьте `BACKEND_UPSTREAM` и `GET /api/health` |
| `/api/ready` отвечает 503 | Недоступна БД или Redis — см. поле `checks` |
| Изменения другого участника видны только через минуту | Поток `/api/events` режется прокси: для него нужна отключённая буферизация (в nginx фронтенда уже настроена) |
| Все запросы получают 429 | За прокси, которому не доверяют: все клиенты видны с одного IP. Добавьте сеть прокси в `FORWARDED_ALLOW_IPS` |
| Стек не запускается: `Задайте POSTGRES_PASSWORD` | Не заданы пароли в Environment Dokploy или в `.env` |
| Ответы 503 «Сервер перегружен» | Исчерпан пул соединений с БД: медленные запросы или мало копий backend; смотрите журнал PostgreSQL |
| Ответы 429 «Слишком много открытых вкладок» | У участника больше 5 потоков событий — закрыть лишние вкладки |
