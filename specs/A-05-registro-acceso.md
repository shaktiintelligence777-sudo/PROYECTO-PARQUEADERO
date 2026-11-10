# A-05 · Pantalla de registro de acceso (P3)

| Campo | Valor |
|---|---|
| Estado | lista |
| Línea | A (demo) |
| Asignado a | Sonnet |
| Revisa | Fable |
| Depende de | A-04 |
| Rama | `feat/A-05-registro-acceso` |

## 1. Objetivo

Que el operador registre entradas y salidas por placa desde el celular en el menor número de toques posible, viendo el estado de la membresía antes de decidir.

## 2. Contexto

- `docs/ui/pantallas.md`: P3 completa y sección 0.
- Contrato: `consultarPlaca`, `registrarEntrada`, `registrarSalida`, `listarMotosDentro`.
- `docs/dominio.md`: RN-50 a RN-57, CB-1, CB-5, CB-9, CB-10.

## 3. Alcance

**Archivos que crea o modifica:**

- `frontend/src/features/accesos/PaginaAcceso.tsx`, `PanelRegistrar.tsx`, `ResultadoConsulta.tsx`, `PanelDentro.tsx`.
- Pruebas junto a cada archivo.

**Puede tocar:**

- `frontend/src/app/rutas.tsx`.

**Fuera de alcance:**

- Historial (B-08 y su pantalla). Lectura de placa con cámara (fase 2).

## 4. Diseño

### 4.1 Interfaz

Estructura, tabla de situaciones, textos y flujo: exactamente los de P3. La pestaña activa vive en la URL (`/acceso?vista=dentro`).

### 4.2 Datos

Sin estado persistente propio. La lista “Dentro” se refresca cada 30 segundos y tras cada registro.

### 4.3 Reglas de negocio

1. El foco está en la placa al abrir la pantalla y vuelve a ella tras cada registro correcto.
2. “Buscar” se habilita con 4 caracteres o más; Enter equivale a “Buscar”.
3. El botón principal depende solo de `estancia_abierta` de la consulta: `null` → entrada; con valor → salida.
4. Las advertencias nunca deshabilitan el botón de entrada (D-5).
5. Tras un registro correcto: toast, campo vacío, resultado borrado, foco en la placa.
6. Ante `moto_ya_dentro` o `moto_no_esta_dentro`: toast con el mensaje de la API y se repite la consulta.
7. Ante `moto_no_registrada`: estado vacío con el botón que lleva a `/clientes/nuevo?placa=<placa>`.
8. La salida desde la pestaña “Dentro” pide confirmación; la de la pestaña “Registrar”, no.

### 4.4 Seguridad

Disponible para ambos roles. Sin datos sensibles.

## 5. Criterios de aceptación

- [ ] **CA-1** Dada la pantalla recién abierta, entonces el campo de placa tiene el foco y “Buscar” está deshabilitado hasta escribir 4 caracteres.
- [ ] **CA-2** Dada una moto fuera con membresía activa, cuando se busca `abc-12d`, entonces se muestra la placa `ABC12D`, el cliente, la insignia “Activa” y el botón “Registrar entrada”, sin avisos.
- [ ] **CA-3** Dado ese resultado, cuando se pulsa “Registrar entrada”, entonces aparece el toast “Entrada registrada · ABC12D”, el campo queda vacío y con el foco, y el contador de “Dentro” aumenta en 1.
- [ ] **CA-4** Dada una moto con membresía vencida, entonces se muestra el aviso “Membresía vencida. Puedes registrar la entrada y cobrar la renovación.”, el enlace “Registrar pago” y el botón “Registrar entrada de todos modos”, que funciona.
- [ ] **CA-5** Dada una moto sin membresía, entonces se muestra “Este cliente no tiene membresía.” y el enlace “Crear membresía”.
- [ ] **CA-6** Dada una moto por vencer, entonces se muestra “La membresía vence pronto.” y el botón normal “Registrar entrada”.
- [ ] **CA-7** Dada una moto dentro, cuando se busca, entonces se muestra “Dentro desde las … (…)” y el botón “Registrar salida”; al pulsarlo aparece “Salida registrada · ABC12D · 2 h 15 min”.
- [ ] **CA-8** Dada una placa inexistente `ZZZ99Z`, entonces se muestra “No hay ninguna moto con la placa ZZZ99Z.” y el botón lleva a `/clientes/nuevo?placa=ZZZ99Z`.
- [ ] **CA-9** Dado que la entrada responde `moto_ya_dentro`, entonces se muestra el toast de error y el resultado pasa a ofrecer “Registrar salida”.
- [ ] **CA-10** Dada la pestaña “Dentro” con motos, entonces están ordenadas de la más antigua a la más reciente y las de más de 24 horas llevan “Más de 24 h”.
- [ ] **CA-11** Dada la pestaña “Dentro”, cuando se pulsa “Salida” y se confirma, entonces la moto desaparece de la lista; si se cancela, no cambia nada.
- [ ] **CA-12** Dado el filtro por placa sin coincidencias, entonces se muestra “Ninguna moto dentro coincide con esa placa.”; sin motos dentro, “No hay motos dentro en este momento.”
- [ ] **CA-13** Dado un ancho de 360 px, entonces no hay desplazamiento horizontal y el botón principal mide al menos 64 px de alto.
- [ ] **CA-14** Dado el botón de entrada pulsado dos veces seguidas, entonces solo se envía una petición.

## 6. Pruebas requeridas

- UI con Testing Library sobre `MockApi` con reloj fijo, cubriendo cada fila de la tabla de situaciones.

## 7. Notas para el constructor

- Todo el flujo debe poder hacerse solo con teclado: placa, Enter, Enter.

## 8. Preguntas abiertas

- …
