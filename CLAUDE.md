# Reglas para los agentes constructores

Este archivo lo lee automáticamente todo agente que trabaje en el repositorio. Entregable **F-05**.

## Antes de escribir código

1. Lee tu spec en `specs/<ID>-<slug>.md` completa.
2. Lee lo que la spec enlaza de `docs/dominio.md`, `contracts/openapi.yaml` y `docs/ui/`.
3. Comprueba que las specs de “Depende de” estén `hecha`. Si no lo están, detente y avisa.

## Fuentes de verdad, en orden

1. `contracts/openapi.yaml`: forma exacta de peticiones, respuestas y códigos de error.
2. `docs/dominio.md`: reglas de negocio (`RN-xx`), permisos y casos borde.
3. `docs/ui/design-system.md` y `docs/ui/pantallas.md`: aspecto, textos y estados de la UI.
4. Tu spec: alcance, archivos y criterios de aceptación.

Si dos fuentes se contradicen, **no elijas tú**: anótalo en “Preguntas abiertas” de la spec, márcala `bloqueada` y detente.

## Reglas

- **No inventes.** Lo que no esté especificado se pregunta (sección 8 de la spec), no se supone.
- **No modifiques** `contracts/`, `docs/` ni `specs/` salvo el campo “Estado” y la sección “Preguntas abiertas” de tu propia spec, y la columna “Estado” del catálogo en `docs/ROADMAP.md`. Esos archivos son de Fable.
- **No toques archivos fuera del “Alcance”** de tu spec, salvo los listados en “Puede tocar”.
- **Un PR = una spec.** Rama `feat/<ID>-<slug>`. Título del PR: `<ID> · <nombre>`.
- **Cada criterio de aceptación tiene al menos una prueba automatizada**, y el nombre de la prueba cita el criterio (`test_ca3_...` o `it("CA-3 ...")`).
- **CI en verde** antes de pedir revisión: lint, tipos y pruebas.
- **Sin secretos ni datos reales** en el repositorio. Todo secreto entra por variables de entorno; se documenta su nombre en `.env.example`, nunca su valor.
- **Sin `TODO`** sin issue enlazado.
- Código, comentarios, commits y PRs **en español**. Los nombres del dominio se escriben como en el contrato (`membresia`, `fecha_vencimiento`), sin tildes ni eñes en identificadores.

## Backend (`backend/`)

- Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.0 (estilo `Mapped[]`, sesión asíncrona con `asyncpg`), Alembic.
- Cada módulo vive en `app/modules/<modulo>/` con `models.py`, `schemas.py`, `service.py`, `router.py`. La lógica va en `service.py`; el router solo valida, llama y responde.
- Los esquemas Pydantic replican **exactamente** los de `contracts/openapi.yaml` (mismos nombres y campos). Las entradas usan `extra="forbid"`.
- Solo consultas parametrizadas con SQLAlchemy. Prohibido construir SQL con cadenas.
- Los errores se lanzan con `ErrorApi(codigo, mensaje, status)` de `app/core/errores.py`; un manejador global los convierte al esquema `Error`. No uses `HTTPException` directamente.
- “Hoy” y “ahora” se obtienen **solo** de `app/core/reloj.py` (para poder fijarlos en pruebas). Nunca `date.today()` ni `datetime.now()` sueltos.
- Toda escritura llama a `registrar_auditoria(...)` dentro de la misma transacción.
- Todo cambio de esquema es una migración Alembic nueva. No se editan migraciones ya fusionadas.
- Pruebas con `pytest` + `httpx.AsyncClient` contra PostgreSQL real (servicio en CI, `docker compose` en local). No se usa SQLite.
- Lint y formato: `ruff check` y `ruff format`. Tipos: `mypy app`.

## Frontend (`frontend/`)

- React 18, TypeScript estricto, Vite, Tailwind, React Router (`HashRouter`), TanStack Query, react-hook-form + zod.
- Las pantallas **nunca** llaman a `fetch` ni a `localStorage` directamente: usan los hooks de `src/api/`, que hablan con la interfaz `ApiClient`. Así el mismo código sirve para el modo `mock` y el modo `live`.
- Los tipos de `src/api/tipos.ts` se generan desde el contrato (`npm run gen:api`). No se editan a mano.
- Solo se usan componentes de `src/ui/` y tokens del design system. Nada de colores, tamaños o sombras escritos a mano en las pantallas.
- Los textos visibles son los de `docs/ui/pantallas.md`, en español, tal cual.
- Diseño móvil primero: toda pantalla debe funcionar a 360 px de ancho.
- Accesibilidad: todo control tiene etiqueta, el foco es visible y se puede operar con teclado.
- Pruebas con Vitest + Testing Library. Lint: `eslint`. Tipos: `tsc --noEmit`.

## Commits

Mensajes en imperativo y con el ID de la spec: `B-03: agregar rotación de refresh tokens`.

## Al terminar

1. Marca los criterios de aceptación cumplidos en la descripción del PR.
2. Cambia el estado de la spec a `en revisión` y el del catálogo en `docs/ROADMAP.md` a 👀.
3. Pide revisión según la spec (“Revisa”).
