# B-06 · Membresías y pagos

| Campo | Valor |
|---|---|
| Estado | hecha |
| Línea | B (fullstack) |
| Asignado a | Opus |
| Revisa | Fable |
| Depende de | B-05 |
| Rama | `feat/B-06-membresias-pagos-backend` |

## 1. Objetivo

Implementar el núcleo económico del sistema: crear membresías con su primer pago, extender el vencimiento con cada pago, cambiar de plan, cancelar y anular, garantizando que dinero y fechas sean siempre coherentes.

## 2. Contexto

- `docs/dominio.md`: D-8, D-9, D-10, RN-21, RN-30 a RN-35, RN-40 a RN-47, RN-63, CB-2, CB-3, CB-4, CB-6, CB-7, CB-13.
- Contrato: operaciones de las etiquetas Membresías y Pagos y sus esquemas.
- `backend/app/modules/membresias/estado.py` (B-04).

## 3. Alcance

**Archivos que crea o modifica:**

- `backend/app/modules/membresias/schemas.py`, `service.py`, `router.py`.
- `backend/app/modules/pagos/schemas.py`, `service.py`, `router.py`.
- `backend/app/modules/pagos/periodos.py` — función pura `calcular_periodo(fecha_vencimiento, hoy, duracion_dias, periodos) -> (desde, hasta)`.
- `backend/tests/membresias/`, `backend/tests/pagos/`.

**Puede tocar:**

- `backend/app/main.py`.

**Fuera de alcance:**

- Generación y envío de notificaciones (B-07). Aquí solo se cancelan las pendientes (regla 9).

## 4. Diseño

### 4.1 Interfaz

Operaciones del contrato: `listarMembresias`, `crearMembresia`, `obtenerMembresia`, `cambiarPlanMembresia`, `cancelarMembresia`, `listarPagosDeMembresia`, `listarPagos`, `registrarPago`, `previsualizarPago`, `anularPago`.

### 4.2 Datos

Tablas `membresias`, `pagos`, `notificaciones` (B-02).

### 4.3 Reglas de negocio

1. **Alta (RN-31).** En una transacción: valida cliente activo, plan activo (`plan_inactivo`), `fecha_inicio` dentro de hoy ± 31 días (422), crea la membresía con `fecha_vencimiento = fecha_inicio + duracion_dias − 1` y el pago inicial con `periodos = 1`, `periodo_desde = fecha_inicio`, `periodo_hasta = fecha_vencimiento`, `vencimiento_anterior = NULL`. Si ya hay membresía no cancelada: 409 `membresia_existente` (apoyado en el índice único parcial, no solo en una consulta previa).
2. **Nota obligatoria (RN-43).** En el alta y en `registrarPago`, si `monto` ≠ `plan.precio × periodos` y falta `nota` (o es vacía): 422 `validacion` con `campo: "nota"` (o `"pago_inicial.nota"`).
3. **Periodo (RN-41).** `calcular_periodo`: si `hoy <= fecha_vencimiento`, `desde = fecha_vencimiento + 1`; si no, `desde = hoy`. `hasta = desde + duracion_dias × periodos − 1`.
4. **Registrar pago.** En una transacción, con la membresía bloqueada (`FOR UPDATE`): rechaza cancelada (`membresia_cancelada`) y plan inactivo (`plan_inactivo`); calcula el periodo con el plan **actual** de la membresía; inserta el pago con `plan_id`, `vencimiento_anterior = fecha_vencimiento` previa y `registrado_por`; actualiza `fecha_vencimiento = periodo_hasta`.
5. **Vista previa.** Mismo cálculo y mismas validaciones, sin escribir ni auditar.
6. **Cambio de plan (RN-34).** Solo cambia `plan_id`. Rechaza membresía cancelada y plan inactivo.
7. **Cancelación (RN-35).** Solo `admin`. Fija `cancelada_en`, `cancelada_por` y `motivo_cancelacion`. Ya cancelada: 409 `membresia_cancelada`.
8. **Anulación (RN-46).** Solo `admin`, con la membresía bloqueada. Rechaza con 409 `pago_no_anulable` si el pago ya está anulado, si no es el último pago no anulado de la membresía (por `creado_en`), si `vencimiento_anterior` es nulo (pago inicial) o si la membresía está cancelada. Si procede: marca la anulación y restaura `fecha_vencimiento = vencimiento_anterior`.
9. **Notificaciones pendientes.** Al registrar un pago, anularlo o cancelar la membresía, las notificaciones `pendiente` de esa membresía pasan a `cancelada` (RN-35, RN-63).
10. **Listados.** `listarMembresias` sin `estado` ni `cliente_id` excluye canceladas; con `estado` filtra por el estado calculado; orden por `fecha_vencimiento` ascendente. `listarPagos` filtra `desde`/`hasta` por día de Bogotá sobre `creado_en`; orden descendente.
11. `Pago.plan` es el plan guardado en el pago, no el actual de la membresía.
12. Auditoría: `membresia.crear`, `membresia.cambiar_plan`, `membresia.cancelar`, `pago.registrar`, `pago.anular`, con montos, fechas anteriores y nuevas, y motivo.

### 4.4 Seguridad

- Permisos según la matriz. Toda operación que cambia `fecha_vencimiento` es transaccional y bloquea la fila de la membresía.
- Los montos se validan como enteros positivos dentro del máximo del contrato.

## 5. Criterios de aceptación

- [ ] **CA-1** Dado un cliente sin membresía y el plan Mensual (30 días), cuando se crea con `fecha_inicio` 2026-11-10, entonces responde 201 con `fecha_vencimiento` 2026-12-09 y existe un pago con periodo del 10 nov al 9 dic.
- [ ] **CA-2** Dado un cliente con membresía no cancelada, cuando se crea otra, entonces responde 409 `membresia_existente`; si la anterior está cancelada, se acepta. Dos altas simultáneas para el mismo cliente dejan una sola membresía.
- [ ] **CA-3** Dado un plan inactivo, entonces el alta, el cambio de plan, la vista previa y el pago responden 409 `plan_inactivo` (CB-13).
- [ ] **CA-4** Dada una `fecha_inicio` 40 días atrás o adelante, entonces responde 422.
- [ ] **CA-5** Dada una membresía que vence el 12 y hoy es 10 (plan de 30 días), cuando se paga 1 periodo, entonces el periodo es del 13 al día 12 del mes siguiente (30 días) y el vencimiento pasa a ese día (CB-2).
- [ ] **CA-6** Dada una membresía vencida hace 10 días, cuando se paga, entonces `periodo_desde` es hoy y `periodo_hasta` hoy + 29 (CB-3).
- [ ] **CA-7** Dado un pago con `periodos: 3`, entonces el vencimiento se extiende 90 días (CB-4).
- [ ] **CA-8** Dado el día exacto del vencimiento, cuando se paga, entonces `periodo_desde` es el día siguiente (la membresía aún no está vencida).
- [ ] **CA-9** Dada la vista previa, entonces devuelve los mismos valores que el pago real y no cambia la base ni la auditoría.
- [ ] **CA-10** Dado un monto distinto de `precio × periodos` sin nota, entonces responde 422 con `campo: "nota"`; con nota, 201.
- [ ] **CA-11** Dado un cambio de plan de Mensual a Quincenal, entonces `fecha_vencimiento` no cambia y el siguiente pago extiende 15 días y guarda el plan Quincenal (CB-6).
- [ ] **CA-12** Dada una membresía cancelada, entonces el pago, la vista previa y el cambio de plan responden 409 `membresia_cancelada`.
- [ ] **CA-13** Dado un operador, cuando cancela una membresía o anula un pago, entonces responde 403.
- [ ] **CA-14** Dada una membresía con pago inicial y un segundo pago, cuando un admin anula el segundo, entonces `fecha_vencimiento` vuelve al valor anterior y el pago queda `anulado: true` con motivo y autor (CB-7).
- [ ] **CA-15** Dado ese mismo caso, cuando se intenta anular el pago inicial, un pago ya anulado o un pago que no es el último, entonces responde 409 `pago_no_anulable`.
- [ ] **CA-16** Dadas dos peticiones de pago simultáneas sobre la misma membresía, entonces ambas se registran y el vencimiento final suma los dos periodos, sin solaparse.
- [ ] **CA-17** Dada una membresía con notificaciones pendientes, cuando se registra un pago o se cancela, entonces pasan a `cancelada`.
- [ ] **CA-18** Dado `listarMembresias?estado=por_vencer`, entonces solo vienen las que cumplen RN-32 con el `dias_por_vencer` configurado; sin filtros no vienen canceladas; con `cliente_id` sí.
- [ ] **CA-19** Dado `listarPagos` con `desde = hasta = hoy`, entonces vienen los pagos creados hoy en hora de Bogotá, incluidos los anulados; con `incluir_anulados=false`, sin ellos.
- [ ] **CA-20** Dado un pago hecho con el plan Mensual y un cambio posterior a Quincenal, entonces `Pago.plan` sigue siendo Mensual.
- [ ] **CA-21** Dado un pago y una anulación, entonces `auditoria` guarda ambos con el vencimiento anterior y el nuevo.
- [ ] **CA-22** Dado un fallo forzado después de insertar el pago y antes de actualizar la membresía, entonces no queda ni el pago ni el cambio de fecha.

## 6. Pruebas requeridas

- Unitarias: `calcular_periodo` con tabla de casos (incluye fin de mes, año bisiesto y el día exacto del vencimiento).
- Integración / API: todos los criterios con `reloj_fijo`; CA-2 y CA-16 con concurrencia real.

## 7. Notas para el constructor

- Toda la aritmética es de fechas de calendario (`date` + `timedelta`), nunca de instantes.
- `frontend/src/api/mock/reglas.ts` implementa las mismas reglas para el demo: los resultados de ambos deben coincidir en los casos CB-2, CB-3 y CB-4.

## 8. Preguntas abiertas

- …
