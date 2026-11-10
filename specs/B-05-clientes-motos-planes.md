# B-05 · Clientes, motos y planes

| Campo | Valor |
|---|---|
| Estado | lista |
| Línea | B (fullstack) |
| Asignado a | Sonnet |
| Revisa | Opus |
| Depende de | B-03, B-04 |
| Rama | `feat/B-05-clientes-motos-planes` |

## 1. Objetivo

Ofrecer el alta, la consulta, la búsqueda y la edición de clientes, motos y planes, sin borrar nunca nada.

## 2. Contexto

- `docs/dominio.md`: RN-01, RN-04 a RN-06, RN-10 a RN-14, RN-20 a RN-22, D-12, matriz de permisos.
- Contrato: operaciones de las etiquetas Clientes, Motos y Planes y sus esquemas.
- `backend/app/modules/membresias/estado.py` (B-04) para `MembresiaResumen`.

## 3. Alcance

**Archivos que crea o modifica:**

- `backend/app/modules/clientes/`, `motos/`, `planes/`: `schemas.py`, `service.py`, `router.py`.
- `backend/app/core/paginacion.py` — parámetros `pagina` y `por_pagina` y respuesta paginada genérica.
- `backend/tests/clientes/`, `backend/tests/motos/`, `backend/tests/planes/`.

**Puede tocar:**

- `backend/app/main.py`.

**Fuera de alcance:**

- Membresías y pagos (B-06).

## 4. Diseño

### 4.1 Interfaz

Las operaciones del contrato: `listarClientes`, `crearCliente`, `obtenerCliente`, `editarCliente`, `listarMotos`, `crearMoto`, `editarMoto`, `listarPlanes`, `crearPlan`, `editarPlan`.

### 4.2 Datos

Tablas `clientes`, `motos`, `planes` (B-02); lecturas de `membresias` y `estancias`.

### 4.3 Reglas de negocio

1. `documento` se guarda sin espacios ni puntos y en mayúsculas; `telefono` sin espacios; `email` en minúsculas; cadenas vacías opcionales se guardan como `NULL`.
2. `crearCliente` con `motos` es una sola transacción: si una placa ya existe o se repite dentro de la petición, no se crea nada y responde 409 `placa_duplicada` con `detalles[0].campo = "motos.<i>.placa"`.
3. Búsqueda `q` en clientes: nombre parcial sin distinguir mayúsculas ni tildes, **o** prefijo de documento, **o** prefijo de placa normalizada de una moto activa.
4. `estado_membresia` filtra con el estado calculado; `sin_membresia` = sin membresía no cancelada.
5. `membresia` en `ClienteResumen` y `ClienteDetalle` es la membresía no cancelada, o `null`.
6. `Moto.dentro` es verdadero si tiene una estancia abierta.
7. Cambiar `activo` de un cliente o una moto, o `cliente_id` de una moto, exige `admin`: un operador que envía esos campos recibe 403 `sin_permiso` y no se aplica ningún cambio.
8. Desactivar un cliente desactiva sus motos (RN-12); con una moto dentro: 409 `cliente_con_moto_dentro`. Reactivar el cliente **no** reactiva sus motos.
9. Desactivar una moto que está dentro: 409 `moto_dentro`.
10. Planes: escritura solo `admin`. Nombre único entre planes activos sin distinguir mayúsculas: 409 `nombre_duplicado`.
11. Auditoría de cada creación, edición, activación y desactivación, con los campos cambiados.

### 4.4 Seguridad

Sesión obligatoria. Permisos según la matriz. Entradas con `extra="forbid"`.

## 5. Criterios de aceptación

- [ ] **CA-1** Dado un cuerpo válido con dos motos, cuando se crea el cliente, entonces responde 201 con `ClienteDetalle`, las placas normalizadas y `membresia: null`.
- [ ] **CA-2** Dado un documento existente, entonces responde 409 `documento_duplicado` con `detalles[0].campo = "documento"`.
- [ ] **CA-3** Dada una placa existente en la segunda moto, entonces responde 409 `placa_duplicada` con `campo = "motos.1.placa"` y no se crea ni el cliente ni la primera moto.
- [ ] **CA-4** Dados teléfono `12`, documento `ab` o email `x@`, entonces responde 422 con el campo correspondiente en `detalles`.
- [ ] **CA-5** Dado un cliente “José Ñáñez” con placa `ABC12D`, cuando se busca `q=jose`, `q=nanez`, `q=abc1` o el prefijo de su documento, entonces aparece.
- [ ] **CA-6** Dados clientes con membresía en cada estado y uno sin membresía, cuando se filtra por cada valor de `estado_membresia`, entonces vienen solo los que corresponden; el de membresía cancelada aparece en `sin_membresia`.
- [ ] **CA-7** Dados 25 clientes, cuando se pide `por_pagina=10&pagina=3`, entonces vienen 5, con `total: 25`; `por_pagina=101` responde 422.
- [ ] **CA-8** Dado un cliente inactivo, entonces no aparece en la lista por defecto y sí con `activo=false`.
- [ ] **CA-9** Dado un operador que envía `{"activo": false}` a un cliente o `{"cliente_id": …}` a una moto, entonces responde 403 y nada cambia; un admin sí puede.
- [ ] **CA-10** Dado un admin que desactiva un cliente con dos motos fuera, entonces las dos motos quedan inactivas; con una dentro, responde 409 `cliente_con_moto_dentro` y nada cambia.
- [ ] **CA-11** Dado un admin que desactiva una moto que está dentro, entonces responde 409 `moto_dentro`.
- [ ] **CA-12** Dada una moto dentro, entonces `dentro` es `true` en `ClienteDetalle` y en `listarMotos`.
- [ ] **CA-13** Dado `crearMoto` para un cliente inexistente o inactivo, entonces responde 404.
- [ ] **CA-14** Dado un operador, cuando crea o edita un plan, entonces responde 403; puede listarlos.
- [ ] **CA-15** Dado un plan activo “Mensual”, cuando un admin crea “mensual”, entonces responde 409 `nombre_duplicado`; si el primero está inactivo, se acepta.
- [ ] **CA-16** Dado `duracion_dias: 0` o `precio: 0`, entonces responde 422.
- [ ] **CA-17** Dado `listarPlanes?activo=true`, entonces vienen solo los activos, por duración descendente.
- [ ] **CA-18** Dado un `PATCH` con cuerpo vacío o con un campo desconocido, entonces responde 422.
- [ ] **CA-19** Dada la edición de un cliente, entonces `auditoria` registra qué campos cambiaron.

## 6. Pruebas requeridas

- Integración / API para todos los criterios, con `reloj_fijo` donde interviene el estado.

## 7. Notas para el constructor

- Para la búsqueda sin tildes usa la función envoltorio de `unaccent` creada en B-02, de modo que se aproveche el índice.
- Convierte los `IntegrityError` de unicidad a su código según el nombre de la restricción.

## 8. Preguntas abiertas

- …
