# Respaldo externo diario a Google Drive

Este documento explica cómo funciona el respaldo externo (PostgreSQL + media)
que se sube a Google Drive, por qué se diseñó así, y el paso a paso exacto
para configurarlo en un VPS nuevo (por ejemplo, al desplegar el sistema para
otra entidad/colegio).

## Qué hace

`python manage.py respaldo_externo` (comando en
`usuarios/management/commands/respaldo_externo.py`) ejecuta
`ejecutar_respaldo_externo()` en `usuarios/backup.py`, que:

1. Genera un `.tar.gz` con el dump de PostgreSQL (`database.sql`) + todo
   `MEDIA_ROOT` + un `manifest.json` con checksums
2. Rota (borra) respaldos locales más viejos que `BACKUP_RETENTION_DAYS`
   (14 días por defecto)
3. Sube el `.tar.gz` a una carpeta de Google Drive
4. Envía un correo de éxito/fallo a `BACKUP_ALERT_EMAILS`

El archivo queda tanto en el disco local (`MEDIA_ROOT/backups/` o
`BACKUP_DIR`) como en Drive.

## Decisión de arquitectura: OAuth de usuario, NO cuenta de servicio

**Regla importante: nunca usar una cuenta de servicio (`service_account`) de
Google para subir a un Drive personal/gratuito.** Las cuentas de servicio
tienen 0 bytes de cuota de almacenamiento propia. Aunque compartas una
carpeta con el email de la cuenta de servicio y le des rol Editor, cualquier
subida de archivo falla con:

```
storageQuotaExceeded: Service Accounts do not have storage quota.
Leverage shared drives, or use OAuth delegation instead.
```

Las "Shared Drives" (unidades compartidas) que resolverían esto **requieren
Google Workspace de pago** — no existen en Gmail gratuito.

**Solución usada: OAuth con la cuenta de Gmail real del dueño del Drive.**
El backend guarda un `token.json` (con `refresh_token`, se renueva solo) y
sube los archivos como si fuera esa persona, usando su cuota normal de
Google Drive (15GB gratis).

## Decisión de scope: `drive.file`, NO `drive` completo

Se usa el scope restringido
`https://www.googleapis.com/auth/drive.file` (acceso solo a archivos que la
propia app crea), no el scope completo `drive` (acceso a todo el Drive del
usuario). Es el principio de menor privilegio: si el `token.json` se filtra,
solo compromete los archivos que la app creó, no todo el Drive.

**Consecuencia importante de este scope:** la carpeta de destino en Drive
**debe ser creada por la propia app vía API**, no manualmente desde la
interfaz de Drive. Si compartes una carpeta creada a mano (aunque seas el
dueño y le des permiso a la app), la API responde `404 File not found` al
intentar subir — con `drive.file` la app literalmente no puede "ver" nada
que no haya creado ella misma. El script `crear_carpeta_drive.py` (ver
abajo) resuelve esto creando la carpeta por API la primera vez.

## Variables de entorno (`.env` del servidor, nunca en git)

```bash
GOOGLE_DRIVE_TOKEN_FILE=/etc/octopus/google-drive-token.json
GOOGLE_DRIVE_BACKUP_FOLDER_ID=<id-de-la-carpeta-creada-por-la-app>
BACKUP_ALERT_EMAILS=correo1@ejemplo.com,correo2@ejemplo.com
# Opcionales:
# BACKUP_DIR=/var/backups/octopus        (por defecto: media/backups)
# BACKUP_RETENTION_DAYS=14
```

Ver plantilla comentada en `.env.example`.

## Paso a paso para configurar en un VPS NUEVO (otra entidad)

**No reutilices el mismo Gmail/Drive para distintas entidades** — cada
colegio debe tener su propia cuenta (la del director, o una dedicada tipo
`respaldos.colegio@gmail.com`) para no mezclar datos de estudiantes/pagos
de instituciones distintas en un mismo Drive personal.

### 1. Google Cloud Console (una vez por proyecto/entidad)

1. [console.cloud.google.com](https://console.cloud.google.com) → crear
   proyecto nuevo (ej. `<nombre-colegio>-backups`)
2. Buscar "Google Drive API" → **Enable**
3. **APIs & Services → OAuth consent screen** → **Get started**:
   - App name: cualquiera descriptivo
   - User type: **External**
   - Correo de soporte/contacto: el Gmail que se usará
4. **Audience** → **Test users** → agregar el Gmail que se usará (el mismo
   dueño del Drive de destino)
5. **Data Access** → **Add or remove scopes** → filtrar `drive.file` →
   marcar "See, edit, create, and delete only the specific Google Drive
   files you use with this app" → **Update** → **Save**
6. **Credentials → Create credentials → OAuth client ID**:
   - Application type: **Desktop app**
   - Crear → **descargar el JSON** (`client_secret_xxxx.json`)

### 2. Autorizar localmente (en una PC con navegador, NUNCA en el VPS)

```bash
pip install google-auth-oauthlib google-api-python-client
python autorizar_drive.py client_secret_xxxx.json
```

(el script está en la raíz del repo: `autorizar_drive.py`)

Se abre el navegador → iniciar sesión con el Gmail de esa entidad → aceptar
advertencia de "app no verificada" (Advanced → Go to `<nombre-app>`
(unsafe)) → aceptar el permiso de Drive. Esto genera `token.json` en la
carpeta local.

### 3. Crear la carpeta de destino vía API (no a mano)

Con el `token.json` recién generado en la misma carpeta:

```python
# crear_carpeta_drive.py (recrear si no existe; ver git history del commit
# 006288b para el contenido original)
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

SCOPES = ['https://www.googleapis.com/auth/drive.file']
credenciales = Credentials.from_authorized_user_file('token.json', scopes=SCOPES)
servicio = build('drive', 'v3', credentials=credenciales, cache_discovery=False)
carpeta = servicio.files().create(
    body={'name': 'Respaldos Octopus', 'mimeType': 'application/vnd.google-apps.folder'},
    fields='id, name',
).execute()
print(carpeta['id'])
```

Guarda el `id` que imprime — es el `GOOGLE_DRIVE_BACKUP_FOLDER_ID`.

### 4. Subir `token.json` al VPS de esa entidad

```bash
sudo mkdir -p /etc/octopus
sudo tee /etc/octopus/google-drive-token.json > /dev/null << 'EOF'
<pegar aquí el contenido de token.json>
EOF
sudo chmod 600 /etc/octopus/google-drive-token.json
sudo chown www-data:www-data /etc/octopus/google-drive-token.json
```

(ajusta `www-data` al usuario real que corre Django/Celery en ese VPS)

### 5. Completar el `.env` de ese VPS

```bash
GOOGLE_DRIVE_TOKEN_FILE=/etc/octopus/google-drive-token.json
GOOGLE_DRIVE_BACKUP_FOLDER_ID=<id-de-la-carpeta-del-paso-3>
BACKUP_ALERT_EMAILS=<correo-de-esa-entidad>
```

### 6. Limpieza local

Borrar `token.json` y `client_secret_xxxx.json` de la PC local una vez
subidos — son credenciales reales, no deben quedar sueltos.

### 7. Probar

```bash
python manage.py respaldo_externo
```

Debe terminar con `Respaldo externo completado: octopus_backup_<fecha>.tar.gz`
y un correo de confirmación.

## Pendiente para que corra automático (no solo manual)

Actualmente el comando se corre a mano. Para que se ejecute solo todos los
días falta:
- Configurar `CELERY_BROKER_URL` en el `.env` (Redis)
- Crear las unidades systemd `<service>-celery-worker` y
  `<service>-celery-beat` (ver `ARRANQUE_CELERY.md`)
- Registrar `usuarios.tasks.respaldo_diario_automatico` (o el nombre que
  tenga la tarea en `tasks.py`) en `django-celery-beat` con el horario
  deseado

Esto está pendiente de configurar en el VPS actual (`srv1765770`) al
momento de escribir este documento (2026-09-26).
