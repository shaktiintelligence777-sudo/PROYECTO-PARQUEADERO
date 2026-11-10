# Backend · API del parqueadero

FastAPI + SQLAlchemy 2 (asíncrono, `asyncpg`) + Alembic + PostgreSQL 16. Implementa las specs
`B-01`, `B-02` y `B-03` contra `contracts/openapi.yaml` y `docs/dominio.md`.

## Puesta en marcha local

```bash
docker compose up -d db              # desde la raíz: PostgreSQL 16 con las bases parqueadero y parqueadero_test
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env                 # y completa JWT_SECRETO y SERVICE_TOKEN
alembic upgrade head                 # crea el esquema
python -m app.db.semilla             # datos ficticios (demo@parqueadero.app / demo1234)
uvicorn app.main:app --reload        # http://localhost:8000/docs
```

`python -m app.db.semilla --reiniciar` vacía las tablas y vuelve a sembrar. La semilla se niega
a correr con `ENTORNO=produccion`.

## Pruebas y chequeos

```bash
pytest                               # contra PostgreSQL real (TEST_DATABASE_URL)
ruff check . && ruff format --check .
mypy app
```

Por defecto las pruebas usan `postgresql+asyncpg://postgres@127.0.0.1:5432/parqueadero_test`.
Cada ejecución reconstruye el esquema con las migraciones reales y verifica `alembic check`.
Cada prueba corre dentro de una transacción que se revierte. Los nombres de las pruebas citan el
criterio de aceptación (`test_ca4_...`).

## Estructura

```
app/
├── main.py                  # crear_app(): CORS, cabeceras de seguridad, manejadores, /api/v1
├── core/
│   ├── config.py            # Ajustes (variables de entorno)
│   ├── errores.py           # ErrorApi y manejadores → {"error": {codigo, mensaje, detalles}}
│   ├── reloj.py             # ahora() y hoy() (America/Bogota); las pruebas lo fijan
│   ├── seguridad.py         # Argon2id, JWT, refresh tokens
│   ├── dependencias.py      # usuario_actual, requiere_rol, requiere_token_servicio, ip_cliente
│   ├── auditoria.py         # registrar_auditoria (sanea claves sensibles)
│   └── placas.py            # normalizar_placa (RN-01)
├── db/                      # Base y mixins, sesión, tipos ENUM, registro de modelos, semilla
└── modules/<modulo>/        # models.py · schemas.py · service.py · router.py
alembic/versions/            # 0001: esquema inicial
tests/                       # B-01 y B-02 en la raíz, B-03 en tests/auth/
```

## Para los módulos siguientes

```python
from app.core.dependencias import requiere_rol, requiere_token_servicio, usuario_actual
from app.core.errores import ErrorApi
from app.core.auditoria import registrar_auditoria
from app.core import reloj

@router.post("/planes", dependencies=[Depends(requiere_rol("admin"))])
async def crear_plan(...):
    ...
    raise ErrorApi("nombre_duplicado", "Ya existe un plan con ese nombre.", 409)
```

- Toda escritura llama a `registrar_auditoria(...)` antes del `commit()`, en la misma transacción.
- “Hoy” y “ahora” solo desde `app.core.reloj`.
- Fixtures disponibles en `tests/conftest.py`: `sesion`, `cliente` (`httpx.AsyncClient` con base
  `/api/v1`), `reloj_fijo`, `crear_usuario`, `usuario_admin`, `usuario_operador`,
  `cabeceras_admin`, `cabeceras_operador`.

## Seguridad (resumen)

- Contraseñas con Argon2id; se re-hashean solas si cambian los parámetros.
- JWT HS256 de 15 min con algoritmo fijo (rechaza `alg: none`). El rol y el estado `activo` se
  leen de la base en cada petición.
- Refresh opaco de 30 días, de un solo uso, guardado como SHA-256. Reutilizar uno ya usado
  revoca todas las sesiones del usuario (CB-14). La rotación bloquea la fila (`FOR UPDATE`):
  dos refresh simultáneos con el mismo token → uno gana y el otro cuenta como reutilización, así
  que el frontend debe serializar sus llamadas a `/auth/refresh`.
- Límite de intentos en base de datos: 5 fallos por email (desde su último acierto) o 20 por IP
  en 15 minutos → `429` con `Retry-After`.
- La tabla `auditoria` es de solo inserción (un trigger bloquea UPDATE y DELETE).

## Despliegue

La imagen aplica `alembic upgrade head` al arrancar y escucha en `$PORT`. Variables
obligatorias: `DATABASE_URL`, `JWT_SECRETO`, `SERVICE_TOKEN`, `CORS_ORIGENES` y
`ENTORNO=produccion` (que además desactiva `/docs` y `/openapi.json`).
