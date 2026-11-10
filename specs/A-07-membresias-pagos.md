# A-07 · Pantallas de membresías y pagos (P6, P7)

| Campo | Valor |
|---|---|
| Estado | lista |
| Línea | A (demo) |
| Asignado a | Sonnet |
| Revisa | Opus |
| Depende de | A-04, A-06 |
| Rama | `feat/A-07-membresias-pagos` |

## 1. Objetivo

Ver qué membresías vencen, crear membresías, cambiar de plan, cancelar y registrar pagos mostrando siempre al operador la nueva fecha de vencimiento antes de confirmar.

## 2. Contexto

- `docs/ui/pantallas.md`: P6, P7, la sección “Membresía” de la ficha (P4) y sección 0.
- Contrato: `listarMembresias`, `crearMembresia`, `cambiarPlanMembresia`, `cancelarMembresia`, `listarPlanes`, `listarPagos`, `registrarPago`, `previsualizarPago`, `anularPago`.
- `docs/dominio.md`: RN-30 a RN-35, RN-40 a RN-47, CB-2, CB-3, CB-4, CB-6, CB-7, CB-13.

## 3. Alcance

**Archivos que crea o modifica:**

- `frontend/src/features/membresias/PaginaMembresias.tsx`, `SeccionMembresia.tsx`, `HojaCrearMembresia.tsx`, `HojaCambiarPlan.tsx`, `esquemas.ts`.
- `frontend/src/features/pagos/PaginaPagos.tsx`, `PaginaNuevoPago.tsx`, `ResumenPago.tsx`, `PagoRegistrado.tsx`, `HojaDetallePago.tsx`, `esquemas.ts`.
- Pruebas junto a cada archivo.

**Puede tocar:**

- `frontend/src/app/rutas.tsx`; `frontend/src/features/clientes/PaginaCliente.tsx` (solo para sustituir el componente provisional por `SeccionMembresia`).

**Fuera de alcance:**

- Gestión de planes (B-10). Reportes.

## 4. Diseño

### 4.1 Interfaz

Estructura y textos: P6, P7 y la tarjeta de membresía de P4. Filtros en la URL.

### 4.2 Datos

Sin estado persistente propio.

### 4.3 Reglas de negocio

1. La pantalla **no calcula** el periodo de un pago: muestra lo que devuelve `previsualizarPago`. La única fecha que calcula en cliente es la línea “Cubre del … al …” de la hoja “Crear membresía”.
2. El monto se rellena con el sugerido y se actualiza al cambiar periodos **solo** si el usuario no lo ha editado a mano.
3. Si el monto difiere del sugerido, la nota es obligatoria (RN-43) y se valida antes de enviar.
4. El botón de registrar está deshabilitado mientras la vista previa carga o falla.
5. Tras registrar un pago se muestra la pantalla de confirmación de P7; “Registrar otro pago” vuelve al formulario vacío.
6. “Cancelar membresía” y “Anular pago” solo se renderizan para admin y exigen motivo de 5 caracteres o más.
7. La hoja “Crear membresía” se abre sola si la ficha llega con `?crear_membresia=1`.
8. “Renovar” no aparece en membresías canceladas.

### 4.4 Seguridad

Las acciones de admin no se renderizan para el operador; la API las rechaza igualmente.

## 5. Criterios de aceptación

- [ ] **CA-1** Dada la lista de membresías sin filtro, entonces está ordenada por vencimiento ascendente y no incluye canceladas; con “Canceladas”, solo canceladas y sin botón “Renovar”.
- [ ] **CA-2** Dado `/membresias?estado=por_vencer`, entonces el filtro “Por vencer” está seleccionado.
- [ ] **CA-3** Dado “Renovar” en una membresía, entonces se abre `/pagos/nuevo` con esa membresía elegida y el resumen cargado.
- [ ] **CA-4** Dada una membresía que vence mañana con plan Mensual, entonces el resumen muestra “Cubre”, “Vencimiento actual” y “Nuevo vencimiento” con los valores de la vista previa, y el botón dice “Registrar $60.000”.
- [ ] **CA-5** Dados 3 periodos, entonces el monto pasa a $180.000 y el nuevo vencimiento se actualiza.
- [ ] **CA-6** Dado un monto editado a $50.000, cuando se cambian los periodos, entonces el monto no se sobrescribe; al enviar sin nota aparece “Explica por qué el monto es distinto al sugerido ($60.000).”
- [ ] **CA-7** Dada una membresía vencida, entonces se muestra “La membresía está vencida: el nuevo periodo empieza hoy.”
- [ ] **CA-8** Dado un pago válido, cuando se registra, entonces se muestra “Pago registrado” con monto, método, cliente y “Vence el …”, y la ficha del cliente refleja el nuevo vencimiento sin recargar.
- [ ] **CA-9** Dado `/pagos/nuevo` sin parámetro, entonces se muestra el buscador; al elegir un resultado se carga el formulario.
- [ ] **CA-10** Dado `plan_inactivo` en la vista previa, entonces se muestra el aviso con enlace a la ficha y el botón de registrar está deshabilitado.
- [ ] **CA-11** Dada la ficha de un cliente sin membresía, cuando se completa “Crear membresía” con el plan Mensual desde hoy, entonces la línea dice “Cubre del {hoy} al {hoy + 29 días}”, y al confirmar aparece “Membresía creada. Vence el …” y la tarjeta muestra “Activa”.
- [ ] **CA-12** Dado `membresia_existente`, entonces la hoja muestra “Este cliente ya tiene una membresía.”
- [ ] **CA-13** Dado “Cambiar plan”, cuando se confirma, entonces la tarjeta muestra el plan nuevo y la misma fecha de vencimiento.
- [ ] **CA-14** Dado un admin, cuando cancela una membresía con motivo, entonces la tarjeta pasa a “Este cliente no tiene membresía.”; con un motivo de 3 caracteres el botón está deshabilitado.
- [ ] **CA-15** Dado un operador, entonces no ve “Cancelar membresía” ni “Anular pago”.
- [ ] **CA-16** Dada la lista de pagos, entonces por defecto muestra los de hoy; “Últimos 7 días” amplía el rango y la URL lo refleja.
- [ ] **CA-17** Dado un admin que anula el último pago con motivo, entonces el pago aparece tachado con “Anulado”; con `pago_no_anulable` se muestra “Solo se puede anular el último pago de una membresía.”
- [ ] **CA-18** Dado el botón de registrar pulsado dos veces, entonces solo se crea un pago.

## 6. Pruebas requeridas

- UI con Testing Library sobre `MockApi` con reloj fijo. Unitarias de `esquemas.ts`.

## 7. Notas para el constructor

- Guarda en un `ref` si el monto fue editado a mano; no lo deduzcas comparando valores.

## 8. Preguntas abiertas

- …
