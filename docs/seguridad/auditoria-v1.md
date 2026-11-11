# Auditoría de seguridad v1

> Entregable de la spec **C-03**. Fecha: 2026-11-11. Base auditada: `main` en `fa4ef8f` (tras fusionar C-01).
> Auditor: agente constructor Opus. Revisa: Fable. El informe no contiene secretos ni datos reales.

## 1. Alcance

- **Backend** (`backend/app`): autenticación, autorización, validación de entradas, salidas, errores, cabeceras, SQL, auditoría, endpoint interno y configuración.
- **Frontend** (`frontend/src`): almacenamiento de tokens, renderizado de HTML, recursos externos, contenido del build `live` y exportación CSV del adaptador mock.
- **Repositorio**: historial de git, dependencias de Python y npm, y workflows de GitHub Actions.
- **Despliegue** (`render.yaml`, `docs/operacion.md`): solo la configuración declarada. Por la spec quedan fuera las pruebas de intrusión sobre Render, Neon y GitHub.

Todavía no están construidas en `main` estas operaciones del contrato: `exportarHistorialAccesos` y `resumenDashboard` (B-08), y `listarUsuarios`, `crearUsuario`, `editarUsuario`, `obtenerConfiguracion` y `editarConfiguracion` (B-10). Las pruebas de C-03 las listan en `PENDIENTES` (`backend/tests/seguridad/contrato.py`). Cuando esas specs se fusionen, `test_ca3_pendientes_al_dia` obliga a quitarlas de la lista, y desde ese momento entran en la matriz de permisos y en las pruebas de cabeceras.

## 2. Método

1. Se leyó el código de nuevo, sin dar por bueno lo que ya tenía prueba (sección 7 de la spec).
2. Se escribieron pruebas permanentes **generadas desde `contracts/openapi.yaml`**:
   - `tests/seguridad/test_matriz_permisos.py`: CA-1, CA-2 y CA-3.
   - `tests/seguridad/test_cabeceras.py`: CA-4.
   - `tests/seguridad/test_sql.py`: CA-5.
   Se comprobó que la matriz detecta una regresión: al quitar `requiere_rol("admin")` de `crearPlan`, CA-2 falla.
3. Las dependencias se analizaron con `pip-audit 2.10.1` y `npm audit`. Los secretos se buscaron con expresiones regulares sobre `git log -p --all`, y en CI se buscan con `gitleaks 8.18.4`.
4. Para comprobar el build `live`, se compiló con `VITE_API_MODE=live` y se buscaron en él las credenciales del demo.

## 3. Resultado por punto de la lista

| # | Punto | Resultado | Evidencia |
|---|---|---|---|
| 1a | Argon2id | Cumple | `argon2-cffi` con sus valores por defecto: Argon2id, t=3, m=64 MiB, p=4, sal de 16 bytes (perfil RFC 9106 de poca memoria). Se rehace el hash al iniciar sesión si cambian los parámetros (`necesita_rehash`). |
| 1b | Login indistinguible | Cumple | Mismo `401 credenciales_invalidas` si el email no existe, si la contraseña es incorrecta o si el usuario está inactivo. Cuando el email no existe se verifica contra un hash señuelo para igualar el tiempo de respuesta (`app/core/seguridad.py`). |
| 1c | Límite de intentos | Cumple, con hallazgo **H-05** | 5 fallos por email o 20 por IP en 15 min dan `429` con `Retry-After` (pruebas de B-03). El límite por IP depende de `X-Forwarded-For`; ver H-05. |
| 1d | JWT | Cumple | Algoritmo fijo `HS256` (`algorithms=[ALGORITMO]`, rechaza `alg: none`). Se exigen `sub`, `exp`, `iat` y `jti`. Duran 15 min. Secreto de 32 caracteres o más, validado al arrancar. |
| 1e | Refresh rotativo | Cumple | Token opaco de 32 bytes, guardado como SHA-256. Es de un solo uso y se bloquea la fila con `FOR UPDATE`. Si se reutiliza, se revocan todas las sesiones (CB-14). Al cambiar la contraseña o desactivar al usuario también se revocan. |
| 2a | 401 sin token | Cumple | `test_ca1_*`: todas las operaciones con `bearerAuth` o `serviceToken`, sin token, con un token inválido y con el token de servicio usado como JWT. |
| 2b | 403 por rol | Cumple | `test_ca2_*`: todas las operaciones con `x-roles: [admin]` llamadas por un operador. Como complemento, se comprueba que las operaciones de ambos roles no rechazan al operador. El rol se lee de la base de datos, no del token. |
| 2c | Rutas = contrato | Cumple | `test_ca3_*`: la app no tiene rutas de más ni le faltan, salvo las `PENDIENTES` ya indicadas. Está prohibido `include_in_schema` en `app/`. `/docs` y `/openapi.json` se desactivan en producción (B-01). |
| 3a | Campos desconocidos | Cumple | Todas las entradas heredan de `Entrada` (`extra="forbid"`). Se comprobó en el esquema OpenAPI de la app que cada cuerpo de petición, incluidos los anidados, tiene `additionalProperties: false`. |
| 3b | Límites de longitud | Cumple | Todo texto de entrada tiene `max_length`, `pattern`, `enum` o formato. `documento` y `telefono` validan su patrón aunque no aparezca en el OpenAPI generado (se verificó con una entrada de 500 caracteres). |
| 3c | SQL con cadenas | **Corregido (H-03)** | `test_ca5_*` revisa el árbol sintáctico de `text()`, `execute()` y `exec_driver_sql()`, y la regla S608 de ruff está activa. |
| 4a | Sin secretos en respuestas | Cumple | Ningún esquema de respuesta tiene `password_hash`. Los únicos tokens que se devuelven son los de `Sesion` (login y refresh). `auditoria.datos` nunca lleva contraseñas ni tokens (B-03). |
| 4b | Sin secretos en logs | Cumple | Los logs del backend no incluyen cabeceras ni cuerpos de petición. Los emails se enmascaran (`enmascarar`). `crear_admin` lee la contraseña con `getpass` y no la imprime. |
| 4c | 500 sin trazas | Cumple | El manejador global responde `error_interno` y la traza va solo al log (B-01 CA-5, y `test_ca4_errores_internos_tambien_las_llevan`). |
| 5a | HTTPS | Cumple; falta verificarlo en el despliegue | Render solo sirve HTTPS. La API manda HSTS en producción. GitHub Pages es HTTPS y el navegador bloquea llamadas a una API `http://` (contenido mixto). La conexión a PostgreSQL exige TLS en producción (B-09, `ConexionInsegura`). |
| 5b | CORS | Cumple | `CORS_ORIGENES` en `render.yaml` es solo el origen de Pages. `*` se rechaza al arrancar. `allow_credentials=False`. Hay una prueba del preflight con un origen no permitido (B-01 CA-8). |
| 5c | Cabeceras | **Corregido (H-02)** | `test_ca4_*`: `nosniff`, `no-referrer` y `Cache-Control: no-store` en toda respuesta a una petición con `Authorization`, incluidos 401, 403, 404, 422 y 500. |
| 6a | Tokens fuera de `localStorage` y de la URL | Cumple | El token de acceso solo está en memoria. El refresh está en `sessionStorage`, como define A-04 (A-04 CA-13). Ningún token va en la URL: el adaptador live los manda en `Authorization` y en el cuerpo. |
| 6b | `dangerouslySetInnerHTML` | Cumple | No aparece, ni tampoco `innerHTML` ni `eval`, en `frontend/src`. |
| 6c | Build live sin el demo | Cumple | El build con `VITE_API_MODE=live` no genera el chunk `MockApi` ni contiene `demo1234` ni `demo@parqueadero.app`. `pages.yml` lo comprueba en cada publicación live (C-01 CA-10). |
| 6d | Sin recursos de terceros | Cumple | `index.html` y el CSS no cargan fuentes, scripts ni imágenes externas. La única conexión saliente es a `VITE_API_URL`. |
| 7a | Historial sin secretos | Cumple | Los 51 commits de todas las ramas se revisaron con patrones de claves de AWS, GitHub, Resend, Slack, claves privadas, URLs de PostgreSQL con contraseña y variables `*_SECRET*`, `*_TOKEN` y `*_PASSWORD`. Solo hay valores ficticios de pruebas y ejemplos. Ningún `.env` llegó nunca al repositorio. En CI, `gitleaks` revisa todo el historial (`.gitleaks.toml` solo excluye los valores ficticios). |
| 7b | Dependencias | **Corregido (H-04)** | `pip-audit`: 0 vulnerabilidades. `npm audit --audit-level=high`: pasa; quedan 9 moderadas, todas de herramientas de desarrollo salvo la de H-07. |
| 8a | Copias y restauración | Pendiente de verificar en el despliegue | Neon guarda historial para restauración a un punto en el tiempo, según su plan. El procedimiento está en `docs/operacion.md`. La restauración **no se ha probado**, porque las cuentas de Neon y Render aún no existen (B-09). Ver sección 6. |
| 8b | Usuario de base de datos sin superusuario | Pendiente de verificar en el despliegue | Neon no da `SUPERUSER` a los roles de los proyectos. Para comprobarlo: `SELECT rolsuper FROM pg_roles WHERE rolname = current_user;` debe devolver `f`. |
| 8c | Auditoría en toda escritura | Cumple | Cada caso de uso que escribe en `accesos`, `auth`, `clientes`, `membresias`, `motos`, `pagos` y `planes`, el job de notificaciones y `crear_admin` llama a `registrar_auditoria` en la misma transacción. Cada spec lo prueba. Un trigger impide modificar o borrar filas de `auditoria`. |
| 9 | Endpoint interno | Cumple | `requiere_token_servicio` usa `hmac.compare_digest`. Un JWT de usuario no sirve ahí (`test_ca1_jwt_de_usuario_no_sirve_en_rutas_internas`). `SERVICE_TOKEN` debe tener 32 caracteres o más. |
| 10 | CSV | **Corregido en el mock (H-06)**; el backend llega con B-08 | El endpoint real todavía no existe. Su spec (B-08, regla 7) ya exige el prefijo `'`. El adaptador mock no lo aplicaba y ya está corregido. |

## 4. Hallazgos

| ID | Gravedad | Hallazgo | Estado |
|---|---|---|---|
| H-01 | Alta | **El backend no tenía CI.** El job `backend` de `ci.yml` (B-01 CA-9) se perdió al resolver un conflicto de fusión con el CI del frontend (`4a9f240`). Desde entonces, B-04 a B-07, B-09 y C-01 se fusionaron sin que CI ejecutara lint, tipos ni pruebas del backend. | Corregido: `.github/workflows/ci-backend.yml`, en un archivo propio para que no vuelva a pisarse. |
| H-02 | Media | **Faltaba `Cache-Control: no-store`** en las respuestas autenticadas (solo lo tenían login y refresh). Además, las respuestas 500 no llevaban ninguna cabecera de seguridad, porque las genera `ServerErrorMiddleware`, que queda fuera de los middlewares de la app. | Corregido: `app/core/cabeceras.py`, usado por el middleware y por el manejador de 500. |
| H-03 | Baja | `semilla.reiniciar` construía el `TRUNCATE` con un f-string, a partir de una tupla constante. No era explotable, pero incumplía la regla de CA-5. | Corregido: sentencia literal `SQL_VACIAR`, con una prueba que la compara con los modelos. |
| H-04 | Crítica (solo en desarrollo) | Las dependencias de desarrollo tenían 2 avisos críticos y 1 alto: `vitest` 2.1 y `tinypool` (RCE por contaminación de prototipos), y `vite` 5.4 (servidor de desarrollo). No llegan al paquete publicado, pero sí corren en las máquinas de desarrollo y en CI. | Corregido: `vite` 6.4.6 y `vitest` 4.1.12. Lint, tipos, las 341 pruebas y los builds mock y live pasan. |
| H-05 | Media | El límite de intentos por IP usa el primer valor de `X-Forwarded-For`, que el cliente puede falsificar si el proxy agrega en vez de reemplazar. El límite por email no se ve afectado. | Issue [#19](https://github.com/shaktiintelligence777-sudo/PROYECTO-PARQUEADERO/issues/19). Contradice la spec B-03 y requiere el despliegue para verificarse. |
| H-06 | Baja | La exportación CSV del adaptador mock no neutralizaba fórmulas (`=`, `+`, `-`, `@`). Solo afecta a los datos del propio visitante en el demo. | Corregido, con una prueba en `MockApi.test.ts`. |
| H-07 | Media | `react-router-dom` 6 tiene dos avisos moderados (redirección abierta en `<Link>` e inyección en hidratación SSR). La app usa `HashRouter` sin rutas que vengan del usuario y no usa SSR. | Issue [#20](https://github.com/shaktiintelligence777-sudo/PROYECTO-PARQUEADERO/issues/20): migrar a React Router 7. |
| H-08 | Baja | No hay CSP en el frontend ni límite de tamaño del cuerpo de las peticiones. | Issue [#21](https://github.com/shaktiintelligence777-sudo/PROYECTO-PARQUEADERO/issues/21). |

**No queda abierto ningún hallazgo alto ni crítico.** Los medios y bajos sin corregir tienen issue y responsable (regla 4.3.1).

## 5. Riesgos aceptados

Ninguno por ahora. Un riesgo aceptado exige la aprobación del dueño (regla 4.3.2), y ninguno se ha propuesto como tal. Los tokens de acceso siguen valiendo hasta 15 minutos después de cambiar la contraseña o desactivar al usuario. Es la decisión de diseño de RN-72; para que conste como riesgo aceptado, falta que el dueño lo apruebe.

## 6. Pendiente para cerrar la auditoría en el despliegue

Cuando existan los servicios de B-09:

1. `curl -sI https://<api>/api/v1/salud` debe devolver HSTS, `nosniff` y `no-referrer`, y `http://` debe redirigir a HTTPS.
2. Un preflight desde un origen que no sea el de Pages no debe devolver `Access-Control-Allow-Origin`.
3. En Neon: `SELECT rolsuper FROM pg_roles WHERE rolname = current_user;` debe devolver `f`.
4. Restaurar la base en una rama de Neon a un punto anterior y comprobar que la API arranca contra ella, siguiendo `docs/operacion.md`.
5. Verificar H-05 (issue #19).

## 7. Pruebas permanentes en CI

| Workflow | Qué ejecuta |
|---|---|
| `ci-backend.yml` | `ruff check` (con S608), `ruff format --check`, `mypy app` y `pytest`, que incluye `tests/seguridad/`. |
| `seguridad.yml` | `pip-audit`, `npm audit --audit-level=high` y `gitleaks` sobre todo el historial, en cada PR, en `main` y los lunes. |
| `ci.yml` | El CI del frontend, que incluye la prueba de H-06. |
