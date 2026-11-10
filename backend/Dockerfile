# Imagen de producción de la API (B-09). Render la construye desde `backend/`.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Certificados raíz del sistema: la conexión TLS a Neon se verifica contra ellos.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml ./
COPY app ./app
RUN pip install .

COPY alembic.ini ./
COPY alembic ./alembic
COPY scripts/arranque.sh ./scripts/arranque.sh

# Usuario sin privilegios.
RUN useradd --create-home --uid 10001 api && chmod +x scripts/arranque.sh
USER api

ENV PORT=8000
EXPOSE 8000

CMD ["./scripts/arranque.sh"]
