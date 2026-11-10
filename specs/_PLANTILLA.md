# <ID> · <Nombre del módulo>

> Copia este archivo como `specs/<ID>-<slug>.md` (ej. `specs/B-04-accesos-backend.md`).
> Lo escribe **Fable**. Lo implementa el agente indicado en “Asignado a”.

| Campo | Valor |
|---|---|
| Estado | borrador · lista · en construcción · en revisión · hecha · bloqueada |
| Línea | Fase 0 · A (demo) · B (fullstack) · C (convergencia) |
| Asignado a | Sonnet · Opus |
| Revisa | Opus · Fable |
| Depende de | IDs de specs que deben estar `hecha` |
| Rama | `feat/<ID>-<slug>` |

## 1. Objetivo

Una o dos frases: qué problema resuelve este módulo y para quién.

## 2. Contexto

- Enlaces a las secciones relevantes de `docs/ROADMAP.md`, `docs/dominio.md`, `docs/ui/*`.
- Endpoints o esquemas de `contracts/openapi.yaml` que usa o implementa.

## 3. Alcance

**Archivos que crea o modifica:**

- `ruta/archivo.ext` — qué contiene

**Puede tocar (solo si es necesario):**

- `ruta/archivo.ext` — motivo

**Fuera de alcance:**

- Lo que explícitamente NO se hace en esta spec.

## 4. Diseño

### 4.1 Interfaz (API / componentes)

Firmas, endpoints, props, eventos. Para backend: método, ruta, cuerpo, respuestas y códigos de error. Para UI: wireframe o enlace, estados (carga, vacío, error, éxito) y textos exactos.

### 4.2 Datos

Tablas, columnas, índices o estructuras involucradas.

### 4.3 Reglas de negocio

Lista numerada. Cada regla debe ser verificable.

1. …

### 4.4 Seguridad

Qué rol puede hacer qué; validaciones; datos sensibles; qué se audita.

## 5. Criterios de aceptación

Formato *Dado / Cuando / Entonces*. Cada criterio necesita al menos una prueba automatizada.

- [ ] **CA-1** Dado …, cuando …, entonces …
- [ ] **CA-2** …

## 6. Pruebas requeridas

- Unitarias: …
- Integración / API: …
- UI / e2e: …

## 7. Notas para el constructor

Pistas de implementación, librerías a usar, patrones a copiar de otro módulo, errores a evitar.

## 8. Preguntas abiertas

Las agrega el constructor si algo no está claro. Si hay alguna sin responder, la spec queda `bloqueada` hasta que Fable la resuelva.

- …
