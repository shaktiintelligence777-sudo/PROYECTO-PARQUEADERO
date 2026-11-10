# C-03 · Auditoría de seguridad final

| Campo | Valor |
|---|---|
| Estado | lista |
| Línea | C (convergencia) |
| Asignado a | Opus |
| Revisa | Fable |
| Depende de | C-01 |
| Rama | `feat/C-03-auditoria-seguridad` |

## 1. Objetivo

Verificar de forma independiente, antes de salir a producción, que el sistema cumple las medidas de seguridad prometidas, y corregir lo que no las cumpla.

## 2. Contexto

- `docs/ROADMAP.md` sección 2.6 (tabla de riesgos y medidas).
- `docs/dominio.md`: RN-70 a RN-76 y matriz de permisos.
- `contracts/openapi.yaml`: `x-roles` de cada operación.

## 3. Alcance

**Archivos que crea o modifica:**

- `docs/seguridad/auditoria-v1.md` — informe: alcance, método, hallazgos (gravedad, evidencia, corrección) y riesgos aceptados.
- `backend/tests/seguridad/test_matriz_permisos.py` — prueba generada a partir del contrato.
- `backend/tests/seguridad/test_cabeceras.py`.
- `.github/workflows/seguridad.yml` — análisis de dependencias y de secretos.

**Puede tocar:**

- Cualquier archivo de `backend/` o `frontend/` **solo** para corregir un hallazgo, con un commit por hallazgo que cite su identificador.

**Fuera de alcance:**

- Pruebas de intrusión sobre la infraestructura de Render, Neon o GitHub.

## 4. Diseño

### 4.1 Interfaz

Lista de comprobación mínima (cada punto termina como “cumple”, “corregido” o “riesgo aceptado” en el informe):

1. **Autenticación:** parámetros de Argon2id; mensajes de login indistinguibles; límite de intentos efectivo; JWT con algoritmo fijo y vencimiento; rotación y detección de reutilización de refresh tokens.
2. **Autorización:** cada operación del contrato rechaza sin token (401) y con rol insuficiente (403); no hay rutas fuera del contrato.
3. **Entrada de datos:** todos los esquemas rechazan campos desconocidos; límites de longitud aplicados; no hay SQL construido con cadenas.
4. **Salida de datos:** ninguna respuesta ni log contiene `password_hash`, tokens o contraseñas; los errores 500 no filtran trazas.
5. **Transporte y navegador:** HTTPS; CORS limitado al origen de Pages; cabeceras `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` y `Cache-Control: no-store` en respuestas autenticadas.
6. **Frontend:** sin tokens en `localStorage` ni en la URL; sin `dangerouslySetInnerHTML`; el build `live` no incluye datos del demo; sin recursos de terceros.
7. **Secretos y dependencias:** historial de git sin secretos; dependencias sin vulnerabilidades altas o críticas conocidas (`pip-audit`, `npm audit`).
8. **Datos:** copias de seguridad activas y restauración probada; el usuario de base de datos no es superusuario; auditoría presente en toda escritura.
9. **Endpoint interno:** solo acepta el token de servicio; comparación en tiempo constante.
10. **CSV:** protección contra inyección de fórmulas.

### 4.2 Datos

Ninguno.

### 4.3 Reglas de negocio

1. Todo hallazgo de gravedad alta o crítica se corrige dentro de esta spec. Los de gravedad media o baja se corrigen o se registran como issue con responsable.
2. Un “riesgo aceptado” exige justificación escrita y la aprobación del dueño del proyecto.
3. La prueba de la matriz de permisos se genera recorriendo `contracts/openapi.yaml`, de modo que una operación nueva sin protección haga fallar CI.

### 4.4 Seguridad

El informe no incluye secretos ni datos reales de clientes.

## 5. Criterios de aceptación

- [ ] **CA-1** Dada cada operación del contrato con `bearerAuth`, cuando se llama sin token, entonces responde 401 (prueba generada desde el YAML).
- [ ] **CA-2** Dada cada operación con `x-roles: [admin]`, cuando la llama un operador, entonces responde 403.
- [ ] **CA-3** Dada la aplicación FastAPI, cuando se comparan sus rutas con el contrato, entonces no hay rutas de más ni de menos.
- [ ] **CA-4** Dada cualquier respuesta autenticada, entonces incluye las tres cabeceras del punto 5.
- [ ] **CA-5** Dado el código de `backend/app`, cuando se busca SQL construido con formato de cadenas, entonces no hay coincidencias (regla de lint activa en CI).
- [ ] **CA-6** Dado el workflow de seguridad, entonces `pip-audit` y `npm audit --audit-level=high` pasan y el escaneo de secretos no encuentra nada.
- [ ] **CA-7** Dado el informe, entonces cada punto de la lista tiene resultado y evidencia, y no queda ningún hallazgo alto o crítico abierto.

## 6. Pruebas requeridas

- Las de CA-1 a CA-5, automatizadas y permanentes en CI.

## 7. Notas para el constructor

- Revisa con ojos nuevos: no des por bueno algo porque su spec original tenía una prueba.

## 8. Preguntas abiertas

- …
