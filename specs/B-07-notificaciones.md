# B-07 · Notificaciones de pago por email

| Campo | Valor |
|---|---|
| Estado | lista |
| Línea | B (fullstack) |
| Asignado a | Opus |
| Revisa | Fable |
| Depende de | B-06 |
| Rama | `feat/B-07-notificaciones` |

## 1. Objetivo

Avisar por email a cada cliente antes y después del vencimiento de su membresía, una sola vez por aviso, de forma automática todos los días.

## 2. Contexto

- `docs/dominio.md`: D-3, RN-60 a RN-65, CB-8, CB-11.
- Contrato: `ejecutarJobNotificaciones`, `listarNotificaciones`; esquema `Notificacion`; seguridad `serviceToken`.
- `requiere_token_servicio` (B-03).

## 3. Alcance

**Archivos que crea o modifica:**

- `backend/app/modules/notificaciones/schemas.py`, `service.py`, `router.py`, `plantillas.py`.
- `backend/app/core/correo.py` — interfaz `ProveedorCorreo` con implementaciones `CorreoSMTP`, `CorreoResend` y `CorreoConsola`.
- `backend/app/jobs/notificaciones.py` — lógica del job, invocable desde el endpoint.
- `.github/workflows/notificaciones-cron.yml`.
- `backend/tests/notificaciones/`.

**Puede tocar:**

- `backend/app/main.py`, `backend/app/core/config.py`, `backend/.env.example`, `backend/pyproject.toml`.

**Fuera de alcance:**

- WhatsApp (fase 2). Edición de plantillas (B-10).

## 4. Diseño

### 4.1 Interfaz

- `POST /internal/jobs/notificaciones` y `GET /notificaciones`, como en el contrato.
- `ProveedorCorreo.enviar(para, asunto, cuerpo) -> None`; lanza `ErrorCorreo` si falla.

| Variable | Por defecto | Notas |
|---|---|---|
| `CORREO_PROVEEDOR` | `consola` | `consola` · `smtp` · `resend` |
| `CORREO_REMITENTE` | — | Obligatoria salvo con `consola` |
| `SMTP_HOST`, `SMTP_PUERTO`, `SMTP_USUARIO`, `SMTP_PASSWORD` | — | Solo `smtp` |
| `RESEND_API_KEY` | — | Solo `resend` |

**Cron:** todos los días a las 13:00 UTC (8:00 a. m. en Bogotá) y a mano (`workflow_dispatch`). Un paso `curl` con reintentos (`--retry 5 --retry-all-errors --max-time 120`) hacia `${{ secrets.API_URL }}/api/v1/internal/jobs/notificaciones` con `Authorization: Bearer ${{ secrets.SERVICE_TOKEN }}`; falla si la respuesta no es 200.

### 4.2 Datos

Tabla `notificaciones` (B-02). Lecturas de `membresias`, `clientes`, `planes`, `configuracion`.

### 4.3 Reglas de negocio

1. El job trabaja sobre `hoy()`. Para cada membresía no cancelada cuyo cliente está activo y tiene email:
   - si `fecha_vencimiento − hoy` está en `dias_recordatorio` → notificación `recordatorio`;
   - si `hoy = fecha_vencimiento + 1` → notificación `vencida`.
2. Cada notificación se inserta con `programada_para = hoy`, `canal = email`, usando `INSERT … ON CONFLICT DO NOTHING` sobre la restricción única (RN-61).
3. Se envían las notificaciones de hoy en estado `pendiente`, y las `fallida` con `intentos < 3` (RN-64). Nunca las de días anteriores (RN-62).
4. Envío correcto → `enviada`, `enviada_en = ahora()`. Fallo → `fallida`, `intentos + 1`, `error` con el mensaje recortado a 300 caracteres. El fallo de una no detiene las demás.
5. Cada notificación se confirma en su propia transacción, para que un fallo a mitad del lote no pierda las ya enviadas ni las reenvíe.
6. Plantillas: se sustituyen `{nombre}`, `{plan}`, `{fecha_vencimiento}` (formato “11 de noviembre de 2026”), `{precio}` (“$60.000”) y `{parqueadero}`. `plantillas.py` expone `validar_plantilla(texto)` (rechaza variables desconocidas, RN-65) y `renderizar(...)`.
7. La respuesta del job cuenta `creadas`, `enviadas`, `fallidas` y `omitidas` de esa ejecución.
8. Con `CORREO_PROVEEDOR=consola` no se envía nada: se escribe en el log el destinatario enmascarado y el asunto, y la notificación queda `enviada`.
9. Auditoría: un registro `notificaciones.job` por ejecución, con los contadores y `usuario_id` nulo.

### 4.4 Seguridad

- El endpoint del job solo acepta el token de servicio; un JWT de admin no sirve.
- Los valores se insertan en las plantillas como texto plano; el correo se envía como `text/plain`.
- Los emails de clientes no se escriben completos en los logs (`c***@example.com`).
- `listarNotificaciones` exige `admin`.

## 5. Criterios de aceptación

- [ ] **CA-1** Dadas membresías que vencen en 3 días, en 1 día y hoy, cuando corre el job, entonces se crea y envía un `recordatorio` para cada una.
- [ ] **CA-2** Dada una membresía que venció ayer, entonces se crea y envía una `vencida`; una que venció hace 2 días no genera nada.
- [ ] **CA-3** Dada una membresía que vence en 2 días (con `dias_recordatorio` `[3, 1, 0]`), entonces no genera nada.
- [ ] **CA-4** Dado el job ejecutado dos veces el mismo día, entonces la segunda vez responde `creadas: 0`, `enviadas: 0` y el proveedor no recibe llamadas nuevas (CB-11).
- [ ] **CA-5** Dados un cliente sin email, un cliente inactivo y una membresía cancelada, entonces no se crea ninguna notificación para ellos (CB-8).
- [ ] **CA-6** Dado un proveedor que falla para un destinatario, entonces esa notificación queda `fallida` con `intentos: 1` y `error`, y las demás quedan `enviada`.
- [ ] **CA-7** Dada una notificación `fallida` de hoy, cuando el job corre de nuevo, entonces se reintenta; tras el tercer fallo no se vuelve a intentar.
- [ ] **CA-8** Dada una notificación `fallida` o `pendiente` de ayer, cuando corre el job hoy, entonces no se envía.
- [ ] **CA-9** Dada la plantilla por defecto, entonces el correo enviado contiene el nombre, el plan, la fecha “11 de noviembre de 2026” y “$60.000”, sin llaves sin sustituir.
- [ ] **CA-10** `validar_plantilla("Hola {apellido}")` falla; `validar_plantilla("Hola {nombre}")` pasa.
- [ ] **CA-11** Dado `dias_recordatorio` `[5]` en la configuración, entonces solo se envía recordatorio a quien vence en 5 días.
- [ ] **CA-12** Dado el endpoint del job sin token, con un token incorrecto o con un JWT de admin, entonces responde 401.
- [ ] **CA-13** Dado un admin, cuando lista notificaciones con `estado=fallida`, entonces vienen solo esas; un operador recibe 403.
- [ ] **CA-14** Dada una ejecución, entonces el log no contiene ningún email completo y `auditoria` tiene un registro `notificaciones.job`.
- [ ] **CA-15** Dado el workflow del cron, entonces su sintaxis es válida (`actionlint`) y no contiene la URL ni el token en claro.

## 6. Pruebas requeridas

- Unitarias: `plantillas.py`; selección de membresías por fecha.
- Integración / API con un `ProveedorCorreo` falso inyectado y `reloj_fijo`.

## 7. Notas para el constructor

- El job debe terminar en menos de 60 segundos con 500 membresías: carga todo lo necesario en pocas consultas.
- El hosting gratuito puede tardar en despertar: por eso el `curl` del cron reintenta.
- Los secretos `API_URL` y `SERVICE_TOKEN` del repositorio los crea el dueño; documéntalo en el PR.

## 8. Preguntas abiertas

- …
