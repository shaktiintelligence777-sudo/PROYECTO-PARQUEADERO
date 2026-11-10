# B-10 · Usuarios y configuración (backend y P9)

| Campo | Valor |
|---|---|
| Estado | lista |
| Línea | B (fullstack) |
| Asignado a | Sonnet |
| Revisa | Opus |
| Depende de | B-03, B-07, A-04 |
| Rama | `feat/B-10-usuarios-configuracion` |

## 1. Objetivo

Que el administrador gestione los usuarios del sistema, los planes y los parámetros del parqueadero desde la pantalla de configuración.

## 2. Contexto

- `docs/dominio.md`: RN-07, RN-57, RN-60, RN-65, RN-71, RN-73, RN-74.
- `docs/ui/pantallas.md`: P9 completa.
- Contrato: `listarUsuarios`, `crearUsuario`, `editarUsuario`, `obtenerConfiguracion`, `editarConfiguracion`; ya existentes: operaciones de planes y `listarNotificaciones`.

## 3. Alcance

**Archivos que crea o modifica:**

- `backend/app/modules/usuarios/schemas.py`, `service.py`, `router.py`.
- `backend/app/modules/configuracion/schemas.py`, `service.py`, `router.py`.
- `backend/tests/usuarios/`, `backend/tests/configuracion/`.
- `frontend/src/features/configuracion/PaginaConfiguracion.tsx`, `SeccionGeneral.tsx`, `SeccionPlanes.tsx`, `SeccionUsuarios.tsx`, `SeccionAvisos.tsx`, `ListaNotificaciones.tsx`, `esquemas.ts`, con sus pruebas.

**Puede tocar:**

- `backend/app/main.py`, `frontend/src/app/rutas.tsx`.

**Fuera de alcance:**

- “Mi cuenta” y el cambio de contraseña propio (A-04).

## 4. Diseño

### 4.1 Interfaz

Backend: las cinco operaciones del contrato. Frontend: P9, con sus textos.

### 4.2 Datos

Tablas `usuarios`, `refresh_tokens`, `configuracion` (B-02).

### 4.3 Reglas de negocio

1. Email de usuario en minúsculas y único: 409 `email_duplicado`.
2. Al cambiar `password` o poner `activo: false`, se revocan todos los refresh tokens de ese usuario (RN-73).
3. No se puede desactivar ni pasar a `operador` al último admin activo: 409 `ultimo_admin`. Un usuario no puede desactivarse a sí mismo: 409 `auto_desactivacion` (RN-74). Ambas comprobaciones bloquean las filas implicadas para resistir peticiones simultáneas.
4. La configuración es una sola fila; `PATCH` es parcial. `plantillas` también es parcial por tipo.
5. Las plantillas se validan con `validar_plantilla` (B-07): una variable desconocida → 422 con el campo exacto (`plantillas.recordatorio.cuerpo`).
6. `dias_recordatorio` se guarda sin duplicados y ordenado de mayor a menor.
7. Auditoría de todo cambio; en usuarios nunca se guarda la contraseña ni su hash.
8. Frontend: la vista previa de plantillas sustituye las variables con los datos de ejemplo de P9; las casillas de recordatorio se corresponden con `dias_recordatorio` `[3, 1, 0]`.

### 4.4 Seguridad

Todo exige `admin`. Ninguna respuesta incluye `password_hash`.

## 5. Criterios de aceptación

- [ ] **CA-1** Dado un admin, cuando crea un usuario operador, entonces responde 201 sin campos de contraseña y ese usuario puede iniciar sesión.
- [ ] **CA-2** Dado un email existente con otras mayúsculas, entonces responde 409 `email_duplicado`.
- [ ] **CA-3** Dada una contraseña de 7 caracteres, entonces responde 422.
- [ ] **CA-4** Dado un usuario con sesión abierta, cuando un admin lo desactiva o le cambia la contraseña, entonces su refresh token deja de servir.
- [ ] **CA-5** Dado un único admin activo, cuando se intenta desactivarlo o pasarlo a operador, entonces responde 409 `ultimo_admin`.
- [ ] **CA-6** Dado un admin que se desactiva a sí mismo (habiendo otro admin), entonces responde 409 `auto_desactivacion`.
- [ ] **CA-7** Dado un operador, cuando llama a cualquier operación de usuarios o configuración, entonces responde 403.
- [ ] **CA-8** Dado `PATCH /configuracion` con `{"dias_por_vencer": 5}`, entonces solo cambia ese campo y `actualizado_en`.
- [ ] **CA-9** Dada una plantilla con `{apellido}`, entonces responde 422 con el campo de esa plantilla.
- [ ] **CA-10** Dado `dias_recordatorio: [0, 3, 3]`, entonces responde 422 (duplicados); con `[0, 3]` se guarda `[3, 0]`.
- [ ] **CA-11** Dado `capacidad: null`, entonces se guarda nulo; con `0`, responde 422.
- [ ] **CA-12** Dada la edición de un usuario, entonces `auditoria` no contiene contraseña ni hash.
- [ ] **CA-13** (UI) Dada la sección Usuarios, cuando el backend responde `ultimo_admin`, entonces se muestra “Debe quedar al menos un administrador activo.”
- [ ] **CA-14** (UI) Dada la sección Avisos, cuando se edita el mensaje, entonces la vista previa se actualiza en vivo con los datos de ejemplo.
- [ ] **CA-15** (UI) Dada la sección Planes, cuando se desactiva un plan, entonces aparece la confirmación de P9 y, tras confirmar, la insignia “Inactivo” y la acción “Reactivar”.
- [ ] **CA-16** (UI) Dada la sección General, cuando se guarda, entonces aparece “Configuración guardada.”
- [ ] **CA-17** (UI) Dado el modo demo, entonces la sección Avisos muestra “En el demo no se envían correos.”

## 6. Pruebas requeridas

- Integración / API para CA-1 a CA-12. UI con Testing Library sobre `MockApi` para CA-13 a CA-17.

## 7. Notas para el constructor

- Esta spec toca backend y frontend: entrégala en dos PRs (`B-10a` backend, `B-10b` pantalla) si resulta más cómodo de revisar.

## 8. Preguntas abiertas

- …
