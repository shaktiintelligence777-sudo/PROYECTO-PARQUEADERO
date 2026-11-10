# B-08 · Dashboard y exportación del historial

| Campo | Valor |
|---|---|
| Estado | lista |
| Línea | B (fullstack) |
| Asignado a | Sonnet |
| Revisa | Opus |
| Depende de | B-04, B-06 |
| Rama | `feat/B-08-dashboard-reportes` |

## 1. Objetivo

Calcular en el servidor los indicadores del día y permitir al administrador descargar el historial de accesos en CSV.

## 2. Contexto

- `docs/dominio.md`: RN-32, RN-47, RN-57, CB-5, CB-12.
- Contrato: `resumenDashboard` (`DashboardResumen`) y `exportarHistorialAccesos`.

## 3. Alcance

**Archivos que crea o modifica:**

- `backend/app/modules/dashboard/schemas.py`, `service.py`, `router.py`.
- `backend/app/modules/accesos/exportacion.py` y la ruta de exportación en `accesos/router.py`.
- `backend/tests/dashboard/`, `backend/tests/accesos/test_exportacion.py`.

**Puede tocar:**

- `backend/app/main.py`, `backend/app/modules/accesos/service.py` (para reutilizar los filtros del historial).

**Fuera de alcance:**

- Reportes financieros (fase 2).

## 4. Diseño

### 4.1 Interfaz

Las dos operaciones del contrato.

### 4.2 Datos

Solo lecturas.

### 4.3 Reglas de negocio

1. “Hoy” es el día de America/Bogota: `entradas_hoy` cuenta estancias con `entrada_en` hoy; `salidas_hoy`, con `salida_en` hoy.
2. `motos_dentro` = estancias abiertas; `estancias_largas` = abiertas con más de 24 horas.
3. `membresias` cuenta por estado calculado, sin canceladas y solo de clientes activos.
4. `pagos_hoy` excluye anulados.
5. `proximos_vencimientos`: hasta 5 membresías `por_vencer` o `vencida` de clientes activos, por `fecha_vencimiento` ascendente.
6. Exportación: mismos filtros que el historial; `desde` y `hasta` obligatorios; rango mayor de 366 días o `desde > hasta` → 422. Columnas, formato de fecha, BOM y separador según el contrato. `duracion_minutos` vacío si la moto sigue dentro.
7. Las celdas que empiezan por `=`, `+`, `-` o `@` se prefijan con `'` para evitar inyección de fórmulas en hojas de cálculo.
8. La exportación se genera en flujo (`StreamingResponse`), sin cargar todo en memoria, y se audita (`accesos.exportar` con filtros y número de filas).

### 4.4 Seguridad

Dashboard: ambos roles. Exportación: solo `admin`.

## 5. Criterios de aceptación

- [ ] **CA-1** Dada la semilla con reloj fijo, cuando se pide el resumen, entonces cada campo coincide con los conteos esperados de la semilla.
- [ ] **CA-2** Dado un pago de hoy anulado, entonces no suma en `pagos_hoy`.
- [ ] **CA-3** Dada una entrada a las 23:59 de ayer y su salida a las 00:10 de hoy (Bogotá), entonces cuenta en `salidas_hoy` y no en `entradas_hoy`.
- [ ] **CA-4** Dada una moto dentro desde hace 25 horas, entonces `estancias_largas` es 1.
- [ ] **CA-5** Dadas 8 membresías por vencer o vencidas, entonces `proximos_vencimientos` trae 5, ordenadas por vencimiento ascendente, sin canceladas.
- [ ] **CA-6** Dada una capacidad nula en la configuración, entonces `capacidad` es `null`.
- [ ] **CA-7** Dado un admin y un rango válido, cuando exporta, entonces recibe `text/csv` con `Content-Disposition` de adjunto, BOM, la cabecera exacta del contrato y una fila por estancia.
- [ ] **CA-8** Dada una estancia abierta, entonces sus columnas `salida`, `duracion_minutos` y `operador_salida` van vacías.
- [ ] **CA-9** Dado un cliente llamado `=SUMA(A1)`, entonces su celda empieza por `'`.
- [ ] **CA-10** Dado un rango de 400 días, sin fechas o con `desde > hasta`, entonces responde 422.
- [ ] **CA-11** Dado un operador, cuando exporta, entonces responde 403; el dashboard le responde 200.
- [ ] **CA-12** Dada una exportación, entonces `auditoria` la registra con el número de filas.

## 6. Pruebas requeridas

- Integración / API con `reloj_fijo`. El CSV se analiza con el módulo `csv` para comprobar columnas y escapado.

## 7. Notas para el constructor

- Calcula el resumen con consultas agregadas (pocas y con `COUNT`/`SUM`), no cargando entidades.

## 8. Preguntas abiertas

- …
