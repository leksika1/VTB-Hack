# syntax=docker/dockerfile:1
# Заглушка, чтобы проверить деплой. Заменить на сборку реального фронтенда (порт оставить 80).
FROM nginx:1.27-alpine

COPY <<'EOF' /usr/share/nginx/html/index.html
<!doctype html>
<html lang="ru">
<head><meta charset="utf-8"><title>VTB-Hack</title></head>
<body><h1>VTB-Hack: фронтенд скоро будет здесь</h1></body>
</html>
EOF

EXPOSE 80
