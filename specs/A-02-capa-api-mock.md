# A-02 · Capa de API y adaptador simulado

| Campo | Valor |
|---|---|
| Estado | lista |
| Línea | A (demo) |
| Asignado a | Sonnet |
| Revisa | Opus |
| Depende de | F-02, A-01 |
| Rama | `feat/A-02-capa-api-mock` |

## 1. Objetivo

Dar a las pantallas una única forma de pedir datos (`ApiClient`) y una implementación simulada que se comporta como el backend real, con datos guardados en el navegador. Es lo que hace posible el demo sin servidor.

## 2. Contexto

- `contracts/openapi.yaml` completo: el mock implementa todas las operaciones menos `ejecutarJobNotificaciones` y `salud`.
- `docs/dominio.md`: todas las reglas `RN-xx` (el mock debe aplicarlas igual que el backend) y la sección 6 (semilla).

## 3. Alcance

**Archivos que crea o modifica:**

- `frontend/src/api/tipos.ts` — generado desde el contrato con `openapi-typescript`. No se edita a mano.
- `frontend/src/api/client.ts` — interfaz `ApiClient` y clase `ErrorApi`.
- `frontend/src/api/index.ts` — `obtenerApi()`: devuelve el adaptador según `VITE_API_MODE`.
- `frontend/src/api/mock/almacen.ts` — lectura y escritura en `localStorage`, versión y reinicio.
- `frontend/src/api/mock/semilla.ts` — datos iniciales con fechas relativas a hoy.
- `frontend/src/api/mock/reglas.ts` — funciones puras del dominio (estado de membresía, cálculo de periodo, advertencias).
- `frontend/src/api/mock/MockApi.ts` — implementación de `ApiClient`.
- `frontend/src/api/live/LiveApi.ts` — **solo un esqueleto** que lanza “no implementado”; lo completa C-01.
- `frontend/src/api/hooks/*.ts` — hooks de TanStack Query por recurso.
- `frontend/src/api/claves.ts` — claves de caché.
- Pruebas `*.test.ts` junto a cada archivo de `mock/`.
- `frontend/package.json` — script `gen:api` y dependencia `openapi-typescript`.

**Fuera de alcance:**

- Pantallas. Manejo de sesión en la UI y guardas (A-04). Adaptador `live` real (C-01).

## 4. Diseño

### 4.1 Interfaz

**`ApiClient`**: un método por operación del contrato, con el **mismo nombre que su `operationId`**. Parámetros y resultado tipados con `tipos.ts`. Ejemplos:

```ts
interface ApiClient {
  login(datos: LoginEntrada): Promise<Sesion>;
  refrescarSesion(datos: RefreshEntrada): Promise<Sesion>;
  logout(datos: RefreshEntrada): Promise<void>;
  usuarioActual(): Promise<Usuario>;
  listarClientes(filtros?: FiltrosClientes): Promise<Pagina<ClienteResumen>>;
  consultarPlaca(placa: string): Promise<ConsultaPlaca>;
  registrarEntrada(datos: AccesoEntrada): Promise<AccesoRegistrado>;
  previsualizarPago(datos: { membresia_id: string; periodos?: number }): Promise<PagoVistaPrevia>;
  exportarHistorialAccesos(filtros: FiltrosHistorial): Promise<Blob>;
  // … el resto de operaciones del contrato
  establecerToken(token: string | null): void; // token de acceso para las siguientes llamadas
}
```

**`ErrorApi`** (`extends Error`): `codigo: CodigoError`, `status: number`, `mensaje: string`, `detalles?: { campo: string; mensaje: string }[]`. Todo fallo de cualquier adaptador se lanza como `ErrorApi`.

**Hooks** (uno por operación que usan las pantallas): consultas `useClientes(filtros)`, `useCliente(id)`, `useMotosDentro()`, `useResumenDashboard()`, etc.; mutaciones `useRegistrarEntrada()`, `useRegistrarPago()`, etc. Cada mutación invalida las claves afectadas:

| Mutación | Invalida |
|---|---|
| entrada, salida | `accesos`, `dashboard`, `motos` |
| crear o editar cliente o moto | `clientes`, `motos` |
| crear, cambiar plan o cancelar membresía | `membresias`, `clientes`, `pagos`, `dashboard` |
| registrar o anular pago | `pagos`, `membresias`, `clientes`, `dashboard` |
| planes, usuarios, configuración | su propia clave (configuración invalida además `membresias` y `dashboard`) |

### 4.2 Datos

- Todo el estado del mock vive en una sola clave de `localStorage`: `parqueadero.demo.v1`, como JSON con una colección por entidad (`usuarios`, `clientes`, `motos`, `planes`, `membresias`, `pagos`, `estancias`, `notificaciones`, `configuracion`) y `sembrado_en`.
- Si la clave no existe, está corrupta o es de otra versión, se siembra de nuevo.
- `reiniciarDemo()` borra la clave y vuelve a sembrar.
- La sesión simulada **no** se guarda aquí: el mock emite tokens ficticios (`mock.<id de usuario>.<aleatorio>`) y los valida en memoria y contra `sessionStorage` (`parqueadero.demo.sesion`).

### 4.3 Reglas de negocio

1. El mock responde con **exactamente** las formas del contrato, incluidos los campos calculados (`estado`, `dias_restantes`, `dentro`, `duracion_minutos`, `placas`).
2. El mock aplica las mismas reglas que el backend y falla con los mismos `codigo` y `status`: RN-01, RN-12, RN-13, RN-21, RN-30 a RN-35, RN-40 a RN-47, RN-50 a RN-53, RN-74, y las validaciones de esquema (422 `validacion` con `detalles`).
3. El mock respeta los roles: una operación `x-roles: [admin]` llamada por un operador lanza 403 `sin_permiso`; sin token, 401 `no_autenticado`.
4. Las contraseñas de la semilla se comparan en claro dentro del mock (es un demo con datos ficticios); nunca se devuelven en ninguna respuesta.
5. Cada llamada espera entre 150 y 400 ms para que se vean los estados de carga. En pruebas, la espera es 0.
6. Paginación, filtros y orden idénticos a los descritos en el contrato.
7. “Hoy” y “ahora” salen de un único módulo `reloj` inyectable, para fijarlos en pruebas.
8. La semilla cumple la sección 6 de `docs/dominio.md`: con ella recién creada existen membresías en los cuatro estados, al menos 5 motos dentro y pagos de hoy.
9. `exportarHistorialAccesos` genera el CSV en el navegador con las columnas y el formato del contrato.
10. El mock no envía datos a ningún servidor.

### 4.4 Seguridad

- En modo `mock` no existe ninguna petición de red hacia un backend.
- Los datos de la semilla son ficticios (documentos `900000…`, emails `@example.com`).

## 5. Criterios de aceptación

- [ ] **CA-1** Dado `VITE_API_MODE=mock`, cuando se llama `obtenerApi()`, entonces devuelve una instancia de `MockApi`; todos los `operationId` del contrato (menos `salud` y `ejecutarJobNotificaciones`) existen como métodos. Una prueba recorre el YAML y lo comprueba.
- [ ] **CA-2** Dado un almacenamiento vacío, cuando se hace la primera llamada, entonces se siembra y `login` con `demo@parqueadero.app` / `demo1234` devuelve una `Sesion` con rol `admin`.
- [ ] **CA-3** Dada una contraseña incorrecta, cuando se hace `login`, entonces lanza `ErrorApi` con `status 401` y `codigo "credenciales_invalidas"`.
- [ ] **CA-4** Dada la semilla, cuando se llama `listarMembresias` con cada estado, entonces cada uno devuelve al menos un elemento y los `dias_restantes` son coherentes con `fecha_vencimiento`.
- [ ] **CA-5** Dada una moto fuera, cuando se llama `registrarEntrada` con la placa escrita `abc-12d`, entonces devuelve la estancia con la placa normalizada; una segunda llamada lanza 409 `moto_ya_dentro`.
- [ ] **CA-6** Dada una placa inexistente, cuando se llama `consultarPlaca` o `registrarEntrada`, entonces lanza 404 `moto_no_registrada`.
- [ ] **CA-7** Dado un cliente con membresía vencida, cuando entra su moto, entonces la respuesta incluye la advertencia `membresia_vencida` y la entrada queda registrada.
- [ ] **CA-8** Dada una membresía que vence en 2 días con plan de 30 días, cuando se registra un pago de 1 periodo, entonces `periodo_desde` es el día siguiente al vencimiento y el vencimiento nuevo es 30 días posterior al anterior (CB-2).
- [ ] **CA-9** Dada una membresía vencida hace 10 días, cuando se registra un pago, entonces `periodo_desde` es hoy (CB-3). `previsualizarPago` devuelve los mismos valores sin modificar nada.
- [ ] **CA-10** Dado un monto distinto del sugerido y sin `nota`, cuando se registra el pago, entonces lanza 422 `validacion` con `detalles[0].campo = "nota"`.
- [ ] **CA-11** Dado el último pago de una membresía con dos pagos, cuando un admin lo anula, entonces el vencimiento vuelve al valor anterior; anular un pago que no es el último lanza 409 `pago_no_anulable`.
- [ ] **CA-12** Dado un cliente con membresía vigente, cuando se crea otra, entonces lanza 409 `membresia_existente`.
- [ ] **CA-13** Dado un operador, cuando llama `listarHistorialAccesos`, `anularPago` o `editarConfiguracion`, entonces lanza 403 `sin_permiso`.
- [ ] **CA-14** Dados datos modificados, cuando se crea una nueva instancia de `MockApi` (simula recargar la página), entonces los cambios siguen ahí; tras `reiniciarDemo()` vuelven los datos de la semilla.
- [ ] **CA-15** Dado `listarClientes({ q: "jose" })` y un cliente llamado “José”, entonces lo encuentra; con `q` igual al prefijo de una de sus placas, también.
- [ ] **CA-16** Dado un JSON corrupto en `parqueadero.demo.v1`, cuando se hace una llamada, entonces se vuelve a sembrar sin lanzar error.
- [ ] **CA-17** Dado `npm run gen:api`, cuando se ejecuta sin cambios en el contrato, entonces `tipos.ts` no cambia (CI lo comprueba con `git diff --exit-code`).
- [ ] **CA-18** Dada la mutación `useRegistrarEntrada`, cuando termina bien, entonces las consultas `accesos` y `dashboard` se invalidan.

## 6. Pruebas requeridas

- Unitarias: `reglas.ts` (estado, periodo, advertencias) con tabla de casos que incluya CB-2, CB-3, CB-4 y el día exacto del vencimiento; `almacen.ts`; `semilla.ts`.
- Integración: `MockApi` para todos los criterios, con `localStorage` de `jsdom` y reloj fijo.
- Hooks: CA-18 con `renderHook`.

## 7. Notas para el constructor

- `gen:api`: `openapi-typescript ../contracts/openapi.yaml -o src/api/tipos.ts`. Exporta alias legibles (`type Cliente = components["schemas"]["ClienteDetalle"]`…) desde `client.ts`.
- Mantén `reglas.ts` sin dependencias del almacenamiento: son las funciones que más se prueban y que sirven de referencia a quien implemente B-06.
- Calcula las fechas con aritmética de calendario sobre cadenas `YYYY-MM-DD` en `America/Bogota`; no uses `new Date("YYYY-MM-DD")` para sumar días, porque depende de la zona de la máquina.
- La búsqueda sin tildes: `texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()`.

## 8. Preguntas abiertas

- …
