# syntax=docker/dockerfile:1
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# Пусто — запросы идут на тот же домен в /api, их проксирует nginx ниже
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.29-alpine

COPY --from=build /app/dist /usr/share/nginx/html

# Куда проксировать /api. По умолчанию — сервис backend из docker-compose
ENV BACKEND_UPSTREAM=http://backend:8000
# Пороги защиты от флуда (на один IP); для нагрузочных и e2e-тестов поднимаются через окружение
ENV API_RATE=20r/s API_BURST=40 STATIC_RATE=50r/s CONN_PER_IP=50 EVENTS_PER_IP=10
# Дополнительные адреса API для CSP connect-src, если фронтенд собран с VITE_API_URL на другой домен
ENV CSP_CONNECT_EXTRA=""

# Шаблон: образ nginx подставляет переменные окружения (BACKEND_UPSTREAM) при старте.
# Файл включается внутрь блока http, поэтому зоны лимитов объявлены здесь же.
COPY <<'EOF' /etc/nginx/templates/default.conf.template
# ── Реальный IP клиента ──
# Перед nginx стоит Traefik (Dokploy): адрес клиента берём из X-Forwarded-For, но верим ему
# только от прокси из частных сетей, иначе клиент подставит любой IP и обойдёт лимиты
set_real_ip_from 10.0.0.0/8;
set_real_ip_from 172.16.0.0/12;
set_real_ip_from 192.168.0.0/16;
set_real_ip_from 127.0.0.1;
real_ip_header X-Forwarded-For;
real_ip_recursive on;

# ── Защита от флуда (первый рубеж; лимиты по смыслу — в backend) ──
limit_req_zone  $binary_remote_addr zone=api:10m    rate=${API_RATE};
limit_req_zone  $binary_remote_addr zone=static:10m rate=${STATIC_RATE};
limit_conn_zone $binary_remote_addr zone=perip:10m;
limit_req_status 429;
limit_conn_status 429;

server_tokens off;

server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # Медленные клиенты (slowloris) не держат соединения
    client_header_timeout 10s;
    client_body_timeout 10s;
    send_timeout 15s;
    keepalive_timeout 30s;
    # С запасом над лимитом backend (64 КБ): обычное превышение backend объяснит понятной ошибкой,
    # а заведомо огромные тела nginx отсечёт, не передавая дальше
    client_max_body_size 128k;
    limit_conn perip ${CONN_PER_IP};

    # ── Заголовки безопасности ──
    # Скрипты и стили только свои; никаких внешних ресурсов (в т.ч. шрифтов) — работает в закрытом контуре
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ${CSP_CONNECT_EXTRA}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    # В ссылке-приглашении есть код семьи — не отдаём его другим сайтам в Referer
    add_header Referrer-Policy "no-referrer" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;
    add_header Strict-Transport-Security "max-age=31536000" always;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;

    # Поток событий (SSE): без буферизации и с долгим таймаутом; не больше 10 потоков с IP
    location = /api/events {
        limit_req zone=api burst=${API_BURST} nodelay;
        limit_conn perip ${EVENTS_PER_IP};
        resolver 127.0.0.11 valid=10s ipv6=off;
        set $backend_upstream ${BACKEND_UPSTREAM};
        proxy_pass $backend_upstream;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
        include /etc/nginx/snippets/api-headers.conf;
    }

    # Загрузка выписки (docs/FEATURES.md §10): единственный путь с большим телом
    location = /api/imports {
        limit_req zone=api burst=${API_BURST} nodelay;
        client_max_body_size 2m;
        resolver 127.0.0.11 valid=10s ipv6=off;
        set $backend_upstream ${BACKEND_UPSTREAM};
        proxy_pass $backend_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
        include /etc/nginx/snippets/api-headers.conf;
    }

    location /api/ {
        limit_req zone=api burst=${API_BURST} nodelay;
        # Адрес через переменную и DNS Docker: nginx стартует, даже если бэкенд ещё не поднят
        resolver 127.0.0.11 valid=10s ipv6=off;
        set $backend_upstream ${BACKEND_UPSTREAM};
        proxy_pass $backend_upstream;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
        include /etc/nginx/snippets/api-headers.conf;
    }

    # Сборка vite: имена с хешем — кэшируем надолго
    location /assets/ {
        limit_req zone=static burst=100 nodelay;
        expires 1y;
        add_header Cache-Control "public, immutable" always;
        add_header X-Content-Type-Options "nosniff" always;
        try_files $uri =404;
    }

    location / {
        limit_req zone=static burst=100 nodelay;
        try_files $uri $uri/ /index.html;
    }
}
EOF

# Заголовки безопасности ставит nginx (уровень server); такие же от backend скрываем,
# иначе получится «DENY, DENY», и часть браузеров проигнорирует заголовок целиком
COPY <<'EOF' /etc/nginx/snippets/api-headers.conf
proxy_hide_header Server;
proxy_hide_header X-Content-Type-Options;
proxy_hide_header X-Frame-Options;
proxy_hide_header Referrer-Policy;
EOF

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
