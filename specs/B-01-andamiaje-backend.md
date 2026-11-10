# B-01 · Andamiaje del backend

| Campo | Valor |
|---|---|
| Estado | lista |
| Línea | B (fullstack) |
| Asignado a | Sonnet |
| Revisa | Opus |
| Depende de | F-05 |
| Rama | `feat/B-01-andamiaje-backend` |

## 1. Objetivo

Dejar un proyecto FastAPI que arranca, se prueba y pasa CI, con las piezas transversales (configuración, errores, reloj, sesión de base de datos) que todos los módulos siguientes reutilizan.

## 2. Contexto

- `docs/ROADMAP.md` secciones 2.2 y 2.3; `CLAUDE.md` sección “Backend”.
- Contrato: `GET /salud`, esquema `Error` y catálogo `CodigoError`.

## 3. Alcance

**Archivos que crea o modifica:**

- `backend/pyproject.toml` — dependencias y configuración de `ruff`, `mypy` y `pytest`.
- `backend/app/main.py` — fábrica `crear_app()`, CORS, prefijo `/api/v1`, manejadores de error.
- `backend/app/core/config.py` — `Ajustes` (pydantic-settings).
- `backend/app/core/errores.py` — `ErrorApi` y manejadores globales.
- `backend/app/core/reloj.py` — `ahora()` y `hoy()`.
- `backend/app/db/sesion.py` — motor asíncrono y dependencia `obtener_sesion`.
- `backend/app/db/base.py` — `Base` declarativa y mixins `ConId`, `ConFechas`.
- `backend/app/modules/salud/router.py` — `GET /salud`.
- `backend/alembic.ini`, `backend/alembic/env.py` — Alembic asíncrono, sin migraciones todavía.
- `backend/tests/conftest.py`, `backend/tests/test_salud.py`, `backend/tests/test_errores.py`.
- `backend/Dockerfile`, `backend/.env.example`, `backend/README.md`.
- `docker-compose.yml` — PostgreSQL 16 para desarrollo y pruebas.
- `.github/workflows/ci.yml` — job `backend`.
- `.gitignore`.

**Fuera de alcance:**

- Tablas, modelos y migraciones (B-02). Autenticación (B-03). Despliegue (B-09).

## 4. Diseño

### 4.1 Interfaz

**Variables de entorno (`Ajustes`)**

| Variable | Por defecto | Notas |
|---|---|---|
| `ENTORNO` | `desarrollo` | `desarrollo` · `pruebas` · `produccion` |
| `DATABASE_URL` | — (obligatoria) | `postgresql+asyncpg://…`. Se acepta `postgres://` y `postgresql://` y se convierte. |
| `JWT_SECRETO` | — (obligatoria) | Mínimo 32 caracteres; el arranque falla si es más corto. |
| `SERVICE_TOKEN` | — (obligatoria) | Mínimo 32 caracteres. |
| `CORS_ORIGENES` | `http://localhost:5173` | Lista separada por comas. Nunca `*`. |
| `ZONA_HORARIA` | `America/Bogota` | |

**`ErrorApi(codigo: str, mensaje: str, status: int, detalles: list | None = None)`**. Manejadores globales:

| Origen | Respuesta |
|---|---|
| `ErrorApi` | `status` indicado, cuerpo `Error` |
| `RequestValidationError` | 422, `codigo: validacion`, `detalles` con `campo` (ruta con puntos, sin el prefijo `body`/`query`) y `mensaje` en español |
| Ruta inexistente | 404, `no_encontrado` |
| Excepción no controlada | 500, `error_interno`, mensaje genérico; la traza va al log, no a la respuesta |

**`reloj.py`**: `ahora() -> datetime` (UTC, con zona) y `hoy() -> date` (en `ZONA_HORARIA`). Las pruebas los fijan con la fixture `reloj_fijo`.

**`GET /api/v1/salud`** → `200 {"estado": "ok", "version": "<versión del paquete>"}`. No toca la base de datos.

### 4.2 Datos

Ninguno. `Base` usa la convención de nombres de restricciones de SQLAlchemy (`pk_`, `fk_`, `uq_`, `ix_`, `ck_`) para que Alembic genere nombres estables. `ConId`: `id uuid` con `server_default=gen_random_uuid()`. `ConFechas`: `creado_en` y `actualizado_en` (`timestamptz`, UTC).

### 4.3 Reglas de negocio

1. La aplicación no arranca si falta una variable obligatoria o un secreto es demasiado corto.
2. Toda respuesta de error, sin excepción, cumple el esquema `Error`.
3. La documentación interactiva (`/docs`, `/openapi.json`) se desactiva cuando `ENTORNO=produccion`.

### 4.4 Seguridad

- CORS solo para `CORS_ORIGENES`, métodos `GET, POST, PUT, PATCH, DELETE, OPTIONS`, cabeceras `Authorization, Content-Type`, sin credenciales.
- El contenedor corre con un usuario sin privilegios.
- Los logs nunca incluyen cabeceras `Authorization` ni cuerpos de petición.

## 5. Criterios de aceptación

- [ ] **CA-1** Dado el servicio en marcha, cuando se pide `GET /api/v1/salud`, entonces responde 200 con `estado: "ok"`.
- [ ] **CA-2** Dada una ruta inexistente, cuando se pide, entonces responde 404 con `error.codigo = "no_encontrado"`.
- [ ] **CA-3** Dado un endpoint de prueba que lanza `ErrorApi("moto_ya_dentro", …, 409)`, cuando se invoca, entonces la respuesta es 409 con ese código en el esquema `Error`.
- [ ] **CA-4** Dado un endpoint de prueba con un cuerpo inválido, cuando se invoca, entonces responde 422 con `codigo: "validacion"` y `detalles[0].campo` igual al nombre del campo.
- [ ] **CA-5** Dado un endpoint de prueba que lanza una excepción cualquiera, cuando se invoca, entonces responde 500 con `error_interno` y sin traza en el cuerpo.
- [ ] **CA-6** Dado `JWT_SECRETO` de menos de 32 caracteres, cuando se construyen los `Ajustes`, entonces falla con un error claro.
- [ ] **CA-7** Dado `reloj_fijo` en `2026-11-11T03:30:00Z`, cuando se llama `hoy()`, entonces devuelve `2026-11-10` (Bogotá va cinco horas atrás).
- [ ] **CA-8** Dada una petición con `Origin` no permitido, cuando llega un preflight, entonces la respuesta no incluye `Access-Control-Allow-Origin`.
- [ ] **CA-9** En CI, `ruff check`, `ruff format --check`, `mypy app` y `pytest` pasan con un servicio PostgreSQL 16.

## 6. Pruebas requeridas

- Unitarias: `Ajustes`, `reloj`.
- Integración / API: salud, los cuatro manejadores de error, CORS.

## 7. Notas para el constructor

- Dependencias: `fastapi`, `uvicorn[standard]`, `pydantic-settings`, `sqlalchemy[asyncio]`, `asyncpg`, `alembic`; desarrollo: `pytest`, `pytest-asyncio`, `httpx`, `ruff`, `mypy`.
- `conftest.py` debe dejar lista la fixture `cliente` (`httpx.AsyncClient` con `ASGITransport`) y `sesion` (transacción que se revierte al final de cada prueba). B-02 y B-03 las reutilizan.
- La imagen Docker escucha en `$PORT` (Render lo inyecta), por defecto 8000.

## 8. Preguntas abiertas

- …
