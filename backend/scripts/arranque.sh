#!/bin/sh
# Arranque del contenedor (B-09): primero las migraciones, luego la API.
# Si `alembic upgrade head` falla, el contenedor termina sin abrir el puerto: Render marca el
# despliegue como fallido y sigue sirviendo la versión anterior.
set -eu
cd "$(dirname "$0")/.."
alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers \
    --forwarded-allow-ips "*" --no-server-header
