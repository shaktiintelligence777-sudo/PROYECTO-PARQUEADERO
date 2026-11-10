# A-04 · Login, sesión y guardas de ruta

| Campo | Valor |
|---|---|
| Estado | lista |
| Línea | A (demo) |
| Asignado a | Sonnet |
| Revisa | Opus |
| Depende de | A-02, A-03 |
| Rama | `feat/A-04-login-sesion` |

## 1. Objetivo

Que el usuario pueda iniciar y cerrar sesión, que la sesión sobreviva a una recarga y que cada ruta solo sea accesible con el rol adecuado.

## 2. Contexto

- `docs/ui/pantallas.md`: secciones 0 (reglas comunes), P1 y “Mi cuenta” de P9.
- Contrato: `login`, `refrescarSesion`, `logout`, `usuarioActual`, `cambiarPassword`.
- `docs/dominio.md`: RN-72 y matriz de permisos.

## 3. Alcance

**Archivos que crea o modifica:**

- `frontend/src/features/auth/ProveedorSesion.tsx` — contexto de sesión y `useSesion()`.
- `frontend/src/features/auth/almacenSesion.ts` — persistencia del refresh token.
- `frontend/src/features/auth/PaginaLogin.tsx`, `HojaCambiarPassword.tsx`.
- `frontend/src/app/RutaProtegida.tsx`, `PaginaSinPermiso.tsx`.
- `frontend/src/app/DisposicionApp.tsx` — conecta `Armazon` y `BannerDemo` con la sesión.
- `frontend/src/api/conSesion.ts` — envoltorio de `ApiClient` que renueva el token ante un 401.
- Pruebas junto a cada archivo.

**Puede tocar:**

- `frontend/src/app/rutas.tsx`, `frontend/src/app/App.tsx`, `frontend/src/api/index.ts`.

**Fuera de alcance:**

- Adaptador `live` (C-01). Recuperación de contraseña (fase 2).

## 4. Diseño

### 4.1 Interfaz

`useSesion()` devuelve `{ estado: "cargando" | "anonimo" | "autenticado", usuario, iniciar(email, password), cerrar() }`.

`RutaProtegida` props: `roles?: Rol[]`. Sin sesión redirige a `/login` guardando la ruta de origen; con sesión y rol insuficiente muestra `PaginaSinPermiso`.

### 4.2 Datos

- `access_token`: **solo en memoria**.
- `refresh_token`: en `sessionStorage`, clave `parqueadero.sesion`. Se borra al cerrar sesión.

### 4.3 Reglas de negocio

1. Al cargar la app, si hay refresh token guardado se llama `refrescarSesion`; mientras tanto el estado es `cargando` y se muestra un `Esqueleto` de la app, no el login.
2. Ante un 401 en cualquier llamada, `conSesion` intenta **un** refresh y repite la llamada original. Varias llamadas que fallan a la vez comparten un único refresh.
3. Si el refresh falla: se limpia la sesión, se va a `/login` con el mensaje de sesión vencida y, tras entrar, se vuelve a la ruta de origen.
4. El refresh token se reemplaza por el nuevo en cada rotación.
5. Al cerrar sesión se llama `logout`, se limpia la caché de TanStack Query y se va a `/login`, aunque `logout` falle.
6. Destino tras el login si no hay ruta de origen: operador `/acceso`, admin `/`.
7. Textos, validaciones y errores: los de P1 y de la sección 0.3 de `pantallas.md`.
8. Tras cambiar la contraseña se cierra la sesión y el login muestra “Contraseña cambiada. Inicia sesión con la nueva.”

### 4.4 Seguridad

- Ningún token se escribe en `localStorage`, en la URL ni en la consola.
- La contraseña no se guarda en ningún estado tras enviar el formulario.

## 5. Criterios de aceptación

- [ ] **CA-1** Dado el login, cuando se envía vacío, entonces aparecen “Escribe tu email.” y “Escribe tu contraseña.” y no se llama a la API.
- [ ] **CA-2** Dadas credenciales correctas de admin, cuando se envía, entonces se llega a `/`; con las de operador, a `/acceso`.
- [ ] **CA-3** Dado `credenciales_invalidas`, cuando responde la API, entonces se muestra “Email o contraseña incorrectos.”, la contraseña queda vacía y con el foco, y el email se conserva.
- [ ] **CA-4** Dado `demasiados_intentos`, entonces se muestra “Demasiados intentos. Espera unos minutos e inténtalo de nuevo.”
- [ ] **CA-5** Dado un usuario sin sesión, cuando abre `/clientes`, entonces va a `/login` y, tras iniciar sesión, llega a `/clientes`.
- [ ] **CA-6** Dado un operador, cuando abre `/configuracion` o `/historial`, entonces ve “No tienes permiso para ver esta página.”
- [ ] **CA-7** Dada una sesión iniciada, cuando se recarga la página, entonces sigue autenticado sin pasar por el login.
- [ ] **CA-8** Dadas tres llamadas simultáneas que reciben 401, cuando se resuelven, entonces `refrescarSesion` se llamó una sola vez y las tres devuelven datos.
- [ ] **CA-9** Dado un refresh que falla, entonces se muestra el login con “Tu sesión venció. Inicia sesión otra vez.”
- [ ] **CA-10** Dado “Cerrar sesión”, cuando se pulsa, entonces `sessionStorage` no tiene la clave de sesión, la caché de consultas está vacía y se muestra el login.
- [ ] **CA-11** Dado el modo demo, cuando se pulsa “Usar estos datos”, entonces los campos se rellenan con el usuario de prueba y no se envía el formulario.
- [ ] **CA-12** Dado un cambio de contraseña con confirmación distinta, entonces se muestra “Las contraseñas no coinciden.”; con `password_incorrecta`, “La contraseña actual no es correcta.”; si es correcto, se cierra la sesión con el mensaje de la regla 8.
- [ ] **CA-13** Dada una sesión iniciada, cuando se inspecciona `localStorage`, entonces no contiene ningún token.

## 6. Pruebas requeridas

- UI con Testing Library sobre `MockApi` y reloj fijo; prueba unitaria de `conSesion` para CA-8.

## 7. Notas para el constructor

- El botón “mostrar contraseña” cambia el `type` del campo y su `aria-label`.
- `conSesion` debe servir sin cambios cuando C-01 conecte el adaptador `live`.

## 8. Preguntas abiertas

- …
