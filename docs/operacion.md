# Operación y despliegue del backend

Guía paso a paso para poner la API en internet y mantenerla (spec B-09, decisión D-1: **Render + Neon**). Está escrita para alguien sin contexto del proyecto. Sigue las secciones en orden la primera vez.

| Pieza | Servicio | Plan |
|---|---|---|
| Base de datos PostgreSQL 16 con TLS y copias | [Neon](https://neon.tech) | Free |
| API (contenedor Docker con HTTPS) | [Render](https://render.com) | Free |
| Frontend | GitHub Pages (`https://shaktiintelligence777-sudo.github.io`) | — |

Necesitas: una cuenta de GitHub con acceso a este repositorio, una terminal con `openssl` y un gestor de contraseñas donde guardar los secretos.

---

## 1. Crear la base de datos en Neon

1. Entra en <https://console.neon.tech> y crea una cuenta (puedes usar “Continuar con GitHub”).
2. **Create project**:
   - *Project name*: `parqueadero`.
   - *Postgres version*: **16**.
   - *Region*: **AWS US East 1 (N. Virginia)**. Es la más cercana a Colombia en latencia y coincide con la región de Render del paso 2.
   - *Database name*: `parqueadero`.
3. Al crear el proyecto, Neon crea un rol dueño (por ejemplo `neondb_owner`). Ese rol **no** es superusuario de PostgreSQL (Neon no los ofrece), así que sirve como usuario de la aplicación.
4. En **Dashboard → Connect**, elige la rama `main`, la base `parqueadero` y copia la cadena de conexión **directa** (desactiva *Connection pooling*; las migraciones necesitan una conexión directa). Tiene esta forma:

   ```
   postgresql://neondb_owner:CLAVE@ep-xxxx.us-east-1.aws.neon.tech/parqueadero?sslmode=require&channel_binding=require
   ```

   Esa cadena es tu `DATABASE_URL`. Guárdala en el gestor de contraseñas; **nunca** la pegues en el repositorio, en un issue ni en un chat.
5. Copias de seguridad: en **Settings → Storage / History retention** comprueba la ventana de restauración (en el plan gratuito, 24 horas; amplíala si cambias de plan). Ver la sección 7.

> La API exige TLS en producción y verifica el certificado del servidor. Si la URL trae `sslmode=disable`, `allow` o `prefer`, el servicio **no arranca** y lo dice en el log (CA-4). `sslmode=require` o `verify-full` son válidos: en ambos casos la API usa TLS con verificación completa.

## 2. Generar los secretos

En tu terminal, genera dos valores distintos:

```sh
openssl rand -base64 48   # → JWT_SECRETO
openssl rand -base64 48   # → SERVICE_TOKEN
```

Guárdalos en el gestor de contraseñas. `JWT_SECRETO` firma las sesiones; `SERVICE_TOKEN` lo usa el job de notificaciones (B-07) para llamar a la API.

## 3. Crear el servicio en Render

El archivo [`render.yaml`](../render.yaml) describe el servicio (Blueprint). No contiene secretos: los pide al crearlo.

1. Entra en <https://dashboard.render.com> y crea una cuenta con GitHub.
2. **New → Blueprint**. Conecta la cuenta de GitHub y elige el repositorio `PROYECTO-PARQUEADERO`, rama `main`.
3. Render lee `render.yaml` y muestra el servicio `parqueadero-api` (Docker, plan Free, región Virginia). Te pedirá los valores marcados como secretos:

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | La cadena de Neon del paso 1. |
   | `JWT_SECRETO` | El primer valor del paso 2. |
   | `SERVICE_TOKEN` | El segundo valor del paso 2. |

   Ya vienen fijadas: `ENTORNO=produccion`, `ZONA_HORARIA=America/Bogota` y `CORS_ORIGENES=https://shaktiintelligence777-sudo.github.io`. Cuando se active B-07 se añadirán aquí las variables de correo.
4. **Apply**. Render construye la imagen desde `backend/Dockerfile`. Al arrancar, el contenedor ejecuta `backend/scripts/arranque.sh`:
   1. `alembic upgrade head`: aplica las migraciones pendientes **antes** de abrir el puerto.
   2. `uvicorn`: la API empieza a responder en el puerto que asigna Render.

   Render solo envía tráfico al contenedor nuevo cuando `GET /api/v1/salud` responde 200. Si la migración falla, el contenedor termina, el despliegue queda como *failed* y **sigue sirviendo la versión anterior**.
5. Anota la URL pública del servicio, por ejemplo `https://parqueadero-api.onrender.com`.

Con `autoDeploy: true`, cada fusión en `main` vuelve a desplegar.

### Límite del plan gratuito

El servicio gratuito de Render **se duerme tras unos 15 minutos sin tráfico**. La primera petición después de eso tarda entre 30 y 60 segundos mientras despierta; las siguientes son normales. Si el parqueadero lo usa durante todo el día, conviene pasar al plan pago más pequeño para evitar esa espera al abrir.

## 4. Comprobar el despliegue

Sustituye `HOST` por la URL del paso 3.5.

```sh
HOST=https://parqueadero-api.onrender.com

# CA-1: salud por HTTPS → 200 {"estado":"ok",...}
curl -i "$HOST/api/v1/salud"

# CA-2: documentación desactivada → 404
curl -i "$HOST/docs"

# CA-3: preflight CORS desde GitHub Pages → 200 con access-control-allow-origin
curl -i -X OPTIONS "$HOST/api/v1/auth/login" \
  -H "Origin: https://shaktiintelligence777-sudo.github.io" \
  -H "Access-Control-Request-Method: POST"

# CA-3: desde otro origen → 400 y sin access-control-allow-origin
curl -i -X OPTIONS "$HOST/api/v1/auth/login" \
  -H "Origin: https://otro-sitio.example" \
  -H "Access-Control-Request-Method: POST"
```

## 5. Crear el primer administrador

No hay registro público: el primer usuario se crea con un comando, una sola vez.

1. En Render, abre el servicio `parqueadero-api` → **Shell** (si tu plan no tiene Shell, usa la alternativa de abajo).
2. Ejecuta, con tu email y nombre:

   ```sh
   python -m app.db.crear_admin --email dueno@ejemplo.com --nombre "Nombre Apellido"
   ```

3. Escribe la contraseña dos veces (no se ve al escribir). Debe tener **12 caracteres o más**.
4. Si el email ya existe, el comando no cambia nada y lo indica.

**Alternativa sin Shell de Render** (desde tu computador, con Docker o con Python 3.12):

```sh
cd backend
python -m venv .venv && . .venv/bin/activate && pip install .
export ENTORNO=produccion DATABASE_URL='(la de Neon)' JWT_SECRETO='(el de Render)' \
       SERVICE_TOKEN='(el de Render)' CORS_ORIGENES=https://shaktiintelligence777-sudo.github.io
python -m app.db.crear_admin --email dueno@ejemplo.com --nombre "Nombre Apellido"
```

Comprueba el inicio de sesión (CA-7):

```sh
curl -s -X POST "$HOST/api/v1/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"dueno@ejemplo.com","password":"(tu contraseña)"}'
# → {"access_token": "...", "refresh_token": "...", "usuario": {...}}
```

Los demás usuarios (operadores) los crea el admin desde la pantalla de Configuración.

> La semilla de demostración (`python -m app.db.semilla`) **se niega a ejecutarse** con `ENTORNO=produccion`. No la uses contra Neon.

## 6. Migraciones

- Cada cambio de esquema llega como una migración nueva en `backend/alembic/versions/`. No hay que hacer nada a mano: se aplica sola en el siguiente despliegue, antes de que el servicio responda.
- Para ver en qué versión está la base, en el Shell de Render: `alembic current`.
- **Antes de fusionar una migración delicada** (que borra o transforma datos), crea una rama de Neon como copia (sección 7, paso 1) para poder volver atrás.
- Nunca se edita una migración ya fusionada ni se ejecuta `alembic downgrade` en producción sin una copia previa.

## 7. Copias de seguridad y restauración

Neon guarda el historial de cambios de la base y permite volver a cualquier instante dentro de la ventana de retención (24 horas en el plan gratuito). Además, conviene una copia lógica semanal fuera de Neon.

### Prueba de restauración (hazla una vez al configurar y luego cada mes)

1. **Crear una copia de un instante pasado.** En Neon → **Branches → Create branch**: *Parent* `main`, *Include data up to* **Specific date and time**, elige un instante de hace una hora. Nómbrala `restauracion-prueba`.
2. **Comprobarla.** En la rama nueva, **Connect** → copia su cadena y ejecuta:

   ```sh
   psql 'CADENA_DE_LA_RAMA' -c "select count(*) from clientes;" \
       -c "select count(*) from pagos;" -c "select max(creado_en) from auditoria;"
   ```

   Los conteos deben corresponder a ese instante, y `max(creado_en)` debe ser anterior a él.
3. **Borrar la rama de prueba** cuando termines (Branches → `restauracion-prueba` → Delete).

### Restaurar de verdad (si se perdieron o dañaron datos)

1. Avisa a los operadores y deja de registrar movimientos.
2. En Neon → **Branches → main → Restore**, elige el instante anterior al problema. Neon guarda el estado actual como rama de respaldo antes de restaurar, por si hay que volver.
3. Reinicia el servicio en Render (**Manual Deploy → Restart service**) y comprueba la salud y el inicio de sesión (sección 4).

### Copia lógica semanal (fuera de Neon)

```sh
pg_dump 'DATABASE_URL' --format=custom --no-owner --file "parqueadero-$(date +%F).dump"
```

Guarda el archivo en un lugar privado y cifrado. Para restaurarlo en una base vacía: `pg_restore --no-owner --dbname 'URL_DESTINO' parqueadero-AAAA-MM-DD.dump`.

## 8. Rotación de secretos

Hazlo si un secreto pudo filtrarse, cuando alguien con acceso deja el proyecto, y al menos una vez al año.

| Secreto | Cómo rotarlo | Efecto |
|---|---|---|
| `JWT_SECRETO` | `openssl rand -base64 48` → Render → *Environment* → reemplazar → **Save, rebuild and deploy**. | Las sesiones abiertas dejan de valer; todos vuelven a iniciar sesión. |
| `SERVICE_TOKEN` | Igual que el anterior, y actualizar el mismo valor en el secreto de GitHub Actions del job de notificaciones (B-07). | El job falla hasta que ambos lados coincidan. |
| Clave de la base | Neon → **Roles → neondb_owner → Reset password** → copiar la nueva cadena → actualizar `DATABASE_URL` en Render y desplegar. | Unos segundos sin servicio mientras se reinicia. |

Nunca escribas un secreto en el repositorio, en `render.yaml`, en un issue o en un mensaje. Si ocurre por error, rótalo de inmediato: borrar el commit no basta.

## 9. Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| El log dice `DATABASE_URL desactiva TLS` | La URL trae `sslmode=disable`, `allow` o `prefer`. | Usa la cadena de Neon tal cual (`sslmode=require`). |
| El despliegue falla en `alembic upgrade head` | Migración con error o base inaccesible. | Revisa el log de Render; la versión anterior sigue en servicio. Corrige y vuelve a fusionar. |
| La primera petición tarda casi un minuto | El plan gratuito durmió el servicio. | Normal; ver “Límite del plan gratuito”. |
| El frontend dice “No se pudo conectar” y la consola muestra un error de CORS | `CORS_ORIGENES` no coincide con el origen de la página. | Debe ser exactamente `https://shaktiintelligence777-sudo.github.io`, sin barra final. |
| `429 demasiados_intentos` al iniciar sesión | Límite de intentos por email o por IP (B-03). | Espera 15 minutos. |
