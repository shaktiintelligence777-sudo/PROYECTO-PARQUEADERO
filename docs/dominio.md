# Dominio y reglas de negocio · Parqueadero de motos

> Entregable **F-01**. Fuente de verdad del negocio. El contrato (`contracts/openapi.yaml`) y las specs se derivan de este documento.
> Estado: `v1.1` · Última actualización: 2026-11-10

---

## 1. Decisiones cerradas

Se adoptan las propuestas por defecto de `docs/ROADMAP.md` (sección 7). El dueño del proyecto **confirmó D-1 a D-12 el 2026-11-10**. Cambiar cualquiera exige que Fable actualice este documento y el contrato antes de que se toque código.

| ID | Decisión adoptada | Consecuencia en el diseño |
|---|---|---|
| D-1 | Backend en Render, PostgreSQL en Neon. | El código solo depende de `DATABASE_URL`. Nada específico del proveedor. |
| D-2 | Solo inicia sesión el personal: `admin` y `operador`. | Los clientes no tienen cuenta. `clientes` y `usuarios` son tablas separadas. |
| D-3 | Notificaciones por email en el MVP. | El canal `whatsapp` existe en el enum pero no se usa. Un cliente sin email no recibe avisos (se muestra una advertencia en su ficha). |
| D-4 | No se atienden motos sin registro (visitantes por horas). | Registrar una entrada exige que la placa exista. Si no existe, la app ofrece crear el cliente. |
| D-5 | La entrada **no** se bloquea por membresía vencida. | La API devuelve `advertencias`; la pantalla las muestra y el operador decide. |
| D-6 | Moneda COP sin decimales; zona horaria `America/Bogota`. | Los montos son enteros. “Hoy” siempre se calcula en `America/Bogota`. |
| D-7 | Una membresía por cliente cubre todas sus motos. | La membresía cuelga del cliente, no de la moto. |

Decisiones adicionales tomadas por Fable al detallar el dominio (también confirmadas):

| ID | Decisión | Motivo |
|---|---|---|
| D-8 | El **estado de la membresía se calcula**, no se guarda. Solo se persisten `fecha_vencimiento` y `cancelada_en`. | Evita que un job atrasado deje estados desactualizados. Reemplaza la columna `estado` del esqueleto del roadmap. |
| D-9 | Una membresía **nace con su primer pago**. No existen membresías sin pagar. | Simplifica: toda membresía tiene siempre una fecha de vencimiento real. |
| D-10 | Los pagos **no se editan ni se borran**; se **anulan** (solo `admin`, solo el último pago vigente de la membresía). | Trazabilidad del dinero. |
| D-11 | El usuario del demo (`demo@parqueadero.app` / `demo1234`) tiene rol `admin`. | Para que el visitante pueda recorrer todas las pantallas. |
| D-12 | Las entidades principales no se borran: se **desactivan** (`activo = false`). | Conserva el historial de accesos y pagos. |

---

## 2. Glosario

| Término | Definición |
|---|---|
| **Usuario** | Persona del parqueadero que inicia sesión. Rol `admin` u `operador`. |
| **Operador** | Usuario que registra entradas, salidas, clientes y pagos en el día a día. |
| **Admin** | Usuario con todo lo del operador más configuración, usuarios, planes, historial completo y anulaciones. |
| **Cliente** | Dueño de una o más motos. No inicia sesión. |
| **Moto** | Vehículo identificado por su **placa**. Pertenece a un solo cliente. |
| **Placa** | Identificador de la moto, normalizado (ver 3.1). |
| **Plan** | Producto que se vende: nombre, duración en días y precio. Ej.: “Mensual · 30 días · $60.000”. |
| **Membresía** | Contrato vigente de un cliente con un plan. Cubre todas las motos del cliente. |
| **Periodo** | Rango de fechas `[periodo_desde, periodo_hasta]` (ambos inclusive) que cubre un pago. |
| **Pago** | Registro de dinero recibido por uno o más periodos de una membresía. |
| **Estancia** | Una visita de una moto: tiene entrada y, cuando se va, salida. “Abierta” = sin salida = la moto está **dentro**. |
| **Notificación** | Aviso al cliente sobre el vencimiento de su membresía. |
| **Hoy** | La fecha actual en `America/Bogota`. |

---

## 3. Reglas de negocio

Cada regla tiene un identificador `RN-xx` para citarla desde las specs y las pruebas.

### 3.1 Formatos y convenciones

- **RN-01 Placa.** Se normaliza antes de guardar o buscar: mayúsculas, sin espacios ni guiones. Debe cumplir `^[A-Z0-9]{4,7}$`. Formato típico de moto en Colombia: `ABC12D`. La placa es única entre todas las motos (activas o no).
- **RN-02 Dinero.** Enteros en pesos colombianos (COP), mayores que 0. Se muestran como `$60.000`.
- **RN-03 Fechas.** Las fechas de calendario (`fecha_inicio`, `fecha_vencimiento`, periodos) son tipo `date` (`YYYY-MM-DD`) interpretadas en `America/Bogota`. Los instantes (`entrada_en`, `creado_en`) son UTC en ISO 8601 con sufijo `Z`. El frontend los muestra en `America/Bogota`.
- **RN-04 Documento del cliente.** Texto de 5 a 20 caracteres alfanuméricos, único. Se guarda sin puntos ni espacios.
- **RN-05 Teléfono.** Obligatorio. Solo dígitos, 7 a 15, con `+` inicial opcional.
- **RN-06 Email del cliente.** Opcional. Si falta, no se le pueden enviar notificaciones (D-3).
- **RN-07 Email del usuario.** Único, se compara en minúsculas.

### 3.2 Clientes y motos

- **RN-10** Un cliente puede existir sin motos y sin membresía.
- **RN-11** Una moto pertenece a exactamente un cliente. Cambiarla de dueño es editar `cliente_id` (solo `admin`).
- **RN-12** Desactivar un cliente desactiva sus motos. No se puede desactivar un cliente con una moto dentro (`409 cliente_con_moto_dentro`).
- **RN-13** No se puede desactivar una moto que está dentro (`409 moto_dentro`).
- **RN-14** Una moto o cliente inactivo no aparece en búsquedas por defecto y no puede registrar entradas.

### 3.3 Planes

- **RN-20** Un plan tiene `duracion_dias` entre 1 y 366 y `precio` mayor que 0.
- **RN-21** Los planes no se borran; se desactivan. Un plan inactivo no se puede asignar a membresías nuevas ni usar en pagos nuevos (`409 plan_inactivo`), pero las membresías que ya lo tienen siguen funcionando hasta su vencimiento.
- **RN-22** Cambiar el precio de un plan no altera pagos ya registrados. Cada pago guarda su propio `monto`.

### 3.4 Membresías

- **RN-30 Una por cliente.** Un cliente tiene como máximo **una membresía no cancelada**. Intentar crear otra devuelve `409 membresia_existente`.
- **RN-31 Alta.** Crear una membresía exige `cliente_id`, `plan_id`, `fecha_inicio` (por defecto hoy; no puede ser anterior a hoy menos 31 días ni posterior a hoy más 31 días) y un **pago inicial** (D-9). Resultado: `fecha_vencimiento = fecha_inicio + duracion_dias − 1`.
- **RN-32 Estado calculado** (D-8), evaluado en este orden:

  | Condición | Estado |
  |---|---|
  | `cancelada_en` no es nulo | `cancelada` |
  | hoy > `fecha_vencimiento` | `vencida` |
  | `fecha_vencimiento` − hoy ≤ `dias_por_vencer` (config, por defecto 3) | `por_vencer` |
  | en otro caso | `activa` |

  El día del vencimiento la membresía todavía está `por_vencer` (cubre ese día completo).
- **RN-33 Días restantes.** `dias_restantes = fecha_vencimiento − hoy`. Negativo si está vencida.
- **RN-34 Cambio de plan.** `PATCH /membresias/{id}` con `plan_id`. No cambia la fecha de vencimiento actual; el plan nuevo se aplica desde el próximo pago.
- **RN-35 Cancelación.** Solo `admin`. Fija `cancelada_en` y exige `motivo`. Es definitiva: si el cliente vuelve, se crea una membresía nueva. No devuelve dinero ni anula pagos. Las notificaciones `pendiente` de esa membresía pasan a `cancelada`.

### 3.5 Pagos

- **RN-40 Registro.** Un pago se registra sobre una membresía no cancelada, con `metodo` (`efectivo`, `transferencia`, `otro`), `periodos` (entero 1 a 12, por defecto 1) y `monto`.
- **RN-41 Periodo cubierto.**
  - Si la membresía **no está vencida** (hoy ≤ `fecha_vencimiento`): `periodo_desde = fecha_vencimiento + 1 día`. El cliente no pierde los días que le quedaban.
  - Si está **vencida**: `periodo_desde = hoy`. Los días en mora no se cobran ni se regalan hacia atrás.
  - `periodo_hasta = periodo_desde + (duracion_dias × periodos) − 1`.
- **RN-42 Extensión.** Tras el pago, `fecha_vencimiento = periodo_hasta`. Todo ocurre en una sola transacción.
- **RN-43 Monto.** El frontend propone `plan.precio × periodos`. El operador puede cambiarlo (descuentos, acuerdos); el backend solo exige que sea mayor que 0. Si difiere del valor propuesto, `nota` es obligatoria.
- **RN-44 Vista previa.** Antes de confirmar, la pantalla muestra el periodo y la nueva fecha de vencimiento. El cálculo es el de RN-41 y lo expone `POST /pagos/previsualizar`, que no guarda nada.
- **RN-45 Inmutabilidad.** Un pago no se edita ni se borra.
- **RN-46 Anulación** (D-10). Solo `admin`, con `motivo`. Solo se puede anular el **último pago no anulado** de la membresía (`409 pago_no_anulable` en otro caso), y no el pago inicial si es el único (para eso se cancela la membresía). Al anular, `fecha_vencimiento` vuelve a `vencimiento_anterior`, valor que cada pago guarda al registrarse.
- **RN-47** Un pago anulado sigue apareciendo en los listados, marcado como anulado, y no suma en los totales.

### 3.6 Accesos (entradas y salidas)

- **RN-50 Una estancia abierta por moto.** Registrar una entrada a una moto que ya está dentro devuelve `409 moto_ya_dentro`. Lo garantiza un índice único parcial en la base de datos, no solo el código.
- **RN-51 Placa desconocida.** Si la placa no existe o la moto está inactiva: `404 moto_no_registrada` (D-4).
- **RN-52 Advertencias, no bloqueos** (D-5). La entrada siempre se registra si la moto existe y no está dentro. La respuesta incluye `advertencias`:

  | Código | Cuándo |
  |---|---|
  | `sin_membresia` | El cliente no tiene membresía, o está cancelada. |
  | `membresia_vencida` | Estado `vencida`. |
  | `membresia_por_vencer` | Estado `por_vencer`. |

- **RN-53 Salida.** Cierra la estancia abierta de la moto. Si no está dentro: `409 moto_no_esta_dentro`. La salida nunca se bloquea por el estado de la membresía.
- **RN-54 Consulta previa.** Antes de registrar, la pantalla consulta la placa y muestra cliente, estado de membresía y si la moto está dentro. Así el botón principal es **Entrada** o **Salida** según corresponda.
- **RN-55 Marca de tiempo.** `entrada_en` y `salida_en` las pone el servidor. El cliente nunca las envía.
- **RN-56 Correcciones.** Una estancia no se edita. Si el operador registró una entrada por error, registra la salida. No hay borrado.
- **RN-57 Capacidad.** `capacidad` es un dato informativo de configuración (puede ser nulo). No bloquea entradas; el dashboard muestra `dentro / capacidad`.

### 3.7 Notificaciones

- **RN-60 Calendario.** Para cada membresía no cancelada cuyo cliente tenga email, el job diario genera:
  - `recordatorio` a los días indicados en `dias_recordatorio` antes del vencimiento (config, por defecto `[3, 1, 0]`; `0` = el mismo día).
  - `vencida` un día después del vencimiento (aviso de mora), una sola vez por vencimiento.
- **RN-61 Idempotencia.** Como máximo una notificación por `(membresia_id, tipo, programada_para, canal)`. Ejecutar el job dos veces el mismo día no duplica envíos.
- **RN-62 Sin recuperación hacia atrás.** El job solo crea y envía las notificaciones cuya `programada_para` es **hoy**. Si un día no corrió, esas notificaciones no se envían tarde.
- **RN-63 Pago que adelanta.** Si se registra un pago, las notificaciones `pendiente` ligadas al vencimiento anterior pasan a `cancelada`.
- **RN-64 Fallos.** Si el proveedor de email falla, la notificación queda `fallida` con `error` y el job la reintenta **solo dentro del mismo día** (máximo 3 intentos).
- **RN-65 Plantillas.** Asunto y cuerpo configurables por tipo, con las variables `{nombre}`, `{plan}`, `{fecha_vencimiento}`, `{precio}`, `{parqueadero}`. Una variable desconocida en una plantilla es un error de validación al guardar la configuración.

### 3.8 Usuarios, sesión y auditoría

- **RN-70 Roles.** Ver matriz en la sección 4.
- **RN-71 Contraseñas.** Mínimo 8 caracteres, máximo 128. Se guardan con Argon2id. Nunca se devuelven ni se registran en logs.
- **RN-72 Sesión.** Token de acceso JWT de 15 minutos; refresh token opaco de 30 días, rotativo y de un solo uso. Reutilizar un refresh ya rotado revoca **todas** las sesiones de ese usuario.
- **RN-73 Usuario inactivo.** No puede iniciar sesión ni refrescar; sus refresh tokens se revocan al desactivarlo.
- **RN-74 Último admin.** No se puede desactivar ni degradar al último `admin` activo (`409 ultimo_admin`). Un usuario no puede desactivarse a sí mismo.
- **RN-75 Límite de intentos.** 5 intentos fallidos de login por email o 20 por IP en 15 minutos → `429 demasiados_intentos` durante 15 minutos. El mensaje de error de login es el mismo exista o no el email.
- **RN-76 Auditoría.** Toda escritura (crear, editar, desactivar, pagar, anular, entrada, salida, login correcto y fallido) deja un registro en `auditoria` con usuario, acción, entidad, id y datos relevantes. Nunca incluye contraseñas ni tokens.

---

## 4. Matriz de permisos

| Acción | operador | admin |
|---|:-:|:-:|
| Iniciar sesión, ver su perfil, cambiar su contraseña | ✅ | ✅ |
| Ver dashboard | ✅ | ✅ |
| Consultar placa, registrar entrada y salida, ver motos dentro | ✅ | ✅ |
| Ver, crear y editar clientes y motos | ✅ | ✅ |
| Desactivar o reactivar clientes y motos; cambiar el dueño de una moto | ❌ | ✅ |
| Ver planes | ✅ | ✅ |
| Crear, editar y desactivar planes | ❌ | ✅ |
| Ver membresías; crear membresía; cambiar plan | ✅ | ✅ |
| Cancelar membresía | ❌ | ✅ |
| Ver pagos; registrar pago | ✅ | ✅ |
| Anular pago | ❌ | ✅ |
| Ver historial de accesos y exportar CSV | ❌ | ✅ |
| Ver notificaciones | ❌ | ✅ |
| Gestionar usuarios | ❌ | ✅ |
| Ver y editar configuración | ❌ | ✅ |

---

## 5. Casos borde

| # | Caso | Comportamiento esperado |
|---|---|---|
| CB-1 | Dos operadores registran la entrada de la misma placa a la vez. | Una gana; la otra recibe `409 moto_ya_dentro` (índice único parcial). |
| CB-2 | Pago cuando faltan 2 días para vencer (vence el 12, hoy es 10, plan de 30 días). | Periodo del 13 al día 12 del mes siguiente; no se pierden los 2 días. |
| CB-3 | Pago con la membresía vencida hace 10 días. | El periodo empieza hoy. No se cobra la mora. |
| CB-4 | Pago de 3 periodos de un plan de 30 días. | Se extiende 90 días. |
| CB-5 | Una moto quedó “dentro” porque nadie registró la salida. | Sigue apareciendo en “dentro ahora” con su antigüedad. El operador registra la salida cuando lo detecta. El dashboard resalta estancias de más de 24 horas. |
| CB-6 | Se cambia el plan a mitad de periodo. | El vencimiento no cambia. El próximo pago usa la duración y el precio del plan nuevo. |
| CB-7 | Se anula el último pago. | El vencimiento vuelve al valor anterior; la membresía puede quedar `vencida`. |
| CB-8 | Cliente sin email. | No se generan notificaciones. Su ficha muestra “Sin email: no recibirá avisos”. |
| CB-9 | Placa escrita como `abc-12d` o `ABC 12D`. | Se normaliza a `ABC12D` y se encuentra. |
| CB-10 | Cliente con membresía cancelada llega con su moto. | La entrada se registra con la advertencia `sin_membresia`. |
| CB-11 | El job de notificaciones corre dos veces el mismo día. | La segunda ejecución no envía nada nuevo (RN-61). |
| CB-12 | Medianoche: una entrada a las 23:59 y salida a las 00:10. | Es una sola estancia. En los conteos “de hoy” cuenta la entrada en un día y la salida en el siguiente. |
| CB-13 | Plan desactivado con membresías vigentes. | Siguen vigentes. Al intentar pagar: `409 plan_inactivo`; primero hay que cambiar de plan. |
| CB-14 | Refresh token usado dos veces. | La segunda vez se revocan todas las sesiones del usuario y debe volver a iniciar sesión. |

---

## 6. Datos semilla

Los usan tanto la semilla del backend (entornos de desarrollo) como el mock del demo, para que ambos se vean igual.

- **Usuarios:** `demo@parqueadero.app` / `demo1234` (admin, “Usuario Demo”); `operador@parqueadero.app` / `demo1234` (operador, “Operador Demo”).
- **Planes:** Mensual (30 días, $60.000) · Quincenal (15 días, $35.000) · Semanal (7 días, $18.000).
- **Configuración:** nombre “Parqueadero Demo”, capacidad 40, `dias_por_vencer` 3, `dias_recordatorio` `[3, 1, 0]`.
- **Clientes:** al menos 12 con nombres ficticios, de modo que existan: 6 con membresía `activa`, 2 `por_vencer`, 2 `vencida`, 1 `cancelada` y 1 sin membresía. Al menos 2 clientes con dos motos y 1 cliente sin email.
- **Estancias:** al menos 5 motos dentro ahora (una con más de 24 horas) y unas 30 estancias cerradas repartidas en los últimos 7 días.
- **Pagos:** coherentes con las membresías, incluidos 2 pagos de hoy y 1 pago anulado.

Las fechas de la semilla son **relativas a hoy** (por ejemplo, “vence en 2 días”) para que el demo siempre muestre todos los estados.
