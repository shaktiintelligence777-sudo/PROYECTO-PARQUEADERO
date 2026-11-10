# B-09 · Despliegue del backend y la base de datos

| Campo | Valor |
|---|---|
| Estado | en revisión |
| Línea | B (fullstack) |
| Asignado a | Opus |
| Revisa | Fable |
| Depende de | B-03 |
| Rama | `feat/B-09-despliegue` |

## 1. Objetivo

Tener el backend funcionando en internet con HTTPS, conectado a un PostgreSQL gestionado con TLS y copias de seguridad, y con un procedimiento repetible para desplegar y migrar.

## 2. Contexto

- `docs/dominio.md` D-1 (Render + Neon, confirmada por el dueño).
- `docs/ROADMAP.md` sección 2.6.

## 3. Alcance

**Archivos que crea o modifica:**

- `render.yaml` — servicio web Docker desde `backend/`, plan gratuito, `healthCheckPath: /api/v1/salud`, variables declaradas con `sync: false`.
- `backend/scripts/arranque.sh` — `alembic upgrade head` y luego `uvicorn`.
- `backend/app/db/crear_admin.py` — comando `python -m app.db.crear_admin --email … --nombre …` que pide la contraseña por entrada oculta.
- `docs/operacion.md` — guía paso a paso: crear la base en Neon, crear el servicio en Render, variables, primer admin, migraciones, restauración de copias, rotación de secretos.
- `backend/tests/test_crear_admin.py`.

**Puede tocar:**

- `backend/Dockerfile`, `backend/app/db/sesion.py` (TLS y tamaño del pool), `backend/.env.example`, `README.md`.

**Fuera de alcance:**

- Dominio propio. Monitorización avanzada. Cambiar el frontend a modo `live` (C-01).

## 4. Diseño

### 4.1 Interfaz

Variables en producción: `ENTORNO=produccion`, `DATABASE_URL`, `JWT_SECRETO`, `SERVICE_TOKEN`, `CORS_ORIGENES=https://shaktiintelligence777-sudo.github.io`, y las de correo de B-07.

### 4.2 Datos

Base PostgreSQL 16 en Neon, región más cercana a Colombia disponible.

### 4.3 Reglas de negocio

1. En `produccion` la conexión a la base exige TLS con verificación de certificado; el arranque falla si la URL lo desactiva.
2. Las migraciones se aplican al arrancar, antes de aceptar tráfico. Si fallan, el despliegue falla y sigue sirviendo la versión anterior.
3. La semilla de demostración **nunca** se ejecuta en producción (ya lo impide B-02).
4. `crear_admin` es la única forma de crear el primer usuario; es idempotente por email (si existe, no lo modifica y lo indica) y exige contraseña de 12 caracteres o más.
5. El pool de conexiones se ajusta al límite del plan gratuito (máximo 5) y usa `pool_pre_ping`.
6. `docs/operacion.md` incluye una prueba de restauración: cómo recuperar la base a un punto anterior en Neon y comprobarlo.

### 4.4 Seguridad

- Ningún secreto en el repositorio ni en `render.yaml`.
- `JWT_SECRETO` y `SERVICE_TOKEN` se generan con `openssl rand -base64 48`; la guía lo indica.
- `/docs` y `/openapi.json` desactivados en producción (B-01).
- El usuario de base de datos de la aplicación no es superusuario.

## 5. Criterios de aceptación

- [ ] **CA-1** Dado el servicio desplegado, cuando se pide `GET https://<host>/api/v1/salud`, entonces responde 200 por HTTPS.
- [ ] **CA-2** Dado el servicio desplegado, cuando se pide `/docs`, entonces responde 404.
- [ ] **CA-3** Dado un preflight desde `https://shaktiintelligence777-sudo.github.io`, entonces se permite; desde otro origen, no.
- [ ] **CA-4** Dado `ENTORNO=produccion` y una `DATABASE_URL` con `sslmode=disable`, cuando arranca, entonces falla con un mensaje claro.
- [ ] **CA-5** Dado un despliegue nuevo con una migración pendiente, entonces queda aplicada antes de que el servicio responda.
- [ ] **CA-6** Dado `crear_admin` con un email nuevo, entonces crea un admin activo con hash Argon2id; ejecutado otra vez con el mismo email, no cambia nada; con contraseña de 8 caracteres, la rechaza.
- [ ] **CA-7** Dado el admin creado, cuando inicia sesión contra el servicio desplegado, entonces recibe una sesión válida.
- [ ] **CA-8** Dado el repositorio, cuando se ejecuta el escaneo de secretos, entonces no encuentra ninguno.
- [ ] **CA-9** Dada `docs/operacion.md`, entonces una persona sin contexto puede desplegar desde cero siguiéndola (lo valida Fable en la revisión).

## 6. Pruebas requeridas

- Automatizadas: CA-4 y CA-6.
- CA-1 a CA-3, CA-5 y CA-7 se verifican sobre el entorno desplegado y se documentan en el PR con las órdenes usadas y sus respuestas.

## 7. Notas para el constructor

- Crear las cuentas de Render y Neon y cargar los secretos son pasos del dueño del proyecto. Deja en el PR la lista exacta de lo que debe hacer y espera su confirmación antes de dar la spec por terminada.
- El plan gratuito de Render duerme el servicio tras un rato sin tráfico; el primer acceso tarda. Documenta este límite en `docs/operacion.md`.
- Si el dueño cambia la decisión D-1, solo cambian `render.yaml` y la guía.

## 8. Preguntas abiertas

- **Archivos fuera del alcance (para Fable).** Neon entrega URLs con `sslmode=require&channel_binding=require`, que asyncpg no acepta, y las migraciones crean su propio motor. Para que `alembic upgrade head` use las mismas reglas de TLS que la API toqué `backend/alembic/env.py` (usa `crear_motor` de `app/db/sesion.py`). Las pruebas de CA-4 están en `backend/tests/test_sesion.py`. Se retiró `backend/docker-entrypoint.sh` (lo sustituye `scripts/arranque.sh`).
- **Pendiente del dueño.** CA-1, CA-2, CA-3, CA-5 y CA-7 se verifican cuando el dueño cree las cuentas de Neon y Render y cargue los secretos (`docs/operacion.md`, secciones 1 a 5).
