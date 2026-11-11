# C-01 · Adaptador live del frontend

| Campo | Valor |
|---|---|
| Estado | hecha |
| Línea | C (convergencia) |
| Asignado a | Opus |
| Revisa | Fable |
| Depende de | A-02, A-04, B-03 |
| Rama | `feat/C-01-adaptador-live` |

## 1. Objetivo

Conectar el frontend con el backend real cambiando solo una variable de entorno, sin tocar ninguna pantalla.

## 2. Contexto

- `contracts/openapi.yaml` completo.
- `specs/A-02-capa-api-mock.md` (interfaz `ApiClient`, `ErrorApi`) y `specs/A-04-login-sesion.md` (`conSesion`).
- `docs/ROADMAP.md` secciones 1 y 2.6.

## 3. Alcance

**Archivos que crea o modifica:**

- `frontend/src/api/live/LiveApi.ts` — implementación HTTP de `ApiClient`.
- `frontend/src/api/live/http.ts` — `fetch` con base, cabeceras, tiempo límite y traducción de errores.
- Pruebas junto a cada archivo.
- `.github/workflows/pages.yml` — build con el modo y la URL tomados de variables del repositorio.

**Puede tocar:**

- `frontend/src/api/index.ts`, `frontend/src/lib/entorno.ts`, `frontend/.env.example`.

**Fuera de alcance:**

- Cambios en pantallas, en el mock o en el contrato.

## 4. Diseño

### 4.1 Interfaz

`LiveApi implements ApiClient`: cada método llama a la operación del contrato con el mismo `operationId`.

`pages.yml`: `VITE_API_MODE=${{ vars.API_MODE || 'mock' }}` y `VITE_API_URL=${{ vars.API_URL }}`. Mientras el dueño no defina esas variables, se sigue publicando el demo.

### 4.2 Datos

Ninguno propio. Los tokens los gestiona `conSesion` (A-04).

### 4.3 Reglas de negocio

1. Todas las peticiones van a `VITE_API_URL + "/api/v1"`; con `VITE_API_MODE=live` y sin URL, la app muestra un error de configuración claro en vez de arrancar.
2. Cabecera `Authorization: Bearer <token>` cuando hay token; `Content-Type: application/json` cuando hay cuerpo. `credentials: "omit"`.
3. Toda respuesta no 2xx se convierte en `ErrorApi` con el `codigo`, `mensaje` y `detalles` del cuerpo. Si el cuerpo no cumple el esquema `Error`: `codigo: "error_interno"` y un mensaje genérico.
4. Fallo de red o tiempo límite (15 segundos): `ErrorApi` con `status: 0`, `codigo: "error_interno"` y el mensaje “Sin conexión. Revisa tu internet e inténtalo de nuevo.”
5. Las respuestas 204 devuelven `undefined`. `exportarHistorialAccesos` devuelve un `Blob`.
6. Los parámetros de consulta omiten valores `undefined`, `null` y cadenas vacías.
7. `LiveApi` no reintenta por su cuenta; la renovación de token ante un 401 es de `conSesion`.
8. Las consultas de solo lectura reintentan una vez ante `status: 0` (configuración de TanStack Query); las mutaciones no reintentan nunca.

### 4.4 Seguridad

- Sin cookies. Los tokens nunca van en la URL.
- El build en modo `live` no incluye la semilla ni las contraseñas del demo (`MockApi` se carga con importación dinámica solo en modo `mock`).

## 5. Criterios de aceptación

- [ ] **CA-1** Dado `VITE_API_MODE=live`, cuando se llama `obtenerApi()`, entonces devuelve `LiveApi`; una prueba recorre el contrato y comprueba que cada `operationId` (menos `salud` y `ejecutarJobNotificaciones`) existe y usa el método y la ruta correctos.
- [ ] **CA-2** Dado un token establecido, entonces cada petición lleva `Authorization: Bearer …`; `login` no la lleva.
- [ ] **CA-3** Dada una respuesta 409 con cuerpo `Error`, entonces se lanza `ErrorApi` con ese `codigo`, `status: 409` y `mensaje`.
- [ ] **CA-4** Dada una respuesta 422 con `detalles`, entonces `ErrorApi.detalles` los contiene.
- [ ] **CA-5** Dada una respuesta 502 con HTML, entonces se lanza `ErrorApi` con `codigo: "error_interno"`.
- [ ] **CA-6** Dado un fallo de red o una respuesta que tarda más de 15 segundos, entonces se lanza `ErrorApi` con `status: 0` y el mensaje de sin conexión.
- [ ] **CA-7** Dado `listarClientes({ q: "", pagina: 2 })`, entonces la URL pedida es `…/clientes?pagina=2`.
- [ ] **CA-8** Dado un `access_token` vencido y un refresh válido, cuando se hace una consulta, entonces el usuario obtiene los datos sin ver el login (integración con `conSesion`).
- [ ] **CA-9** Dado `VITE_API_MODE=live` sin `VITE_API_URL`, entonces la app muestra “Falta configurar la dirección del servidor.” y no hace peticiones.
- [ ] **CA-10** Dado el build en modo `live`, cuando se busca `demo1234` en el paquete principal, entonces no aparece.
- [ ] **CA-11** Dado el frontend en modo `live` contra el backend local con la semilla, cuando se recorre login, entrada, salida, alta de cliente, alta de membresía y pago, entonces todo funciona sin cambios en las pantallas.
- [ ] **CA-12** Dado el modo `live`, entonces el banner de demo no aparece.

## 6. Pruebas requeridas

- Unitarias con `fetch` simulado (`msw`) para CA-1 a CA-9.
- CA-11: prueba de integración con `docker compose` (backend y base reales), ejecutable en CI.

## 7. Notas para el constructor

- Si durante la integración aparece una diferencia entre el backend y el contrato, **no** la compenses en `LiveApi`: anótala en “Preguntas abiertas”; se corrige el backend o, si el contrato está mal, lo corrige Fable.

## 8. Preguntas abiertas

- **Archivos fuera del alcance (para Fable).** Para cumplir CA-9, CA-10 y la regla 8 sin tocar el aspecto de ninguna pantalla hice cambios mínimos fuera de la lista:
  - `src/main.tsx` y el nuevo `src/app/ErrorConfiguracion.tsx` (usa `EstadoError` de `ui/`) muestran el aviso de configuración en lugar de la app (CA-9).
  - `src/app/App.tsx` aplica la política de reintentos: las lecturas reintentan una vez solo con `status: 0` y las mutaciones nunca (regla 8).
  - `src/app/ConexionBannerDemo.tsx` ya no importa `MockApi` de forma estática; reinicia el demo con `reiniciarDemo()` de `src/api/index.ts` (CA-10).
  - `src/features/auth/PaginaLogin.tsx`: el aviso con las credenciales del demo depende además de `DEMO_EN_BUILD`, una constante que Vite resuelve al compilar, para que `demo1234` no quede en el paquete live (CA-10). La pantalla se ve igual en los dos modos.
- **`msw`.** Las pruebas simulan `fetch` con `vi.fn` inyectado en `crearHttp`, sin añadir dependencias (`package.json` no está en el alcance).
- **CA-11 en CI.** `src/api/live/integracion.test.ts` recorre login, entrada, salida, alta de cliente, alta de membresía y pagos contra un backend real; solo corre si se define `C01_API_URL`. Pasó contra el backend local con la semilla. Conectarlo a CI requiere tocar `.github/workflows/ci.yml`, fuera del alcance.
- **Diferencias backend/contrato.** No apareció ninguna en el recorrido.
