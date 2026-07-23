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
