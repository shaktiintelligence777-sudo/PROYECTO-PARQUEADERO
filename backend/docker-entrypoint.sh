#!/bin/sh
# Aplica migraciones pendientes y arranca la API en $PORT (Render lo inyecta).
set -e
alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
