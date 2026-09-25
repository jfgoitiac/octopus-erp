# Restauración de emergencia (PostgreSQL)

## Cómo se genera el respaldo

Endpoint `POST /backup/` (`usuarios/views.py` → `DatabaseBackupView`), solo accesible para
`is_superuser` o perfiles con rol `director`, `sistemas` o `administrador`.

En producción (`DB_ENGINE=postgresql`) corre `pg_dump --no-owner --no-privileges` y descarga
un archivo `backup_<usuario>_<fecha>.sql` en formato plano. Requiere el binario `pg_dump`
(paquete `postgresql-client`), que `deploy.sh` instala automáticamente si falta.

## Restaurar en un servidor nuevo o de emergencia

1. Instalar PostgreSQL y `postgresql-client` si no están:
   ```bash
   sudo apt-get install -y postgresql postgresql-client
   ```

2. Crear la base de datos y el usuario (usar los mismos valores que `DB_NAME`/`DB_USER`
   del `.env`, o los nuevos si es un servidor distinto):
   ```bash
   sudo -u postgres psql -c "CREATE DATABASE octopus;"
   sudo -u postgres psql -c "CREATE USER octopus_user WITH PASSWORD 'la-contraseña';"
   sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE octopus TO octopus_user;"
   ```

3. Restaurar el dump (la BD debe estar vacía; el dump no incluye `CREATE DATABASE`):
   ```bash
   psql -h HOST -p 5432 -U octopus_user -d octopus -f backup_xxx.sql
   ```

4. Verificar que el `.env` del servidor apunte a esta BD (`DB_ENGINE=postgresql`, `DB_NAME`,
   `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`).

5. Correr migraciones pendientes por si el dump es de una versión de código anterior al
   deploy actual:
   ```bash
   python manage.py migrate
   ```

6. Reiniciar el backend (`sudo systemctl restart octopus`) y probar login + carga del
   dashboard antes de dar por cerrada la emergencia.

## Verificación periódica (recomendado)

El respaldo solo sirve si alguien confirma que restaura. Cada cierto tiempo:
- Descargar un backup real desde `/backup/`.
- Restaurarlo contra una BD Postgres de prueba (nunca la de producción) con el comando del
  paso 3.
- Confirmar que las tablas y conteos de filas coinciden con lo esperado.

## Notas

- `--no-owner --no-privileges` evita que la restauración falle si el rol de Postgres del
  servidor de emergencia no coincide exactamente con el de origen.
- El dump no incluye archivos subidos por los usuarios (comprobantes de pago, fotos, etc.)
  en `media/` — eso se respalda aparte (copiar el directorio `media/` del servidor).
- Si en algún momento se vuelve a SQLite en desarrollo, `/backup/` cae automáticamente a
  `dumpdata` (JSON), no a `pg_dump`.

## Respaldo externo diario: PostgreSQL + media en Google Drive

Celery Beat ejecuta `usuarios.tasks.respaldo_diario_automatico` diariamente a
las 03:00 (America/Caracas). La tarea crea localmente un archivo
`octopus_backup_<fecha>.tar.gz` con:

- `database.sql`: dump PostgreSQL generado por `pg_dump --no-owner --no-privileges`.
- `media/`: archivos subidos por usuarios, sin incluir respaldos locales.
- `manifest.json`: fecha, conteo de media y SHA-256 del dump.

Después lo carga a la carpeta configurada de Google Drive mediante una cuenta
de servicio. El archivo local se conserva y se rota tras los días configurados
(`BACKUP_RETENTION_DAYS`, 14 por defecto). Los correos solo informan éxito o
fallo; nunca incluyen respaldos como adjuntos.

### Configuración única en el servidor

1. En Google Cloud, habilitar Google Drive API y crear una cuenta de servicio.
   Crear una carpeta de Drive exclusiva para respaldos y compartirla con la
   cuenta de servicio como **Editor**. No hacer pública la carpeta.
2. Instalar el JSON de la cuenta de servicio fuera del repositorio, con permisos
   de lectura solo para el usuario que ejecuta Django/Celery. Por ejemplo:
   ```bash
   sudo install -d -m 700 -o octopus -g octopus /etc/octopus
   sudo install -m 600 -o octopus -g octopus /origen/seguro/google-drive-backup.json /etc/octopus/google-drive-backup.json
   ```
3. Añadir al `.env` existente en el servidor, sin comillas de ejemplo ni valores
   en Git:
   ```dotenv
   GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE=/etc/octopus/google-drive-backup.json
   GOOGLE_DRIVE_BACKUP_FOLDER_ID=...
   BACKUP_ALERT_EMAILS=director@...,sistemas@...
   ```
   Opcionalmente definir `BACKUP_DIR` en un disco distinto y
   `BACKUP_RETENTION_DAYS=14`.
4. Instalar dependencias de la versión desplegada y reiniciar Worker y Beat
   siguiendo `ARRANQUE_CELERY.md`. No ejecutar dos instancias de Beat.
5. Como prueba controlada, ejecutar una vez con el mismo usuario del servicio:
   ```bash
   /var/www/octopus/octopus-api/venv/bin/python /var/www/octopus/octopus-api/manage.py respaldo_externo
   ```
   Confirmar en Drive un archivo nuevo, en el directorio local el mismo nombre
   y un correo de estado. No copiar tokens, IDs ni nombres de estudiantes en el
   ticket de verificación.

### Restauración y prueba de restauración

Nunca extraer ni restaurar sobre producción. Descargar un archivo desde Drive
o usar la copia local y trabajar en un directorio temporal de un servidor o BD
de pruebas:

```bash
mkdir -p /tmp/octopus-restore
tar -xzf octopus_backup_YYYYMMDD_HHMMSS.tar.gz -C /tmp/octopus-restore
cd /tmp/octopus-restore
sha256sum database.sql
# Comparar el hash con base_de_datos.sha256 de manifest.json.
createdb octopus_restore_test
psql -d octopus_restore_test -f database.sql
```

Configurar una instancia de prueba para que use `octopus_restore_test` y una
copia de `media/`, ejecutar `python manage.py migrate`, `python manage.py
check` y verificar login, una inscripción, un pago y un comprobante. Al
terminar, eliminar únicamente la BD y directorio de prueba explícitamente
identificados; no usar comandos destructivos contra la BD de producción.
