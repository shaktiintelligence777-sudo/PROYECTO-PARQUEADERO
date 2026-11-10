# A-09 · Publicación en GitHub Pages y modo demo

| Campo | Valor |
|---|---|
| Estado | en revisión |
| Línea | A (demo) |
| Asignado a | Sonnet |
| Revisa | Opus |
| Depende de | A-01 |
| Rama | `feat/A-09-deploy-pages` |

## 1. Objetivo

Publicar el frontend automáticamente en GitHub Pages en cada cambio de `main`, en modo demo y dejando claro al visitante que los datos son ficticios.

## 2. Contexto

- `docs/ROADMAP.md`: hito A y sección 2.6 (“Demo público”).
- `docs/ui/pantallas.md` sección 0.5 (banner de demo).

## 3. Alcance

**Archivos que crea o modifica:**

- `.github/workflows/pages.yml`.
- `frontend/public/404.html`, `frontend/public/favicon.svg`, `frontend/public/manifest.webmanifest`, `frontend/public/robots.txt`.
- `frontend/src/app/ConexionBannerDemo.tsx` — conecta `BannerDemo` con `reiniciarDemo()`.

**Puede tocar:**

- `frontend/index.html`, `frontend/vite.config.ts`, `frontend/src/app/DisposicionApp.tsx`, `README.md` (enlace al demo).

**Fuera de alcance:**

- Service worker y modo sin conexión. Dominio propio.

## 4. Diseño

### 4.1 Interfaz

**Workflow `pages.yml`:** se dispara con `push` a `main` que toque `frontend/**` o `contracts/**`, y a mano (`workflow_dispatch`). Pasos: instalar, `lint`, `typecheck`, `test`, `build` con `VITE_API_MODE=mock` y `VITE_BASE=/PROYECTO-PARQUEADERO/`, y publicar con `actions/upload-pages-artifact` y `actions/deploy-pages`. Permisos mínimos: `contents: read`, `pages: write`, `id-token: write`. Concurrencia: un solo despliegue a la vez.

### 4.2 Datos

Ninguno.

### 4.3 Reglas de negocio

1. Si falla lint, tipos o pruebas, no se publica.
2. El build publicado usa siempre `VITE_API_MODE=mock` hasta que C-01 lo cambie.
3. `robots.txt` impide la indexación (`Disallow: /`) mientras sea un demo.
4. El manifiesto declara nombre “Parqueadero”, `display: standalone`, color de tema `#151A23`, color de fondo `#F6F7F9` e icono SVG.
5. El banner de demo aparece en todas las pantallas en modo `mock` y nunca en modo `live`.
6. “Reiniciar datos” pide confirmación, vuelve a sembrar, limpia la caché de consultas y conserva la sesión.

### 4.4 Seguridad

- El workflow no usa secretos. Las acciones de terceros se fijan por versión mayor oficial (`actions/*`).
- El build de demo no contiene ninguna URL de backend.

## 5. Criterios de aceptación

- [ ] **CA-1** Dado un push a `main` que cambia `frontend/`, cuando termina el workflow, entonces el sitio responde 200 en la URL de Pages y muestra el login.
- [ ] **CA-2** Dada una prueba que falla, cuando corre el workflow, entonces el paso de publicación no se ejecuta.
- [ ] **CA-3** Dado el sitio publicado, cuando se inicia sesión con el usuario de prueba y se recarga en `/#/clientes`, entonces la página carga sin 404.
- [ ] **CA-4** Dado el modo `mock`, entonces el banner “Modo demo: los datos son ficticios y se guardan solo en este navegador.” es visible en el login y dentro de la app; en modo `live` no se renderiza.
- [ ] **CA-5** Dado un cliente creado en el demo, cuando se pulsa “Reiniciar datos” y se confirma, entonces el cliente ya no existe y el usuario sigue con la sesión iniciada; si se cancela, el cliente sigue ahí.
- [ ] **CA-6** Dado el `dist/` del build de demo, cuando se busca la cadena `VITE_API_URL` o `http://localhost:8000`, entonces no aparece.
- [ ] **CA-7** Dado `dist/`, entonces contiene `robots.txt` con `Disallow: /` y un `manifest.webmanifest` válido enlazado desde `index.html`.

## 6. Pruebas requeridas

- UI: CA-4 y CA-5.
- CA-1 a CA-3 se verifican en el propio despliegue; el PR enlaza la ejecución del workflow y la URL publicada.

## 7. Notas para el constructor

- En la configuración del repositorio, Pages debe tener como origen “GitHub Actions”. Si no lo está, indícalo en el PR: es un paso manual del dueño del repositorio.
- Con `HashRouter` no hace falta el truco de redirección en `404.html`; basta una página simple con un enlace al inicio.

## 8. Preguntas abiertas

- …
