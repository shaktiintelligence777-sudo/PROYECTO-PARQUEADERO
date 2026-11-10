# A-06 · Pantallas de clientes y motos (P4, P5)

| Campo | Valor |
|---|---|
| Estado | lista |
| Línea | A (demo) |
| Asignado a | Sonnet |
| Revisa | Opus |
| Depende de | A-04 |
| Rama | `feat/A-06-clientes-motos` |

## 1. Objetivo

Buscar clientes, ver su ficha completa, darlos de alta junto con sus motos y editarlos.

## 2. Contexto

- `docs/ui/pantallas.md`: P4 (lista y ficha) y P5; sección 0.
- Contrato: `listarClientes`, `crearCliente`, `obtenerCliente`, `editarCliente`, `crearMoto`, `editarMoto`, `listarPagos`, `listarHistorialAccesos`.
- `docs/dominio.md`: RN-01, RN-04 a RN-06, RN-10 a RN-14, CB-8.

## 3. Alcance

**Archivos que crea o modifica:**

- `frontend/src/features/clientes/PaginaClientes.tsx`, `PaginaCliente.tsx`, `PaginaNuevoCliente.tsx`, `FormularioCliente.tsx`, `HojaMoto.tsx`, `esquemas.ts` (zod).
- Pruebas junto a cada archivo.

**Puede tocar:**

- `frontend/src/app/rutas.tsx`.

**Fuera de alcance:**

- La tarjeta de membresía de la ficha y sus hojas (crear, cambiar plan, cancelar) son de A-07. Esta spec deja un hueco con nombre `<SeccionMembresia clienteId />` que A-07 implementa; aquí basta un componente provisional.

## 4. Diseño

### 4.1 Interfaz

Estructura y textos: P4 y P5. Filtros y página de la lista en la URL (`?q=&estado=&pagina=&inactivos=1`).

### 4.2 Datos

Sin estado persistente propio.

### 4.3 Reglas de negocio

1. La búsqueda espera 300 ms y vuelve a la página 1 al cambiar cualquier filtro.
2. Las validaciones de `esquemas.ts` replican los límites del contrato para `ClienteCrear`, `ClienteEditar`, `MotoCrear` y `MotoEditar`.
3. `documento_duplicado` y `placa_duplicada` se muestran bajo el campo correspondiente (para la placa, en la fila indicada por `detalles` o, si no viene, en la primera).
4. El alta admite de 0 a 5 motos. `?placa=` rellena la primera.
5. Tras crear: toast “Cliente registrado.” y navegación a la ficha con `?crear_membresia=1`.
6. Las acciones solo para admin (desactivar o reactivar cliente o moto, ver inactivos, pestaña “Accesos”) no se renderizan para el operador.
7. `cliente_con_moto_dentro` y `moto_dentro` se muestran como toast con el mensaje de la API.

### 4.4 Seguridad

Los datos personales mostrados son los mínimos de la ficha. Nada se guarda en el navegador fuera del mock.

## 5. Criterios de aceptación

- [ ] **CA-1** Dada la lista, cuando se escribe “jose”, entonces tras 300 ms se muestran solo los clientes que coinciden (incluido “José”) y la URL contiene `q=jose`.
- [ ] **CA-2** Dado el filtro “Vencida”, entonces todos los elementos muestran la insignia “Vencida”; al recargar la página el filtro se conserva.
- [ ] **CA-3** Dada una búsqueda sin resultados, entonces se muestra “Ningún cliente coincide con la búsqueda.” y “Limpiar filtros” restablece la lista.
- [ ] **CA-4** Dado un cliente con tres motos, entonces en la lista se ven dos placas y “+1”.
- [ ] **CA-5** Dado el formulario de alta vacío, cuando se envía, entonces aparecen los mensajes de validación de P5 y no se llama a la API.
- [ ] **CA-6** Dado un alta válida con una moto, cuando se guarda, entonces aparece “Cliente registrado.” y se abre la ficha con el cliente y su moto.
- [ ] **CA-7** Dado un documento ya existente, entonces bajo Documento aparece “Ya existe un cliente con ese documento.” y los demás datos se conservan.
- [ ] **CA-8** Dada una placa ya existente, entonces bajo esa placa aparece “Esa placa ya está registrada.”
- [ ] **CA-9** Dado `/clientes/nuevo?placa=ZZZ99Z`, entonces la primera placa viene rellenada.
- [ ] **CA-10** Dada la ficha de un cliente sin email, entonces se muestra “Sin email: no recibirá avisos de vencimiento.”
- [ ] **CA-11** Dada la ficha, cuando se agrega una moto desde “+ Moto”, entonces aparece en la lista de motos sin recargar.
- [ ] **CA-12** Dada una moto que está dentro, entonces su fila muestra la insignia “Dentro”.
- [ ] **CA-13** Dado un operador, entonces no ve “Desactivar cliente”, ni “Mostrar inactivos”, ni la pestaña “Accesos”; un admin sí.
- [ ] **CA-14** Dado un admin que desactiva un cliente con una moto dentro, entonces ve el toast con el mensaje de `cliente_con_moto_dentro` y el cliente sigue activo.
- [ ] **CA-15** Dado un formulario con cambios, cuando se intenta salir, entonces aparece “¿Descartar los cambios?”.
- [ ] **CA-16** Dada la pestaña “Pagos” de la ficha, entonces lista los pagos del cliente y los anulados aparecen tachados con “Anulado”.
- [ ] **CA-17** Dado un error de carga de la lista, entonces se muestra “No pudimos cargar esta información.” y “Reintentar” repite la consulta.

## 6. Pruebas requeridas

- UI con Testing Library sobre `MockApi`. Unitarias de `esquemas.ts`.

## 7. Notas para el constructor

- En móvil usa `ListaElementos`; desde `md`, `Tabla`. Una sola fuente de datos para ambas.

## 8. Preguntas abiertas

- …
