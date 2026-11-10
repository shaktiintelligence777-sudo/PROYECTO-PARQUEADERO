# B-02 · Esquema de base de datos, migraciones y semilla

| Campo | Valor |
|---|---|
| Estado | lista |
| Línea | B (fullstack) |
| Asignado a | Opus |
| Revisa | Fable |
| Depende de | F-01, B-01 |
| Rama | `feat/B-02-esquema-bd` |

## 1. Objetivo

Crear todas las tablas del sistema con sus restricciones, de forma que las reglas críticas (una estancia abierta por moto, una membresía vigente por cliente, pagos coherentes) las garantice la base de datos y no solo el código.

## 2. Contexto

- `docs/dominio.md` completo, en especial D-8, D-9, D-10, D-12 y la sección 6 (semilla).
- `docs/ROADMAP.md` sección 2.4. **Diferencia intencional:** `membresias` no tiene columna `estado` (D-8).
- Los nombres de columnas coinciden con los campos de `contracts/openapi.yaml`.

## 3. Alcance

**Archivos que crea o modifica:**

- `backend/app/modules/<modulo>/models.py` para `auth` (usuarios, refresh_tokens, intentos_login), `clientes`, `motos`, `planes`, `membresias`, `pagos`, `accesos` (estancias), `notificaciones`, `configuracion`, `auditoria`.
- `backend/app/db/modelos.py` — importa todos los modelos para Alembic.
- `backend/alembic/versions/0001_esquema_inicial.py` — una sola migración inicial.
- `backend/app/core/auditoria.py` — `registrar_auditoria(sesion, *, usuario_id, accion, entidad, entidad_id, datos, ip)`.
- `backend/app/core/placas.py` — `normalizar_placa(texto) -> str` (RN-01; lanza `ValueError` si no cumple).
- `backend/app/db/semilla.py` — comando `python -m app.db.semilla`.
- `backend/tests/test_esquema.py`, `backend/tests/test_semilla.py`, `backend/tests/test_placas.py`.

**Puede tocar:**

- `backend/tests/conftest.py` — para aplicar migraciones antes de las pruebas.
- `backend/pyproject.toml` — añadir `argon2-cffi` (la semilla necesita crear hashes).

**Fuera de alcance:**

- Routers, servicios y esquemas Pydantic de cualquier módulo.

## 4. Diseño

### 4.1 Interfaz

Sin endpoints. Comandos: `alembic upgrade head`, `alembic downgrade base`, `python -m app.db.semilla [--reiniciar]`.

### 4.2 Datos

Convenciones: PK `id uuid default gen_random_uuid()` salvo donde se indique; instantes `timestamptz`; dinero `integer`; textos `text` con `CHECK` de longitud cuando el contrato fija un máximo. Extensiones: `pgcrypto` (si la versión lo requiere para `gen_random_uuid`) y `unaccent`.

Tipos enumerados (ENUM de PostgreSQL): `rol_usuario (admin, operador)`, `metodo_pago (efectivo, transferencia, otro)`, `tipo_notificacion (recordatorio, vencida)`, `canal_notificacion (email, whatsapp)`, `estado_notificacion (pendiente, enviada, fallida, cancelada)`.

**`usuarios`**

| Columna | Tipo | Restricciones |
|---|---|---|
| id | uuid | PK |
| email | text | NOT NULL; índice único sobre `lower(email)` |
| password_hash | text | NOT NULL |
| nombre | text | NOT NULL |
| rol | rol_usuario | NOT NULL |
| activo | boolean | NOT NULL default true |
| creado_en, actualizado_en | timestamptz | NOT NULL |

**`refresh_tokens`**

| Columna | Tipo | Restricciones |
|---|---|---|
| id | uuid | PK |
| usuario_id | uuid | FK usuarios, NOT NULL, índice |
| token_hash | text | NOT NULL, UNIQUE (SHA-256 en hexadecimal; el token nunca se guarda en claro) |
| familia_id | uuid | NOT NULL, índice (misma familia = misma cadena de rotaciones) |
| expira_en | timestamptz | NOT NULL |
| usado_en | timestamptz | NULL |
| revocado_en | timestamptz | NULL |
| creado_en | timestamptz | NOT NULL |

**`intentos_login`** (para el límite de intentos, RN-75)

| Columna | Tipo | Restricciones |
|---|---|---|
| id | bigint | PK identidad |
| email | text | NOT NULL (en minúsculas) |
| ip | inet | NOT NULL |
| exitoso | boolean | NOT NULL |
| creado_en | timestamptz | NOT NULL; índices `(email, creado_en)` e `(ip, creado_en)` |

**`clientes`**

| Columna | Tipo | Restricciones |
|---|---|---|
| id | uuid | PK |
| nombre | text | NOT NULL |
| documento | text | NOT NULL, UNIQUE |
| telefono | text | NOT NULL |
| email | text | NULL |
| notas | text | NULL |
| activo | boolean | NOT NULL default true |
| creado_en, actualizado_en | timestamptz | NOT NULL |

Índice funcional sobre `lower(unaccent(nombre))` para la búsqueda (requiere una función envoltorio `IMMUTABLE` de `unaccent`).

**`motos`**

| Columna | Tipo | Restricciones |
|---|---|---|
| id | uuid | PK |
| cliente_id | uuid | FK clientes, NOT NULL, índice |
| placa | text | NOT NULL, UNIQUE, `CHECK (placa ~ '^[A-Z0-9]{4,7}$')` |
| marca, color | text | NULL |
| activo | boolean | NOT NULL default true |
| creado_en, actualizado_en | timestamptz | NOT NULL |

**`planes`**

| Columna | Tipo | Restricciones |
|---|---|---|
| id | uuid | PK |
| nombre | text | NOT NULL; índice único parcial sobre `lower(nombre)` `WHERE activo` |
| duracion_dias | integer | NOT NULL, `CHECK BETWEEN 1 AND 366` |
| precio | integer | NOT NULL, `CHECK > 0` |
| activo | boolean | NOT NULL default true |
| creado_en, actualizado_en | timestamptz | NOT NULL |

**`membresias`**

| Columna | Tipo | Restricciones |
|---|---|---|
| id | uuid | PK |
| cliente_id | uuid | FK clientes, NOT NULL |
| plan_id | uuid | FK planes, NOT NULL |
| fecha_inicio | date | NOT NULL |
| fecha_vencimiento | date | NOT NULL, `CHECK >= fecha_inicio`, índice |
| cancelada_en | timestamptz | NULL |
| cancelada_por | uuid | FK usuarios, NULL |
| motivo_cancelacion | text | NULL |
| creado_en, actualizado_en | timestamptz | NOT NULL |

- Índice **único parcial** `(cliente_id) WHERE cancelada_en IS NULL` (RN-30).
- `CHECK`: `cancelada_en`, `cancelada_por` y `motivo_cancelacion` son todos nulos o todos no nulos.

**`pagos`**

| Columna | Tipo | Restricciones |
|---|---|---|
| id | uuid | PK |
| membresia_id | uuid | FK membresias, NOT NULL, índice |
| plan_id | uuid | FK planes, NOT NULL (plan vigente al pagar) |
| monto | integer | NOT NULL, `CHECK > 0` |
| metodo | metodo_pago | NOT NULL |
| periodos | integer | NOT NULL, `CHECK BETWEEN 1 AND 12` |
| periodo_desde, periodo_hasta | date | NOT NULL, `CHECK periodo_hasta >= periodo_desde` |
| vencimiento_anterior | date | NULL (nulo solo en el pago inicial) |
| nota | text | NULL |
| registrado_por | uuid | FK usuarios, NOT NULL |
| creado_en | timestamptz | NOT NULL, índice |
| anulado_en | timestamptz | NULL |
| anulado_por | uuid | FK usuarios, NULL |
| motivo_anulacion | text | NULL |

`CHECK`: los tres campos de anulación son todos nulos o todos no nulos. Sin `actualizado_en`: un pago solo cambia al anularse.

**`estancias`**

| Columna | Tipo | Restricciones |
|---|---|---|
| id | uuid | PK |
| moto_id | uuid | FK motos, NOT NULL |
| entrada_en | timestamptz | NOT NULL, índice descendente |
| salida_en | timestamptz | NULL, `CHECK salida_en >= entrada_en` |
| operador_entrada | uuid | FK usuarios, NOT NULL |
| operador_salida | uuid | FK usuarios, NULL |

- Índice **único parcial** `(moto_id) WHERE salida_en IS NULL` (RN-50).
- `CHECK`: `salida_en` y `operador_salida` son ambos nulos o ambos no nulos.
- Índice `(moto_id, entrada_en DESC)`.

**`notificaciones`**

| Columna | Tipo | Restricciones |
|---|---|---|
| id | uuid | PK |
| membresia_id | uuid | FK membresias, NOT NULL |
| tipo | tipo_notificacion | NOT NULL |
| canal | canal_notificacion | NOT NULL |
| programada_para | date | NOT NULL, índice |
| estado | estado_notificacion | NOT NULL default `pendiente` |
| enviada_en | timestamptz | NULL |
| intentos | integer | NOT NULL default 0, `CHECK BETWEEN 0 AND 3` |
| error | text | NULL |
| creado_en | timestamptz | NOT NULL |

`UNIQUE (membresia_id, tipo, programada_para, canal)` (RN-61).

**`configuracion`** (una sola fila)

| Columna | Tipo | Restricciones |
|---|---|---|
| id | smallint | PK, `CHECK (id = 1)` |
| nombre_parqueadero | text | NOT NULL |
| capacidad | integer | NULL, `CHECK > 0` |
| dias_por_vencer | integer | NOT NULL default 3, `CHECK BETWEEN 0 AND 30` |
| dias_recordatorio | integer[] | NOT NULL default `{3,1,0}` |
| plantilla_recordatorio_asunto, plantilla_recordatorio_cuerpo | text | NOT NULL |
| plantilla_vencida_asunto, plantilla_vencida_cuerpo | text | NOT NULL |
| actualizado_en | timestamptz | NOT NULL |

La migración inserta la fila `id = 1` con las plantillas por defecto de la sección 7.

**`auditoria`**

| Columna | Tipo | Restricciones |
|---|---|---|
| id | bigint | PK identidad |
| usuario_id | uuid | FK usuarios, NULL (login fallido, job) |
| accion | text | NOT NULL, p. ej. `pago.registrar`, `acceso.entrada`, `auth.login_fallido` |
| entidad | text | NOT NULL |
| entidad_id | uuid | NULL |
| datos | jsonb | NOT NULL default `{}` |
| ip | inet | NULL |
| creado_en | timestamptz | NOT NULL, índice |

Índice `(entidad, entidad_id)`.

Todas las FK usan `ON DELETE RESTRICT`: nada se borra en cascada (D-12).

### 4.3 Reglas de negocio

1. RN-30 y RN-50 quedan garantizadas por índices únicos parciales.
2. RN-01 queda garantizada por el `CHECK` de `motos.placa`.
3. RN-61 queda garantizada por la restricción única de `notificaciones`.
4. La semilla es idempotente: ejecutarla dos veces no duplica datos. Con `--reiniciar` vacía las tablas y vuelve a sembrar.
5. La semilla se niega a ejecutarse si `ENTORNO=produccion`.
6. La semilla cumple la sección 6 de `docs/dominio.md` con fechas relativas a `hoy()`.

### 4.4 Seguridad

- Las contraseñas de la semilla se guardan con Argon2id; nunca en claro.
- `registrar_auditoria` descarta cualquier clave llamada `password`, `password_hash`, `token`, `access_token` o `refresh_token` dentro de `datos`, a cualquier profundidad.

## 5. Criterios de aceptación

- [ ] **CA-1** Dada una base vacía, cuando se ejecuta `alembic upgrade head`, entonces existen las 12 tablas y la fila de `configuracion`.
- [ ] **CA-2** Dada la base migrada, cuando se ejecuta `alembic downgrade base` y luego `upgrade head`, entonces ambos terminan sin error.
- [ ] **CA-3** Dados los modelos y la base migrada, cuando se ejecuta `alembic check`, entonces no detecta diferencias.
- [ ] **CA-4** Dada una moto con una estancia abierta, cuando se inserta otra estancia abierta para la misma moto, entonces la base lanza una violación de unicidad.
- [ ] **CA-5** Dada una moto con una estancia cerrada, cuando se inserta una estancia abierta, entonces se acepta.
- [ ] **CA-6** Dado un cliente con una membresía no cancelada, cuando se inserta otra no cancelada, entonces falla; si la primera está cancelada, se acepta.
- [ ] **CA-7** Dada una placa `abc12d` o `AB-12`, cuando se inserta directamente en `motos`, entonces el `CHECK` la rechaza.
- [ ] **CA-8** Dados dos usuarios con emails `Ana@x.co` y `ana@x.co`, cuando se inserta el segundo, entonces falla por unicidad.
- [ ] **CA-9** Dado un pago con `monto = 0` o con solo `anulado_en` informado, cuando se inserta, entonces falla.
- [ ] **CA-10** Dada una notificación existente, cuando se inserta otra con la misma `(membresia_id, tipo, programada_para, canal)`, entonces falla.
- [ ] **CA-11** Dado un cliente con motos, cuando se intenta borrar el cliente, entonces la base lo impide.
- [ ] **CA-12** Dada una base migrada, cuando se ejecuta la semilla dos veces, entonces los conteos por tabla son iguales tras la primera y la segunda ejecución, y existen membresías en los cuatro estados calculados.
- [ ] **CA-13** Dado `ENTORNO=produccion`, cuando se ejecuta la semilla, entonces termina con error y no escribe nada.
- [ ] **CA-14** `normalizar_placa("abc-12d")` devuelve `ABC12D`; `normalizar_placa("a b")` lanza `ValueError`.
- [ ] **CA-15** Dado `datos = {"password": "x", "sub": {"refresh_token": "y", "nombre": "Ana"}}`, cuando se llama `registrar_auditoria`, entonces lo guardado es `{"sub": {"nombre": "Ana"}}`.

## 6. Pruebas requeridas

- Integración contra PostgreSQL real para todos los criterios de restricciones.
- Unitarias para `normalizar_placa` y el saneado de auditoría.

## 7. Notas para el constructor

- Escribe la migración a mano o revisa a fondo la autogenerada: Alembic no detecta bien índices parciales ni funcionales, ni los `CHECK`.
- Plantillas por defecto:
  - Recordatorio, asunto: `Tu membresía en {parqueadero} vence el {fecha_vencimiento}`
  - Recordatorio, cuerpo: `Hola {nombre}:\n\nTe recordamos que tu plan {plan} vence el {fecha_vencimiento}. El valor de la renovación es {precio}.\n\nGracias por confiar en {parqueadero}.`
  - Vencida, asunto: `Tu membresía en {parqueadero} venció`
  - Vencida, cuerpo: `Hola {nombre}:\n\nTu plan {plan} venció el {fecha_vencimiento}. Puedes renovarlo en tu próxima visita por {precio}.\n\n{parqueadero}`
- El estado de la membresía **no** es una columna. La función que lo calcula llega con B-06; la semilla solo necesita elegir fechas adecuadas.
- Los datos de la semilla son ficticios: nombres comunes, documentos que empiezan por `900000`, teléfonos `3000000001` en adelante y emails `@example.com`.

## 8. Preguntas abiertas

- …
