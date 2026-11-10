# B-04 · Accesos: entradas, salidas e historial

| Campo | Valor |
|---|---|
| Estado | en revisión |
| Línea | B (fullstack) |
| Asignado a | Sonnet |
| Revisa | Opus |
| Depende de | B-03 |
| Rama | `feat/B-04-accesos-backend` |

## 1. Objetivo

Registrar entradas y salidas de motos de forma segura ante operaciones simultáneas, e informar al operador del estado de la membresía sin bloquearlo.

## 2. Contexto

- `docs/dominio.md`: RN-01, RN-14, RN-50 a RN-57, CB-1, CB-5, CB-9, CB-10, CB-12.
- Contrato: `consultarPlaca`, `registrarEntrada`, `registrarSalida`, `listarMotosDentro`, `listarHistorialAccesos`; esquemas `ConsultaPlaca`, `AccesoRegistrado`, `Estancia`, `Advertencia`, `MembresiaResumen`.

## 3. Alcance

**Archivos que crea o modifica:**

- `backend/app/modules/accesos/schemas.py`, `service.py`, `router.py`.
- `backend/app/modules/membresias/estado.py` — funciones puras `calcular_estado(fecha_vencimiento, cancelada_en, hoy, dias_por_vencer)`, `dias_restantes(...)` y `advertencias_de(membresia | None, ...)`. Las reutilizan B-05, B-06 y B-08.
- `backend/tests/accesos/`, `backend/tests/membresias/test_estado.py`.

**Puede tocar:**

- `backend/app/main.py` — registrar el router.

**Fuera de alcance:**

- Exportación CSV (`exportarHistorialAccesos`, B-08). Escrituras sobre membresías (B-06).

## 4. Diseño

### 4.1 Interfaz

Los cinco endpoints, exactamente como en el contrato.

### 4.2 Datos

Tabla `estancias` (B-02). Lecturas sobre `motos`, `clientes`, `membresias`, `planes`, `configuracion`.

### 4.3 Reglas de negocio

1. La placa recibida se normaliza con `normalizar_placa`; si no cumple el formato: 422 `validacion` con `campo: "placa"`.
2. Moto inexistente o inactiva, o cliente inactivo: 404 `moto_no_registrada`.
3. **Entrada:** inserta la estancia con `entrada_en = ahora()` y `operador_entrada` = usuario actual. Si la base rechaza la inserción por el índice único parcial: 409 `moto_ya_dentro`. No se hace “consultar y luego insertar” como única protección (CB-1).
4. **Salida:** selecciona la estancia abierta con `FOR UPDATE`, fija `salida_en` y `operador_salida`. Si no hay: 409 `moto_no_esta_dentro`.
5. `advertencias` según RN-52, calculadas con `estado.py`. En la salida es siempre `[]`.
6. `duracion_minutos` = minutos enteros (hacia abajo) entre `entrada_en` y `salida_en`, o `ahora()` si sigue abierta.
7. `listarMotosDentro`: estancias abiertas por `entrada_en` ascendente, con `total` y `capacidad` de la configuración; `placa` filtra por prefijo normalizado.
8. `listarHistorialAccesos`: `desde` y `hasta` se interpretan como días completos en America/Bogota sobre `entrada_en`; `operador_id` coincide con entrada **o** salida; orden por `entrada_en` descendente.
9. Auditoría: `acceso.entrada` y `acceso.salida` con la placa y el id de la estancia.

### 4.4 Seguridad

- Todos los endpoints exigen sesión. `listarHistorialAccesos` exige `admin`.
- Las horas las pone el servidor; el cuerpo no admite campos adicionales.

## 5. Criterios de aceptación

- [ ] **CA-1** Dada una moto fuera con membresía activa, cuando se registra la entrada con `abc-12d`, entonces responde 201 con la estancia (`salida_en: null`, placa `ABC12D`), la membresía resumida y `advertencias: []`.
- [ ] **CA-2** Dada una moto dentro, cuando se registra otra entrada, entonces responde 409 `moto_ya_dentro` y sigue habiendo una sola estancia abierta.
- [ ] **CA-3** Dadas dos peticiones de entrada simultáneas para la misma placa, entonces exactamente una responde 201 y la otra 409.
- [ ] **CA-4** Dada una placa inexistente, una moto inactiva o una moto de cliente inactivo, entonces entrada, salida y consulta responden 404 `moto_no_registrada`.
- [ ] **CA-5** Dadas membresías vencida, por vencer, cancelada e inexistente, cuando entra la moto, entonces responde 201 con `membresia_vencida`, `membresia_por_vencer`, `sin_membresia` y `sin_membresia` respectivamente.
- [ ] **CA-6** Dada una moto dentro desde hace 135 minutos, cuando se registra la salida, entonces responde 200 con `salida_en`, `duracion_minutos: 135`, `operador_salida` y `advertencias: []`.
- [ ] **CA-7** Dada una moto fuera, cuando se registra la salida, entonces responde 409 `moto_no_esta_dentro`.
- [ ] **CA-8** Dada una moto dentro, cuando se consulta su placa, entonces `estancia_abierta` no es nula; fuera, es `null`.
- [ ] **CA-9** Dada la placa `a b`, entonces responde 422 `validacion` con `detalles[0].campo = "placa"`.
- [ ] **CA-10** Dadas tres motos dentro, cuando se pide `/accesos/dentro`, entonces vienen ordenadas de la más antigua a la más reciente con `total: 3` y la capacidad configurada.
- [ ] **CA-11** Dadas estancias a las 23:30 del día 9 y a las 00:30 del día 10 (hora de Bogotá), cuando se pide el historial con `desde = hasta = día 10`, entonces solo viene la segunda (CB-12).
- [ ] **CA-12** Dado el filtro `operador_id`, entonces vienen las estancias donde ese usuario registró la entrada o la salida.
- [ ] **CA-13** Dado un operador, cuando pide el historial, entonces responde 403; sin token, cualquier endpoint responde 401.
- [ ] **CA-14** Dada una entrada y una salida, entonces `auditoria` tiene un registro de cada una.
- [ ] **CA-15** `calcular_estado` devuelve: `cancelada` si hay `cancelada_en`; `vencida` el día siguiente al vencimiento; `por_vencer` el día del vencimiento y hasta `dias_por_vencer` días antes; `activa` con un día más de margen.

## 6. Pruebas requeridas

- Unitarias: `estado.py` con tabla de casos en los límites.
- Integración / API: todos los criterios con `reloj_fijo`; CA-3 con dos tareas concurrentes y sesiones distintas.

## 7. Notas para el constructor

- Captura `IntegrityError` comprobando el nombre de la restricción del índice parcial antes de convertirlo en `moto_ya_dentro`; otros errores de integridad no deben disfrazarse.
- Evita consultas N+1 en las listas: carga moto, cliente y operadores con `selectinload` o `joinedload`.

## 8. Preguntas abiertas

- …
