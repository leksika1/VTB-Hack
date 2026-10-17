# syntax=docker/dockerfile:1
# Заглушка, чтобы проверить деплой. Заменить на сборку реального бэкенда (порт оставить 8000).
FROM nginx:1.27-alpine

COPY <<'EOF' /etc/nginx/conf.d/default.conf
server {
    listen 8000;

    location = /health {
        default_type application/json;
        return 200 '{"status":"ok","service":"backend"}';
    }

    location / {
        default_type application/json;
        return 200 '{"message":"backend stub"}';
    }
}
EOF

EXPOSE 8000
