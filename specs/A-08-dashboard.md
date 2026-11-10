# A-08 · Pantalla de dashboard (P2)

| Campo | Valor |
|---|---|
| Estado | lista |
| Línea | A (demo) |
| Asignado a | Sonnet |
| Revisa | Fable |
| Depende de | A-05, A-06, A-07 |
| Rama | `feat/A-08-dashboard` |

## 1. Objetivo

Dar de un vistazo el estado del parqueadero hoy y llevar con un toque a lo que requiere atención.

## 2. Contexto

- `docs/ui/pantallas.md`: P2 y sección 0.
- Contrato: `resumenDashboard` (`DashboardResumen`).

## 3. Alcance

**Archivos que crea o modifica:**

- `frontend/src/features/dashboard/PaginaDashboard.tsx`, `ProximosVencimientos.tsx`.
- Pruebas junto a cada archivo.

**Puede tocar:**

- `frontend/src/app/rutas.tsx`.

**Fuera de alcance:**

- Gráficas y reportes históricos (fase 2).

## 4. Diseño

### 4.1 Interfaz

Estructura, tabla de indicadores y textos: P2.

### 4.2 Datos

`resumenDashboard`, con `refetchInterval` de 60 segundos y refresco al recuperar el foco de la ventana.

### 4.3 Reglas de negocio

1. El saludo usa el primer nombre del usuario y la fecha de hoy en America/Bogota (“Hola, Ana · lun 10 nov”).
2. “Dentro ahora” muestra `12 / 40` si hay capacidad y `12` si es nula.
3. Los tonos `aviso` y `peligro` de “Por vencer” y “Vencidas” solo se aplican si el valor es mayor que 0.
4. El aviso de estancias largas solo aparece si `estancias_largas > 0`, con singular o plural según el número.
5. Cada indicador y cada elemento de la lista es un enlace al destino de la tabla de P2.

### 4.4 Seguridad

Disponible para ambos roles.

## 5. Criterios de aceptación

- [ ] **CA-1** Dado el resumen cargando, entonces se muestran esqueletos con la forma de los cuatro indicadores y de la lista.
- [ ] **CA-2** Dado un resumen con `motos_dentro: 12` y `capacidad: 40`, entonces se lee “12 / 40”; con capacidad nula, “12”.
- [ ] **CA-3** Dado `membresias.vencidas: 2`, entonces el indicador “Vencidas” usa el tono `peligro` y enlaza a `/membresias?estado=vencida`; con 0, sin tono.
- [ ] **CA-4** Dado `pagos_hoy: { cantidad: 3, total: 180000 }`, entonces se lee “$180.000” y “3 pagos”; con cantidad 1, “1 pago”.
- [ ] **CA-5** Dado `estancias_largas: 1`, entonces aparece “1 moto lleva más de 24 h dentro.”; con 3, “3 motos llevan más de 24 h dentro.”; con 0, no aparece.
- [ ] **CA-6** Dada la lista de próximos vencimientos, entonces cada elemento muestra nombre, insignia, placa y “vence mañana” o equivalente, y lleva a la ficha del cliente.
- [ ] **CA-7** Dada una lista vacía, entonces se muestra “Ninguna membresía vence en los próximos días.”
- [ ] **CA-8** Dado un error de carga, entonces se muestra “No pudimos cargar esta información.” con “Reintentar”.
- [ ] **CA-9** Dado que se registra una entrada en otra pantalla, cuando se vuelve al dashboard, entonces “Dentro ahora” refleja el cambio.
- [ ] **CA-10** Dado un ancho de 360 px, entonces los indicadores se muestran en una cuadrícula de 2 × 2 sin desplazamiento horizontal.

## 6. Pruebas requeridas

- UI con Testing Library sobre `MockApi` con reloj fijo.

## 7. Notas para el constructor

- No calcules indicadores en el cliente: todos vienen del resumen.

## 8. Preguntas abiertas

- …
