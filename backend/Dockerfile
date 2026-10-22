# syntax=docker/dockerfile:1
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY alembic.ini .
COPY migrations ./migrations
COPY app ./app

RUN useradd --system --uid 10001 app
USER app

# Чьим X-Forwarded-For верить: только прокси из частных сетей (nginx фронтенда, Traefik Dokploy).
# '*' нельзя — клиент подставит любой IP и обойдёт лимиты запросов
ENV FORWARDED_ALLOW_IPS=127.0.0.1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16

EXPOSE 8000

# Миграции до старта: новый контейнер не поднимется на старой схеме.
# --limit-concurrency: сверх 1000 одновременных соединений (включая потоки событий) — сразу 503,
#   а не деградация всех запросов; --timeout-keep-alive: простаивающие соединения не копятся;
# журнал запросов пишет приложение (JSON с request_id), поэтому --no-access-log
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --no-access-log --limit-concurrency 1000 --timeout-keep-alive 5 --timeout-graceful-shutdown 10"]
