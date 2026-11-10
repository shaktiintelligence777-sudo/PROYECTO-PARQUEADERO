# B-03 · Autenticación y autorización

| Campo | Valor |
|---|---|
| Estado | lista |
| Línea | B (fullstack) |
| Asignado a | Opus |
| Revisa | Fable |
| Depende de | B-02 |
| Rama | `feat/B-03-autenticacion` |

## 1. Objetivo

Permitir que el personal inicie sesión con email y contraseña de forma segura, mantener la sesión con tokens rotativos y ofrecer a los demás módulos las dependencias para exigir un usuario autenticado y un rol.

## 2. Contexto

- `docs/dominio.md`: RN-07, RN-70 a RN-76, CB-14 y la matriz de permisos.
- `docs/ROADMAP.md` sección 2.6.
- Contrato: `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`, `/auth/password`; esquemas `LoginEntrada`, `RefreshEntrada`, `Sesion`, `Usuario`; esquemas de seguridad `bearerAuth` y `serviceToken`.

## 3. Alcance

**Archivos que crea o modifica:**

- `backend/app/core/seguridad.py` — hash y verificación de contraseñas, emisión y validación de JWT, generación y hash de refresh tokens.
- `backend/app/core/dependencias.py` — `usuario_actual`, `requiere_rol(*roles)`, `requiere_token_servicio`, `ip_cliente`.
- `backend/app/modules/auth/schemas.py`, `service.py`, `router.py`.
- `backend/tests/auth/` — pruebas de todos los criterios.
- `backend/tests/conftest.py` — fixtures `usuario_admin`, `usuario_operador`, `cabeceras_admin`, `cabeceras_operador`.

**Puede tocar:**

- `backend/app/main.py` — registrar el router.
- `backend/app/core/config.py` — ajustes nuevos de la sección 4.1.
- `backend/pyproject.toml` — `pyjwt`, `argon2-cffi`.

**Fuera de alcance:**

- CRUD de usuarios (`/usuarios`, B-10). Recuperación de contraseña por email (fase 2).

## 4. Diseño

### 4.1 Interfaz

Los cinco endpoints de `/auth` exactamente como en el contrato.

**Ajustes nuevos**

| Variable | Por defecto |
|---|---|
| `JWT_MINUTOS_ACCESO` | `15` |
| `REFRESH_DIAS` | `30` |
| `LOGIN_MAX_FALLOS_EMAIL` | `5` |
| `LOGIN_MAX_FALLOS_IP` | `20` |
| `LOGIN_VENTANA_MINUTOS` | `15` |

**JWT de acceso:** algoritmo `HS256` con `JWT_SECRETO`. Claims: `sub` (id del usuario), `rol`, `iat`, `exp`, `jti`. Al validar se fija la lista de algoritmos a `["HS256"]`.

**Refresh token:** 32 bytes aleatorios (`secrets.token_urlsafe(32)`). En la base se guarda solo su SHA-256.

**Dependencias para otros módulos**

- `usuario_actual` → lee `Authorization: Bearer`, valida el JWT, carga el usuario y comprueba `activo`. Errores: sin cabecera `401 no_autenticado`; token vencido, mal firmado o usuario inactivo/inexistente `401 token_invalido`.
- `requiere_rol("admin")` → `403 sin_permiso` si el rol no está en la lista.
- `requiere_token_servicio` → compara con `SERVICE_TOKEN` usando `hmac.compare_digest`; `401 token_invalido` si no coincide. Un JWT de usuario válido **no** sirve aquí.

### 4.2 Datos

Tablas `usuarios`, `refresh_tokens`, `intentos_login` y `auditoria` de B-02. Sin migraciones nuevas.

### 4.3 Reglas de negocio

1. **Login.** El email se normaliza a minúsculas y sin espacios alrededor. Si el usuario no existe, está inactivo o la contraseña no coincide: `401 credenciales_invalidas` con el mismo mensaje (“Email o contraseña incorrectos.”).
2. **Tiempo constante.** Cuando el email no existe se verifica igualmente contra un hash ficticio, para que el tiempo de respuesta no revele si el email está registrado.
3. **Límite de intentos (RN-75).** Antes de verificar la contraseña se cuentan los intentos fallidos de los últimos `LOGIN_VENTANA_MINUTOS`: si hay 5 o más para ese email, o 20 o más para esa IP, se responde `429 demasiados_intentos` con `Retry-After`, sin verificar nada. Un login correcto no borra los fallos de la IP, pero sí deja de contar los del email (solo cuentan los fallos posteriores al último acierto).
4. **Sesión nueva.** Un login correcto crea un refresh token con `familia_id` nuevo y devuelve `Sesion` con `expires_in = JWT_MINUTOS_ACCESO × 60`.
5. **Rotación (RN-72).** `/auth/refresh` con un token válido y sin usar: marca `usado_en`, crea otro con la **misma** `familia_id` y devuelve un par nuevo. La operación bloquea la fila (`SELECT … FOR UPDATE`) para que dos peticiones simultáneas no obtengan ambas un token nuevo.
6. **Reutilización (CB-14).** `/auth/refresh` con un token que ya tiene `usado_en`: se revocan **todos** los refresh tokens del usuario, se audita `auth.refresh_reutilizado` y se responde `401 token_invalido`. No hay margen de gracia: dos peticiones simultáneas con el mismo token cuentan como reutilización. Por eso el frontend comparte un único refresh entre llamadas concurrentes (A-04, regla 2) y guarda el token por pestaña.
7. **Refresh inválido.** Desconocido, vencido, revocado o de un usuario inactivo: `401 token_invalido`.
8. **Logout.** Marca `revocado_en` en el token recibido. Siempre responde 204.
9. **Cambio de contraseña.** Verifica `password_actual` (`400 password_incorrecta` si falla), guarda el hash nuevo y revoca todos los refresh tokens del usuario.
10. **Rehash.** Si tras un login correcto `argon2` indica que el hash necesita actualizarse (`check_needs_rehash`), se regenera.
11. **Auditoría (RN-76).** Se registran `auth.login`, `auth.login_fallido` (con el email intentado, sin contraseña), `auth.logout`, `auth.refresh_reutilizado` y `auth.cambio_password`.

### 4.4 Seguridad

- Argon2id con los parámetros por defecto de `argon2-cffi` (`PasswordHasher()`).
- Ni contraseñas ni tokens aparecen en logs, auditoría o mensajes de error.
- `ip_cliente` toma la IP del primer valor de `X-Forwarded-For` solo si `ENTORNO=produccion` (detrás del proxy de Render); en otro caso usa la del socket. Si no se obtiene una IP válida se usa `0.0.0.0`.
- `/auth/login`, `/auth/refresh` y `/auth/logout` son los únicos endpoints sin `usuario_actual`, junto con `/salud`.

## 5. Criterios de aceptación

- [ ] **CA-1** Dado un usuario activo, cuando hace login con credenciales correctas, entonces recibe 200 con `access_token`, `refresh_token`, `token_type: "bearer"`, `expires_in: 900` y su `usuario` sin ningún campo de contraseña.
- [ ] **CA-2** Dado un email con mayúsculas y espacios (`" Demo@Parqueadero.app "`), cuando hace login, entonces funciona igual.
- [ ] **CA-3** Dada una contraseña incorrecta, un email inexistente o un usuario inactivo, cuando se hace login, entonces los tres casos responden 401 `credenciales_invalidas` con el mismo cuerpo.
- [ ] **CA-4** Dados 5 logins fallidos del mismo email en 15 minutos, cuando llega el sexto (aunque la contraseña sea correcta), entonces responde 429 `demasiados_intentos` con cabecera `Retry-After`.
- [ ] **CA-5** Dado el bloqueo anterior, cuando el reloj avanza 16 minutos, entonces el login correcto vuelve a funcionar.
- [ ] **CA-6** Dados 20 fallos desde una misma IP con emails distintos, cuando llega otro intento desde esa IP, entonces responde 429.
- [ ] **CA-7** Dado un `access_token` válido, cuando se pide `GET /auth/me`, entonces devuelve el usuario.
- [ ] **CA-8** Dada una petición sin cabecera `Authorization`, cuando se pide `/auth/me`, entonces responde 401 `no_autenticado`; con un token vencido, alterado o firmado con `alg: none`, responde 401 `token_invalido`.
- [ ] **CA-9** Dado un refresh token válido, cuando se usa en `/auth/refresh`, entonces devuelve un par nuevo y el refresh anterior deja de servir.
- [ ] **CA-10** Dado un refresh token ya usado, cuando se usa otra vez, entonces responde 401 y el refresh más reciente de ese usuario también deja de servir (CB-14).
- [ ] **CA-11** Dado un refresh token con más de 30 días, cuando se usa, entonces responde 401 `token_invalido`.
- [ ] **CA-12** Dado un logout, cuando se usa después ese refresh token, entonces responde 401; repetir el logout responde 204.
- [ ] **CA-13** Dado un usuario que se desactiva con una sesión abierta, cuando usa su `access_token` o su refresh, entonces ambos responden 401.
- [ ] **CA-14** Dado un endpoint protegido con `requiere_rol("admin")`, cuando lo llama un operador, entonces responde 403 `sin_permiso`; cuando lo llama un admin, 200.
- [ ] **CA-15** Dado un endpoint con `requiere_token_servicio`, cuando recibe el `SERVICE_TOKEN` correcto responde 200; con un JWT de admin válido o un token incorrecto, 401.
- [ ] **CA-16** Dado un cambio de contraseña correcto, cuando termina, entonces la contraseña anterior ya no sirve, la nueva sí y los refresh tokens previos responden 401. Con `password_actual` incorrecta responde 400 `password_incorrecta`.
- [ ] **CA-17** Dado un login correcto y uno fallido, cuando se consulta `auditoria`, entonces hay un registro de cada uno y ninguno contiene la contraseña ni tokens.
- [ ] **CA-18** Dada la base de datos, cuando se inspecciona `refresh_tokens.token_hash`, entonces no coincide con el token entregado al cliente.
- [ ] **CA-19** Dadas dos peticiones simultáneas de refresh con el mismo token, cuando terminan, entonces como mucho una obtiene 200.

## 6. Pruebas requeridas

- Unitarias: hash y verificación, JWT (vencimiento, firma, algoritmo), saneado.
- Integración / API: todos los criterios, usando `reloj_fijo` para los tiempos.

## 7. Notas para el constructor

- Para probar `requiere_rol` y `requiere_token_servicio` monta rutas de prueba solo dentro de los tests; no agregues endpoints reales fuera del contrato.
- El conteo de intentos se hace con consultas sobre `intentos_login`, no en memoria: el hosting gratuito reinicia el proceso y puede haber varias instancias.
- No uses `passlib`. `argon2-cffi` directo.
- Los mensajes de error en español están pensados para mostrarse tal cual: “Email o contraseña incorrectos.”, “Demasiados intentos. Espera unos minutos e inténtalo de nuevo.”, “Tu sesión venció. Inicia sesión otra vez.”, “No tienes permiso para hacer esto.”

## 8. Preguntas abiertas

- …
