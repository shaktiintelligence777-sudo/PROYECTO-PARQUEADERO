# A-01 · Andamiaje del frontend

| Campo | Valor |
|---|---|
| Estado | lista |
| Línea | A (demo) |
| Asignado a | Sonnet |
| Revisa | Opus |
| Depende de | F-03, F-05 |
| Rama | `feat/A-01-andamiaje-frontend` |

## 1. Objetivo

Dejar una SPA vacía pero completa en su estructura: compila, pasa lint y pruebas, tiene los tokens del sistema de diseño cargados y el ruteo con `HashRouter` listo para recibir pantallas.

## 2. Contexto

- `docs/ROADMAP.md` secciones 2.2 y 2.3; `CLAUDE.md` sección “Frontend”.
- `docs/ui/design-system.md` secciones 2 (tokens) y 4 (formatos).

## 3. Alcance

**Archivos que crea o modifica:**

- `frontend/package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.eslintrc.cjs` o `eslint.config.js`, `.prettierrc`.
- `frontend/tailwind.config.ts`, `postcss.config.js`, `src/index.css` — todos los tokens de la sección 2 del design system.
- `frontend/src/main.tsx` — monta la app.
- `frontend/src/app/App.tsx` — proveedores (`QueryClientProvider`, `HashRouter`).
- `frontend/src/app/rutas.tsx` — tabla de rutas de la sección 4.1 con páginas provisionales.
- `frontend/src/app/PaginaNoEncontrada.tsx`.
- `frontend/src/lib/formato.ts` y `formato.test.ts` — las funciones de la sección 4 del design system.
- `frontend/src/lib/entorno.ts` — lectura tipada de variables `VITE_*`.
- `frontend/.env.example`, `frontend/README.md`.
- `.github/workflows/ci.yml` — job `frontend` (si el archivo ya existe, solo se agrega el job).

**Fuera de alcance:**

- Componentes de `ui/` (A-03), capa `api/` (A-02), pantallas reales (A-04 en adelante), deploy a Pages (A-09).

## 4. Diseño

### 4.1 Interfaz

**Rutas** (todas bajo `HashRouter`, es decir `…/#/acceso`):

| Ruta | Pantalla | Rol |
|---|---|---|
| `/login` | P1 Login | público |
| `/` | P2 Dashboard | todos |
| `/acceso` | P3 Registro de acceso | todos |
| `/clientes` | P4 Lista de clientes | todos |
| `/clientes/nuevo` | P5 Nuevo cliente | todos |
| `/clientes/:id` | P4 Ficha del cliente | todos |
| `/membresias` | P6 Membresías | todos |
| `/pagos` | Lista de pagos | todos |
| `/pagos/nuevo` | P7 Registrar pago (acepta `?membresia=<id>`) | todos |
| `/historial` | P8 Historial de accesos | admin |
| `/configuracion` | P9 Configuración | admin |
| `*` | Página no encontrada | — |

En esta spec cada ruta muestra una página provisional con el nombre de la pantalla. Las guardas de sesión y rol llegan en A-04.

**Variables de entorno**

| Variable | Valores | Por defecto |
|---|---|---|
| `VITE_API_MODE` | `mock` · `live` | `mock` |
| `VITE_API_URL` | URL base del backend, sin barra final | vacío (solo se exige en `live`) |
| `VITE_BASE` | Ruta base para Vite | `/PROYECTO-PARQUEADERO/` en el build, `/` en desarrollo |

**Scripts de `package.json`:** `dev`, `build`, `preview`, `lint`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `gen:api` (lo implementa A-02; aquí puede quedar declarado).

### 4.2 Datos

Ninguno.

### 4.3 Reglas de negocio

1. Los tokens de color, tipografía, radios y sombras se declaran con los **mismos nombres** del design system (`asfalto-900`, `senal-400`, `exito-suave`, `text-titulo`, `rounded-tarjeta`, `shadow-tarjeta`…).
2. Las fuentes Inter y JetBrains Mono se sirven desde el propio build (`@fontsource-variable/*`). El HTML final no hace peticiones a dominios de terceros.
3. `index.html` declara `lang="es"`, `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` y `<title>Parqueadero</title>`.
4. TypeScript en modo `strict` con `noUncheckedIndexedAccess`.
5. Alias de importación `@/` → `src/`.

### 4.4 Seguridad

- Ninguna variable `VITE_*` contiene secretos: todo lo que empieza por `VITE_` termina en el paquete público.

## 5. Criterios de aceptación

- [ ] **CA-1** Dado el repositorio recién clonado, cuando se ejecuta `npm ci && npm run build` en `frontend/`, entonces termina sin errores y genera `dist/`.
- [ ] **CA-2** `npm run lint`, `npm run typecheck` y `npm test` terminan sin errores, también en CI.
- [ ] **CA-3** Dada la app en marcha, cuando se navega a cada ruta de la tabla, entonces se muestra su página provisional; una ruta desconocida muestra “Página no encontrada” con un enlace al inicio.
- [ ] **CA-4** Dado el build con `VITE_BASE=/PROYECTO-PARQUEADERO/`, cuando se inspecciona `dist/index.html`, entonces las rutas de los recursos empiezan por esa base.
- [ ] **CA-5** `formatoDinero(60000)` devuelve `$60.000` (se acepta espacio fino o normal tras el símbolo según el motor, normalizado en la prueba).
- [ ] **CA-6** `formatoFechaHora("2026-11-11T03:30:00Z")` muestra el día 10 de noviembre a las 10:30 p. m. (America/Bogota), sin importar la zona horaria de la máquina.
- [ ] **CA-7** `formatoDiasRestantes` devuelve `vence en 2 días`, `vence mañana` para 1, `vence hoy` para 0, `venció ayer` para −1 y `venció hace 5 días` para −5.
- [ ] **CA-8** `formatoDuracion(135)` devuelve `2 h 15 min`; `formatoDuracion(45)` devuelve `45 min`; `formatoDuracion(1620)` devuelve `1 d 3 h`.
- [ ] **CA-9** `normalizarPlaca("abc-12 d")` devuelve `ABC12D`.
- [ ] **CA-10** Dado un elemento con clases `bg-senal-400 text-asfalto-900 rounded-tarjeta`, cuando se compila, entonces el CSS generado contiene `#FFD21F` y `#151A23`.

## 6. Pruebas requeridas

- Unitarias: `formato.ts` completo; `entorno.ts`.
- UI: ruteo (CA-3) con Testing Library y `MemoryRouter`.

## 7. Notas para el constructor

- Versiones: React 18, Vite 5 o superior, Tailwind 3.4, React Router 6, TanStack Query 5.
- Fija `process.env.TZ = "UTC"` en la configuración de Vitest para demostrar que los formatos no dependen de la zona de la máquina.

## 8. Preguntas abiertas

- …
