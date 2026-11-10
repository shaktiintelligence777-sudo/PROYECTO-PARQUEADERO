# A-03 · Componentes base del sistema de diseño

| Campo | Valor |
|---|---|
| Estado | en revisión |
| Línea | A (demo) |
| Asignado a | Sonnet |
| Revisa | Fable |
| Depende de | F-03, A-01 |
| Rama | `feat/A-03-componentes-ui` |

## 1. Objetivo

Construir la biblioteca `ui/` con la que se arman todas las pantallas, para que estas no definan estilos propios y la app se vea uniforme.

## 2. Contexto

- `docs/ui/design-system.md` sección 3 (componentes), sección 2 (tokens) y sección 5 (accesibilidad). Esa sección 3 es la especificación de props y comportamiento; esta spec no la repite.

## 3. Alcance

**Archivos que crea o modifica:**

- `frontend/src/ui/<Componente>.tsx` y `<Componente>.test.tsx` para: `Boton`, `BotonIcono`, `Campo`, `Entrada`, `AreaTexto`, `Selector`, `EntradaPlaca`, `EntradaDinero`, `Buscador`, `GrupoOpciones`, `Placa`, `InsigniaEstado`, `Insignia`, `Tarjeta`, `Indicador`, `ListaElementos`, `Tabla`, `Paginador`, `DatoEtiquetado`, `Aviso`, `Toast` (con `ProveedorToasts` y `useToast`), `Spinner`, `Esqueleto`, `EstadoVacio`, `EstadoError`, `Hoja`, `DialogoConfirmar`, `Armazon`, `CabeceraPagina`, `BannerDemo`.
- `frontend/src/ui/index.ts` — exporta todo.
- `frontend/src/app/Galeria.tsx` — página `/#/galeria` que muestra cada componente en todas sus variantes y estados. Solo se registra cuando `import.meta.env.DEV` es verdadero.

**Puede tocar:**

- `frontend/src/app/rutas.tsx` — registrar la galería.
- `frontend/src/app/App.tsx` — montar `ProveedorToasts`.
- `frontend/package.json` — `lucide-react`, `@testing-library/user-event`, `vitest-axe`.

**Fuera de alcance:**

- Pantallas, llamadas a la API y lógica de sesión. `Armazon` recibe por props el usuario, el rol y la acción de cerrar sesión; no los obtiene por su cuenta.

## 4. Diseño

### 4.1 Interfaz

Las props de cada componente son las de `docs/ui/design-system.md` sección 3. Precisiones:

- Todos aceptan `className` y reenvían `ref` y atributos nativos al elemento principal.
- Los controles de formulario son compatibles con `react-hook-form` (`register` y `Controller`).
- `EntradaPlaca` y `EntradaDinero` son controlados: `value` y `onChange(valor)`, donde el valor ya está normalizado (cadena en mayúsculas y entero, respectivamente).
- `Armazon` props: `usuario: { nombre: string; rol: "admin" | "operador" }`, `alCerrarSesion: () => void`, `children`. Los destinos y sus iconos son los de la sección 2.5 del design system y las rutas son las de A-01.
- `BannerDemo` props: `alReiniciar: () => void`.

### 4.2 Datos

Ninguno.

### 4.3 Reglas de negocio

1. Ningún componente contiene colores, tamaños de fuente, radios o sombras fuera de los tokens.
2. `InsigniaEstado` es el **único** lugar donde se decide el color y la etiqueta de un estado de membresía.
3. `Placa` es el único componente que pinta una placa.
4. Todo componente interactivo mide al menos 44 × 44 px y muestra el foco definido en el design system.
5. `Hoja` y `DialogoConfirmar` atrapan el foco, se cierran con Escape y con clic en el fondo, bloquean el desplazamiento de la página y devuelven el foco al elemento que las abrió.
6. `Boton` con `cargando` no dispara `onClick`.
7. `Armazon` oculta Historial y Configuración cuando el rol es `operador`.

### 4.4 Seguridad

- Ningún componente usa `dangerouslySetInnerHTML`.

## 5. Criterios de aceptación

- [ ] **CA-1** Dado cada componente de la lista, cuando se importa desde `@/ui`, entonces existe y la galería lo muestra en todas sus variantes.
- [ ] **CA-2** Dado `Boton` con `cargando`, cuando se hace clic, entonces `onClick` no se llama y el botón expone `aria-busy="true"`.
- [ ] **CA-3** Dado `Campo` con `error`, cuando se renderiza, entonces el control tiene `aria-invalid="true"` y `aria-describedby` apunta al mensaje de error.
- [ ] **CA-4** Dado `EntradaPlaca`, cuando el usuario escribe `abc-12 d`, entonces `onChange` recibe `ABC12D` y no admite más de 7 caracteres.
- [ ] **CA-5** Dado `EntradaDinero`, cuando el usuario escribe `60000`, entonces el campo muestra `$ 60.000` y `onChange` recibe el número `60000`; las letras se ignoran.
- [ ] **CA-6** Dado `InsigniaEstado` con cada valor (`activa`, `por_vencer`, `vencida`, `cancelada`, `null`), cuando se renderiza, entonces muestra la etiqueta de la tabla del design system y un icono; con `diasRestantes={0}` agrega “vence hoy”.
- [ ] **CA-7** Dado `Placa` con `ABC12D`, cuando se renderiza, entonces el texto es accesible como “Placa ABC12D”.
- [ ] **CA-8** Dada una `Hoja` abierta, cuando se pulsa Escape, entonces se cierra y el foco vuelve al botón que la abrió; con Tab el foco no sale de la hoja.
- [ ] **CA-9** Dado `DialogoConfirmar` con `pedirMotivo`, cuando el motivo tiene menos de 5 caracteres, entonces el botón de confirmar está deshabilitado; al confirmar, `alConfirmar` recibe el motivo.
- [ ] **CA-10** Dado `Armazon` con rol `operador`, cuando se renderiza, entonces no hay enlaces a Historial ni a Configuración; con rol `admin`, sí.
- [ ] **CA-11** Dado `useToast().mostrar({ tono: "peligro", … })`, cuando se llama, entonces aparece un elemento con `role="alert"` que desaparece a los 6 segundos.
- [ ] **CA-12** Dado `Buscador`, cuando el usuario escribe tres letras seguidas, entonces `alBuscar` se llama una sola vez, 300 ms después de la última.
- [ ] **CA-13** Dado `Paginador` en la página 1 de 7, cuando se renderiza, entonces “Anterior” está deshabilitado y muestra “Página 1 de 7”.
- [ ] **CA-14** Dada la galería completa, cuando se analiza con `axe`, entonces no hay violaciones.
- [ ] **CA-15** Dado el código de `src/ui/`, cuando se busca con una expresión regular, entonces no aparece ningún color hexadecimal ni `rgb(` (una prueba lo comprueba).

## 6. Pruebas requeridas

- UI: una prueba por componente con Testing Library y `user-event`; temporizadores simulados para `Toast` y `Buscador`.
- Accesibilidad: `vitest-axe` sobre la galería.

## 7. Notas para el constructor

- Sin bibliotecas de componentes externas (nada de MUI, Chakra, shadcn…). Solo Tailwind y `lucide-react`. Para el foco atrapado de `Hoja` basta una implementación propia pequeña o el elemento nativo `<dialog>`.
- Usa `clsx` para componer clases si hace falta.
- El texto de `BannerDemo` está en `docs/ui/pantallas.md`; si ese archivo aún no existe al empezar, usa “Modo demo: los datos son ficticios y se guardan solo en este navegador.” y el botón “Reiniciar datos”.

## 8. Preguntas abiertas

- …
