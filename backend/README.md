# Backend · API del parqueadero

FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL 16. Ver la arquitectura en [`docs/ROADMAP.md`](../docs/ROADMAP.md).

## Puesta en marcha local

```bash
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env            # y completa JWT_SECRET y SEED_ADMIN_PASSWORD

docker compose up -d db         # o usa un PostgreSQL propio y ajusta DATABASE_URL
alembic upgrade head            # crea el esquema
python -m app.db.seed --demo    # administrador inicial + datos ficticios
uvicorn app.main:app --reload   # http://localhost:8000/docs
```

## Pruebas

Las pruebas necesitan un PostgreSQL (no SQLite: usan índices parciales, JSONB y triggers).
Por defecto usan `postgresql+psycopg://postgres@127.0.0.1:5432/parqueadero_test`; cambia la
URL con `TEST_DATABASE_URL`. Cada ejecución reconstruye el esquema con las migraciones reales.

```bash
createdb parqueadero_test
pytest
ruff check . && ruff format --check .
alembic check                   # falla si un modelo cambió sin migración
```

## Estructura

```
app/
├── main.py                 # create_app(): CORS, cabeceras de seguridad, /api/v1
├── core/                   # config (variables de entorno), security (Argon2id, JWT), deps
├── db/                     # Base y mixins, sesión, registro de modelos, seed
└── modules/<modulo>/       # models.py · schemas.py · service.py · router.py
alembic/versions/           # migraciones versionadas
tests/
```

## Autenticación (B-03)

| Endpoint | Cuerpo | Respuesta |
|---|---|---|
| `POST /api/v1/auth/login` | `{email, password}` | `200 {access_token, refresh_token, token_type, expires_in, usuario}` · `401` · `429` con `Retry-After` |
| `POST /api/v1/auth/refresh` | `{refresh_token}` | `200` igual que login (nuevo par de tokens) · `401` |
| `POST /api/v1/auth/logout` | `{refresh_token}` | `204` (idempotente) |
| `GET /api/v1/auth/me` | — (`Authorization: Bearer <access>`) | `200 usuario` · `401` |

- Contraseñas con **Argon2id**; se re-hashean solas si cambian los parámetros.
- **Access token**: JWT HS256 de 15 min con `iss`, `aud`, `typ=access`. El rol se valida
  contra la BD en cada petición, así que desactivar un usuario o cambiarle el rol es inmediato.
- **Refresh token**: opaco, 14 días, **rotativo**. En la BD solo se guarda su SHA-256. Si se
  presenta un refresh ya usado, se revoca toda la sesión (detección de robo). El frontend debe
  serializar las llamadas a `/auth/refresh` (no lanzar dos a la vez con el mismo token).
- **Límite de intentos**: 5 fallos por email o 20 por IP en 5 min → `429`. Configurable.
- Errores de login genéricos: no revelan si el email existe; el tiempo de respuesta tampoco.
- Toda sesión (login, fallo, logout, reutilización de refresh) queda en `auditoria`.

Dependencias para los demás módulos (en `app/core/deps.py`):

```python
from app.core.deps import get_usuario_actual, requiere_rol, requiere_token_servicio
from app.modules.usuarios.models import Rol


@router.get("/usuarios")
def listar(admin: Usuario = Depends(requiere_rol(Rol.ADMIN))): ...


@router.post("/internal/jobs/notificaciones", dependencies=[Depends(requiere_token_servicio)])
def job(): ...
```

Para auditar una escritura, llama a `app.modules.auditoria.service.registrar(db, ...)` antes del
`commit()`, en la misma transacción.

## Esquema de datos (B-02)

Tablas: `usuarios`, `clientes`, `motos`, `planes`, `membresias`, `pagos`, `estancias`,
`notificaciones`, `auditoria`, `refresh_tokens`, `intentos_login`.

Reglas que garantiza la propia base de datos:

- Una moto tiene como máximo **una estancia abierta** (índice único parcial `salida_en IS NULL`),
  y una salida siempre tiene operador.
- Placa normalizada (`^[A-Z0-9]{4,10}$`) y única entre motos no eliminadas; documento de
  cliente único entre clientes no eliminados (borrado lógico con `eliminado_en`).
- Un cliente tiene como máximo **una membresía no cancelada** (se renueva con pagos, D-7).
- Montos y precios en **COP enteros** (D-6); `monto > 0`, `precio >= 0`, fechas ordenadas.
- Notificaciones únicas por `(membresia, tipo, canal, fecha)`, para que el job sea idempotente.
- `auditoria` es de solo inserción (un trigger bloquea `UPDATE` y `DELETE`).
- Emails de usuario únicos sin distinguir mayúsculas.

## Despliegue

La imagen (`Dockerfile`) aplica `alembic upgrade head` al arrancar y sirve en `$PORT` con
`--proxy-headers`. Variables obligatorias: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`
(dominio de GitHub Pages) y `ENTORNO=produccion`. En producción `/docs` está desactivado.
