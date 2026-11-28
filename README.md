# Общий план

Семейное пространство вокруг общего счёта: сколько денег остаётся после резерва на платежи,
какая доля расходов приходится на каждого и сколько нужно докинуть. Расход можно разделить поровну
или оставить общим. Личные покупки попадают в семейный бюджет после выбора участника.

Семейный счёт и его пополнения работают как демо-учёт. В нём можно пройти сценарий целиком,
включая резерв и ручную отметку оплаты. Для личных покупок доступны примеры с демо-карты и загрузка CSV.

В v2 все участники равноправно ведут бюджет, а владелец подтверждает новых участников и управляет составом.
Сервер считает остаток, доли и сумму к пополнению, поддерживает календарь, аналитику и автоплатежи.

Проект трека «Финтех без границ» (ВТБ × Финансовый университет), направление «Семейный банкинг».

## Документация

| Документ | О чём |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Компоненты, сценарии, модель данных, безопасность, масштабирование, целевая архитектура пилота |
| [docs/FEATURES.md](docs/FEATURES.md) | Актуальные правила v2: участники, общий счёт, платежи, аналитика и календарь |
| [docs/API.md](docs/API.md) | Все эндпоинты: запросы, ответы, ошибки, лимиты, идемпотентность, поток событий |
| [docs/TEST_DATA.md](docs/TEST_DATA.md) | Тестовые данные: демо-семья, витрина на сервере, тестовые входы, примеры чеков и выписки |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Развёртывание в Dokploy, переменные окружения, health-проверки, журнал, бэкапы, частые проблемы |
| [docs/SECURITY.md](docs/SECURITY.md) | Модель угроз, защита от DDoS и злоупотреблений, результаты аудита, остаточные риски |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Локальный запуск, тесты, CI, как добавить эндпоинт или миграцию |

## Стек

| Часть | Технологии |
|---|---|
| frontend | React 19, TypeScript, Vite, Tailwind, Zustand; nginx |
| backend | Python 3.12, FastAPI, SQLAlchemy 2 (async), Alembic, uvicorn |
| данные | PostgreSQL 16 — данные; Redis 7 — лимиты запросов и события между копиями backend |
| поставка | Docker Compose, GitHub Actions (unit + e2e на всём стеке), Dokploy |

## Быстрый старт

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --build --wait
```

Приложение — http://127.0.0.1:18080, Swagger — http://127.0.0.1:18080/api/docs.
Запуск частей по отдельности и тесты — в [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Структура

```
frontend/            React-приложение и nginx (Dockerfile)
backend/app/         FastAPI: api/ → services/ → domain/, модели, миграции
backend/tests/       unit/ — формулы; e2e/ — все эндпоинты по HTTP
docs/                документация
docker-compose.yml   весь стек для локального запуска и CI
backend/docker-compose.yml   сервис «Backend» в Dokploy: backend + PostgreSQL + Redis
frontend/docker-compose.yml  сервис «Frontend» в Dokploy: nginx с фронтендом
docker-compose.dev.yml  добавка для разработки: PostgreSQL и Redis на localhost
docker-compose.e2e.yml  добавка для запуска всего стека и e2e: порт 18080, 2 копии backend
```
