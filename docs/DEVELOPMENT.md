# Разработка

## Локальный запуск

Нужны Python 3.12+, Node.js 22+ и Docker. Локально используются те же СУБД, что в проде:
PostgreSQL 16 и Redis 7 (из `docker-compose.dev.yml`).

### PostgreSQL и Redis

```bash
cp .env.example .env              # пароли для локального запуска
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait db redis
```

PostgreSQL — `localhost:55432` (не 5432: этот порт часто занят установленным PostgreSQL),
Redis — `localhost:6379`. Настройки backend по умолчанию указывают именно на них.
Остановить: `docker compose -f docker-compose.yml -f docker-compose.dev.yml down` (добавьте `-v`, чтобы стереть данные).

### backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate            # Linux/macOS: source .venv/bin/activate
pip install -r requirements-dev.txt
alembic upgrade head              # схема базы — только миграциями
uvicorn app.main:app --reload --port 8000
```

Swagger — http://localhost:8000/api/docs.

### frontend

```bash
cd frontend
npm ci
npm run dev                       # http://localhost:5173, /api проксируется на :8000
```

Другой адрес бэкенда: `VITE_API_PROXY=http://localhost:8010 npm run dev`.

В приложении Claude обе части запускаются из `.claude/launch.json` (backend на 8010, frontend на 5173).

### Весь стек как в проде

```bash
cp .env.example .env              # если ещё нет
docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --build --wait
# приложение: http://127.0.0.1:18080
docker compose -f docker-compose.yml -f docker-compose.e2e.yml down -v
```

`docker-compose.e2e.yml` публикует nginx на `127.0.0.1:18080` и запускает две копии backend.

## Тесты

```
backend/tests/
  unit/test_rules.py        формулы месяца, статусы категорий, вердикты покупки, проверки ввода
  e2e/test_system.py        health, ready, OpenAPI, формат ошибок, CORS, X-Request-ID
  e2e/test_family.py        семья, приглашения, вход, выход, демо, смена участника, /state
  e2e/test_budgets.py       бюджет месяца: создание, правка, проверки, идемпотентность
  e2e/test_expenses.py      расходы: CRUD, права, сортировка, копейки, идемпотентность
  e2e/test_payments.py      платежи: CRUD, оплата и отмена, перенос месяца
  e2e/test_summary.py       сводка, статусы категорий, проверка покупки
  e2e/test_security.py      токены, изоляция семей, срок сессий, лимиты, X-Forwarded-For
  e2e/test_hardening.py     заголовки, размер тела, лимит чтений и потоков, смена кода, предел записей
  e2e/test_realtime.py      поток событий: кто что получает и не получает
  e2e/test_concurrency.py   двойные клики и одновременные действия двух участников
  e2e/test_maintenance.py   фоновая очистка
```

e2e-тесты ходят по HTTP в настоящий сервер. Каждый тест создаёт свою семью и своё «устройство»
со своим IP, поэтому тесты не зависят друг от друга и от порядка.

```bash
cd backend
pytest -q                          # всё: unit + e2e на сервере в процессе (PostgreSQL + Redis)
pytest -q tests/unit               # только формулы, ~1 с
pytest -q tests/e2e -k payments    # выборочно

# те же e2e против стека docker compose (nginx → 2 × backend → Postgres + Redis)
E2E_BASE_URL=http://127.0.0.1:18080 E2E_DATABASE_URL=postgresql+asyncpg://family:family@127.0.0.1:55433/family pytest -q tests/e2e
```

Тесты сами создают отдельную базу `e2e_<случайное>` на сервере `TEST_DATABASE_URL`, накатывают на неё
миграции и удаляют её в конце — данные разработчика не затрагиваются, а миграции проверяются каждым прогоном.
Redis — база №15 (`TEST_REDIS_URL`), очищается перед прогоном.

Против стека тесты с прямым доступом к базе (срок сессии, очистка, предел записей) работают, если задан
`E2E_DATABASE_URL` (в `docker-compose.e2e.yml` база опубликована на `127.0.0.1:55433`). Всегда пропускается
1 тест — проверка подмены `X-Forwarded-For`, ей нужен сервер без прокси перед ним.

### CI (`.github/workflows/ci.yml`)

1. **backend tests** — `pip-audit` (уязвимости зависимостей), `pytest` (unit + e2e на PostgreSQL и Redis
   из service-контейнеров) и `alembic upgrade head && alembic check` (модели и миграции не разъехались).
2. **frontend checks** — `npm audit`, линтер, сборка (включая проверку типов).
3. **build + e2e** — сборка образов, запуск всего стека (nginx с защитой, две копии backend,
   PostgreSQL и Redis с паролями), e2e против него.
4. **deploy** — только для push в `dev`/`main`, после зелёных шагов 1–3: вебхуки Dokploy.

## Как устроен код

Подробно — [ARCHITECTURE.md](ARCHITECTURE.md#слои-бэкенда). Коротко: роут в `app/api/` разбирает запрос
и вызывает функцию из `app/services/`; правила и проверки — в сервисах; формулы — в `app/domain/`.

### Добавить эндпоинт

1. Схемы запроса/ответа — в `app/schemas.py` (наследник `Schema`, поля в `snake_case`, наружу уходят в `camelCase`).
2. Логика — в `app/services/…`: принимает `db` и `member`, бросает `ValidationFailed/Forbidden/NotFound/Conflict`
   с русским сообщением и полем формы.
3. Роут — в `app/api/…`. Для изменения данных: зависимость `CurrentMember` (даёт и лимит записи, и событие `changed`),
   при создании — обернуть в `idempotency.run(...)`. Если POST ничего не меняет — вызвать `mark_silent(request)`.
4. e2e-тест в `tests/e2e/` и строка в [API.md](API.md).

### Изменить таблицы

```bash
cd backend
# 1. поправить app/models.py
# 2. сгенерировать миграцию на чистой базе и проверить её глазами
# база — локальный PostgreSQL на актуальной миграции (alembic upgrade head)
alembic revision --autogenerate -m "что изменилось"
alembic upgrade head && alembic check
alembic downgrade -1 && alembic upgrade head   # откат тоже должен работать
```

Для колонки `NOT NULL` в существующей таблице — сначала nullable, заполнить, потом `NOT NULL`
(пример — `migrations/versions/20261022_0002_session_last_seen.py`).

### Изменить формулы бюджета

Формулы продублированы: `backend/app/domain/budget.py` и `frontend/src/domain/budget.ts`. Меняйте оба
файла и тесты `tests/unit/test_rules.py`, `tests/e2e/test_summary.py`.

## Соглашения

- Сообщения об ошибках — на русском, для пользователя, без технических деталей.
- Деньги в коде бэкенда — только копейки (`int`); перевод в рубли — в схемах ответа.
- Время «сегодня» — только через `app/clock.py` (учитывает `TIMEZONE`).
- Коммиты — в `dev`; `main` — то, что показываем жюри.
