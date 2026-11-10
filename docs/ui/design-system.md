# Sistema de diseño · Parqueadero de motos

> Entregable **F-03**. Define los tokens y los componentes base. Las pantallas (`docs/ui/pantallas.md`) solo combinan lo que aparece aquí.
> Estado: `v1.0` · Última actualización: 2026-11-10

---

## 1. Principios

1. **Una mano, a pleno sol.** El operador usa el celular de pie, en la entrada, a veces con guantes. Objetivos táctiles grandes, contraste alto, poco texto.
2. **La placa manda.** La placa es el dato más importante de la app y tiene su propio componente, que imita una placa colombiana (amarilla con letras negras). Se reconoce de un vistazo en cualquier pantalla.
3. **El color significa estado.** Verde, ámbar y rojo se reservan para el estado de la membresía y el resultado de una acción. La marca no compite con ellos.
4. **Una acción principal por pantalla.** Un solo botón primario visible a la vez.
5. **Nunca en blanco.** Toda vista define sus estados de carga, vacío y error.

---

## 2. Tokens

Los tokens se declaran una sola vez en `frontend/tailwind.config.ts` (`theme.extend`) y se usan por nombre. Ninguna pantalla escribe valores hexadecimales.

### 2.1 Color

**Neutros · `asfalto`** (fondos, texto, bordes)

| Token | Hex | Uso |
|---|---|---|
| `asfalto-50` | `#F6F7F9` | Fondo de la app |
| `asfalto-100` | `#ECEEF2` | Fondo de filas alternas, skeleton |
| `asfalto-200` | `#D9DDE4` | Bordes, divisores |
| `asfalto-300` | `#B8BFCA` | Borde de campos |
| `asfalto-500` | `#687385` | Texto secundario, iconos |
| `asfalto-700` | `#343C4A` | Texto de apoyo fuerte |
| `asfalto-900` | `#151A23` | Texto principal, barra de navegación |
| `blanco` | `#FFFFFF` | Superficies (tarjetas, campos) |

**Marca · `senal`** (el amarillo de la placa)

| Token | Hex | Uso |
|---|---|---|
| `senal-100` | `#FFF4C2` | Fondo de elementos seleccionados |
| `senal-400` | `#FFD21F` | Componente `Placa`, botón primario, ítem activo de navegación |
| `senal-500` | `#F2BD00` | Estado presionado del primario |

El texto sobre `senal-400` es siempre `asfalto-900` (contraste 12:1). Nunca texto blanco sobre amarillo.

**Semánticos**

| Token | Fondo suave | Sólido | Texto sobre suave | Significado |
|---|---|---|---|---|
| `exito` | `#E3F6EA` | `#15803D` | `#0F5C2C` | Membresía activa, entrada registrada, operación correcta |
| `aviso` | `#FFF1DC` | `#B4500B` | `#8A3D06` | Membresía por vencer, advertencias |
| `peligro` | `#FDE7E7` | `#C81E1E` | `#931313` | Membresía vencida, errores, acciones destructivas |
| `info` | `#E4EEFD` | `#1D5FD1` | `#144494` | Mensajes neutrales, modo demo, enlaces |
| `neutro` | `#ECEEF2` | `#687385` | `#343C4A` | Cancelada, inactivo, sin membresía |

Nombres en Tailwind: `exito-suave`, `exito`, `exito-texto`, y así para cada uno.

**Mapa de estado de membresía** (única fuente; lo usa `InsigniaEstado`):

| Estado | Token | Etiqueta |
|---|---|---|
| `activa` | `exito` | Activa |
| `por_vencer` | `aviso` | Por vencer |
| `vencida` | `peligro` | Vencida |
| `cancelada` | `neutro` | Cancelada |
| sin membresía (`null`) | `neutro` | Sin membresía |

El color nunca es el único indicador: cada insignia lleva su texto y un icono.

### 2.2 Tipografía

- **Texto:** `Inter`, con respaldo `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Se sirve localmente con `@fontsource-variable/inter`, sin llamadas a CDNs.
- **Placas y cifras:** `"JetBrains Mono"`, respaldo `ui-monospace, "SF Mono", Menlo, monospace` (`@fontsource-variable/jetbrains-mono`). Las cifras en tablas usan `tabular-nums`.

| Token | Tamaño / interlineado | Peso | Uso |
|---|---|---|---|
| `text-display` | 32 / 40 px | 700 | Cifra grande del dashboard, placa consultada |
| `text-titulo` | 22 / 28 px | 700 | Título de pantalla |
| `text-subtitulo` | 18 / 24 px | 600 | Título de tarjeta o sección |
| `text-cuerpo` | 16 / 24 px | 400 | Texto por defecto. **Mínimo en campos**, para evitar el zoom de iOS |
| `text-apoyo` | 14 / 20 px | 400 | Texto secundario, ayudas, celdas de tabla |
| `text-micro` | 12 / 16 px | 500 | Insignias, etiquetas en mayúscula |

### 2.3 Espaciado, radios, sombras

- **Espaciado:** la escala de 4 px de Tailwind (`1` = 4 px). Valores permitidos: `1, 2, 3, 4, 6, 8, 12`. Margen lateral de pantalla: `4` en móvil, `6` desde `md`. Separación entre tarjetas: `4`.
- **Radios:** `rounded-control` 10 px (botones, campos) · `rounded-tarjeta` 16 px (tarjetas, hojas) · `rounded-full` (insignias).
- **Sombras:** `shadow-tarjeta` = `0 1px 2px rgb(21 26 35 / 0.06), 0 1px 3px rgb(21 26 35 / 0.10)` · `shadow-flotante` = `0 8px 24px rgb(21 26 35 / 0.18)` (hojas, modales, toasts).
- **Objetivo táctil:** mínimo 44 × 44 px. Los botones de Entrada y Salida miden 64 px de alto.
- **Foco:** `outline: 3px solid #1D5FD1; outline-offset: 2px` en todo elemento interactivo (`focus-visible`).
- **Movimiento:** transiciones de 150 ms `ease-out`. Con `prefers-reduced-motion` se desactivan.

### 2.4 Puntos de quiebre

| Nombre | Desde | Disposición |
|---|---|---|
| base | 0 | Una columna, navegación inferior |
| `md` | 768 px | Navegación lateral, contenido con ancho máximo de 960 px |
| `lg` | 1024 px | Dashboard a tres columnas, tablas completas |

### 2.5 Iconos

`lucide-react`, trazo 2, tamaño 20 px (24 px en la navegación). Iconos fijos: Inicio `LayoutDashboard` · Acceso `ScanLine` · Clientes `Users` · Membresías `IdCard` · Pagos `Banknote` · Historial `History` · Configuración `Settings` · Entrada `LogIn` · Salida `LogOut`.

---

## 3. Componentes base (`frontend/src/ui/`)

Cada componente es un archivo `NombreComponente.tsx` exportado desde `ui/index.ts`. Las props listadas son el contrato; se pueden añadir `className` y atributos nativos.

### 3.1 Acciones

**`Boton`**

| Prop | Valores | Por defecto |
|---|---|---|
| `variante` | `primario` · `secundario` · `fantasma` · `peligro` · `exito` | `primario` |
| `tamano` | `md` (44 px) · `lg` (56 px) · `xl` (64 px, Entrada/Salida) | `md` |
| `cargando` | boolean: muestra `Spinner`, deshabilita y conserva el ancho | `false` |
| `icono` | nodo opcional a la izquierda | — |
| `anchoCompleto` | boolean | `false` |

- `primario`: fondo `senal-400`, texto `asfalto-900`. `secundario`: fondo blanco, borde `asfalto-300`. `fantasma`: sin fondo, texto `info`. `peligro`: fondo `peligro`, texto blanco. `exito`: fondo `exito`, texto blanco (botón **Entrada**).
- Deshabilitado: opacidad 50 %, sin eventos.

**`BotonIcono`**: botón cuadrado de 44 px con `aria-label` obligatorio.

### 3.2 Formularios

**`Campo`**: envoltorio con `etiqueta`, `ayuda` opcional y `error` opcional. Asocia `label`, `aria-describedby` y `aria-invalid`. El error se muestra debajo en `peligro-texto` con icono.

**`Entrada`** (`input`), **`AreaTexto`**, **`Selector`** (`select` nativo): 48 px de alto, `text-cuerpo`, borde `asfalto-300`, borde `peligro` si hay error.

**`EntradaPlaca`**: campo grande (64 px, `text-display`, monoespaciado, centrado) que convierte a mayúsculas y elimina espacios y guiones mientras se escribe. `inputMode="text"`, `autoCapitalize="characters"`, `autoComplete="off"`, máximo 7 caracteres.

**`EntradaDinero`**: muestra `$ 60.000` mientras se escribe y entrega un entero. `inputMode="numeric"`.

**`Buscador`**: `Entrada` con icono de lupa, botón para limpiar y espera de 300 ms antes de avisar el cambio.

**`GrupoOpciones`**: botones de selección única tipo segmento (métodos de pago, filtros de estado). Implementado como `radiogroup`.

### 3.3 Presentación de datos

**`Placa`**: muestra una placa. Fondo `senal-400`, texto `asfalto-900` monoespaciado en negrita, borde de 2 px `asfalto-900`, radio 6 px, espaciado entre letras `0.08em`. Tamaños `sm` (texto 14 px), `md` (18 px), `lg` (32 px).

**`InsigniaEstado`**: recibe `estado` (`EstadoMembresia | null`) y pinta la insignia según el mapa de 2.1. Prop opcional `diasRestantes` que agrega “· vence en 2 días”, “· vence hoy” o “· venció hace 5 días”.

**`Insignia`**: genérica, con `tono` (`exito`, `aviso`, `peligro`, `info`, `neutro`).

**`Tarjeta`**: superficie blanca, `rounded-tarjeta`, `shadow-tarjeta`, relleno `4`. Subcomponentes `Tarjeta.Titulo` y `Tarjeta.Pie`.

**`Indicador`**: tarjeta de cifra para el dashboard: `etiqueta`, `valor` (`text-display`), `detalle` opcional, `tono` opcional y `enlace` opcional (toda la tarjeta es clicable).

**`ListaElementos` / `Elemento`**: lista vertical para móvil. Cada elemento tiene `titulo`, `subtitulo`, `inicio` (p. ej. una `Placa`), `fin` (p. ej. una insignia) y es clicable completo. Alto mínimo 64 px.

**`Tabla`**: tabla para `md` en adelante, con cabecera fija y filas de 52 px. Por debajo de `md`, las pantallas usan `ListaElementos` en su lugar.

**`Paginador`**: “Anterior · Página 2 de 7 · Siguiente”.

**`DatoEtiquetado`**: par etiqueta / valor para fichas.

### 3.4 Retroalimentación

**`Aviso`**: bloque en línea con `tono`, `titulo`, texto y acción opcional. Para advertencias de membresía y errores de carga.

**`Toast`** + `useToast()`: mensaje flotante de 4 segundos, arriba en móvil y abajo a la derecha en escritorio. `role="status"`; los de error usan `role="alert"` y duran 6 segundos.

**`Spinner`**, **`Esqueleto`** (bloque gris animado con las dimensiones del contenido).

**`EstadoVacio`**: icono, título, texto y acción opcional.

**`EstadoError`**: mensaje y botón **Reintentar**.

### 3.5 Capas

**`Hoja`**: panel que sube desde abajo en móvil y se muestra como diálogo centrado (480 px) desde `md`. Para formularios cortos y confirmaciones. Atrapa el foco, se cierra con Escape y devuelve el foco al disparador.

**`DialogoConfirmar`**: `Hoja` con título, texto, botón de confirmación (variante configurable) y **Cancelar**. Si recibe `pedirMotivo`, muestra un `AreaTexto` obligatorio (mínimo 5 caracteres).

### 3.6 Estructura

**`Armazon`** (layout de la app autenticada):

- Móvil: cabecera de 56 px con el título de la pantalla y menú de usuario; **navegación inferior** fija de 64 px con 5 destinos: Inicio, Clientes, **Acceso** (botón central destacado en `senal-400`), Membresías y Más. “Más” abre una `Hoja` con Pagos, Historial, Configuración y Cerrar sesión.
- Desde `md`: barra lateral de 240 px en `asfalto-900` con todos los destinos y el usuario abajo.
- Los destinos solo para `admin` (Historial, Configuración) no se muestran al `operador`.
- Respeta `env(safe-area-inset-bottom)`.

**`CabeceraPagina`**: título, botón atrás opcional y espacio para la acción principal.

**`BannerDemo`**: franja `info-suave` fija arriba cuando `VITE_API_MODE=mock`. Texto en `docs/ui/pantallas.md`.

---

## 4. Formatos de presentación

Funciones puras en `frontend/src/lib/formato.ts`, las únicas permitidas para formatear:

| Función | Entrada → salida |
|---|---|
| `formatoDinero(60000)` | `$60.000` |
| `formatoFecha("2026-11-13")` | `13 nov 2026` |
| `formatoFechaHora("2026-11-10T21:05:00Z")` | `10 nov, 4:05 p. m.` (America/Bogota) |
| `formatoHora(...)` | `4:05 p. m.` |
| `formatoDuracion(135)` | `2 h 15 min` (más de 24 h: `1 d 3 h`) |
| `formatoDiasRestantes(2)` / `(1)` / `(0)` / `(-1)` / `(-5)` | `vence en 2 días` / `vence mañana` / `vence hoy` / `venció ayer` / `venció hace 5 días` |
| `normalizarPlaca("abc-12d")` | `ABC12D` |

Todas fijan `timeZone: "America/Bogota"` y la configuración regional `es-CO`.

---

## 5. Accesibilidad (mínimos obligatorios)

- Contraste de texto 4.5:1 como mínimo (los pares de la sección 2.1 lo cumplen).
- Todo control con nombre accesible; los iconos solos llevan `aria-label`.
- Orden de foco igual al orden visual; foco siempre visible.
- Los errores de formulario se anuncian (`aria-live="polite"`) y el foco va al primer campo con error.
- Idioma del documento `lang="es"`.
- Nada depende solo del color.
