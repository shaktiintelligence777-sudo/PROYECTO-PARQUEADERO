# C-02 · Pruebas de extremo a extremo

| Campo | Valor |
|---|---|
| Estado | lista |
| Línea | C (convergencia) |
| Asignado a | Sonnet |
| Revisa | Opus |
| Depende de | C-01, B-09 |
| Rama | `feat/C-02-pruebas-e2e` |

## 1. Objetivo

Comprobar automáticamente, con un navegador real, que los recorridos principales funcionan con el frontend y el backend juntos.

## 2. Contexto

- `docs/ui/pantallas.md` sección 10 (flujos principales).
- `docs/dominio.md` sección 6 (semilla).

## 3. Alcance

**Archivos que crea o modifica:**

- `e2e/package.json`, `e2e/playwright.config.ts`, `e2e/tests/*.spec.ts`, `e2e/fixtures.ts`.
- `docker-compose.e2e.yml` — base de datos, backend con la semilla y frontend en modo `live`.
- `.github/workflows/e2e.yml` — en cada PR a `main` y a mano.

**Fuera de alcance:**

- Pruebas de carga. Pruebas contra producción.

## 4. Diseño

### 4.1 Interfaz

Proyectos de Playwright: `movil` (Pixel 7) y `escritorio` (Chromium 1280 × 800).

### 4.2 Datos

Cada ejecución parte de una base recién migrada y sembrada. Las pruebas crean sus propios datos con placas y documentos únicos por ejecución, para no depender del orden.

### 4.3 Reglas de negocio

1. Las pruebas localizan elementos por rol y texto visible, no por clases ni identificadores internos.
2. Ninguna prueba usa esperas fijas (`waitForTimeout`).
3. Ante un fallo en CI se conservan la traza y la captura como artefactos.
4. La suite completa tarda menos de 5 minutos.

### 4.4 Seguridad

Solo credenciales de la semilla. El workflow no usa secretos de producción.

## 5. Criterios de aceptación

- [ ] **CA-1** Login correcto de admin llega al dashboard; el de operador, a Acceso; credenciales incorrectas muestran “Email o contraseña incorrectos.”
- [ ] **CA-2** Un operador registra la entrada y luego la salida de una moto de la semilla, y el contador “Dentro” cambia en consecuencia.
- [ ] **CA-3** Una placa desconocida lleva a “Registrar cliente nuevo” con la placa rellenada; tras guardar, crear la membresía y volver a Acceso, la entrada se registra sin advertencias.
- [ ] **CA-4** La entrada de un cliente con membresía vencida muestra el aviso y se puede registrar igualmente.
- [ ] **CA-5** Renovar una membresía por vencer muestra el nuevo vencimiento en el resumen y, tras registrar, en la ficha del cliente.
- [ ] **CA-6** Un admin anula el último pago y el vencimiento vuelve al valor anterior.
- [ ] **CA-7** Un operador que abre `/#/configuracion` ve “No tienes permiso para ver esta página.”
- [ ] **CA-8** Un admin exporta el historial de hoy y el archivo descargado contiene la placa usada en CA-2.
- [ ] **CA-9** Tras recargar la página con sesión iniciada, el usuario sigue dentro.
- [ ] **CA-10** El dashboard refleja un pago recién registrado en “Pagos de hoy”.
- [ ] **CA-11** Todos los recorridos anteriores pasan en los proyectos `movil` y `escritorio`.
- [ ] **CA-12** Las pantallas P1 a P7 no tienen violaciones de accesibilidad graves o críticas (`@axe-core/playwright`).

## 6. Pruebas requeridas

Las de los criterios; cada archivo de prueba cita su criterio en el título.

## 7. Notas para el constructor

- Guardar el estado de sesión con `storageState` no sirve aquí, porque el refresh vive en `sessionStorage` y rota. Inicia sesión por la interfaz en una fixture.

## 8. Preguntas abiertas

- …
