# Ambiente de Staging

Hoy el flujo es local → producción directo (`git pull` + `deploy.sh` en el
VPS de producción). Esto documenta cómo montar un ambiente intermedio —
requiere acceso al VPS (o a uno nuevo), que este asistente no tiene, así que
son los pasos a seguir manualmente, no algo que se pueda ejecutar desde el repo.

## Opción recomendada: mismo VPS, segundo subdominio

Más barato que un servidor nuevo, y suficiente para un colegio-cliente
(el volumen de staging es bajo). Aislar bien cada recurso es lo que importa,
no la máquina física.

## Matriz de aislamiento (staging vs. producción)

| Recurso | Producción | Staging | Por qué |
|---|---|---|---|
| Directorio/repo | `/var/www/octopus` | `/var/www/octopus-staging` | checkout completo aparte — nada se comparte en disco |
| Dominio | `app.tudominio.com` | `staging.tudominio.com` | subdominio propio, certificado SSL propio |
| Base de datos | `octopus` | `octopus_staging` | misma instancia Postgres, BD distinta — nunca compartir |
| Redis (broker/result backend) | `redis://localhost:6379/0` | `redis://localhost:6379/1` | mismo Redis, **índice de BD distinto** — evita mezclar colas de Celery |
| Media (`MEDIA_ROOT`) | `/var/www/octopus/octopus-api/media/` | `/var/www/octopus-staging/octopus-api/media/` | ya aislado automáticamente: `MEDIA_ROOT = BASE_DIR / 'media'` en `config/settings.py`, y `BASE_DIR` es distinto por checkout |
| Servicio Django (systemd) | `octopus.service` (puerto 8000) | `octopus-staging.service` (puerto 8001) | unidad y puerto interno propios |
| Celery Worker (systemd) | `octopus-celery-worker.service` | `octopus-staging-celery-worker.service` | ver `octopus-api/ARRANQUE_CELERY.md` |
| Celery Beat (systemd) | `octopus-celery-beat.service` | `octopus-staging-celery-beat.service` | ver `octopus-api/ARRANQUE_CELERY.md` |
| `.env` | `/var/www/octopus/octopus-api/.env` | `/var/www/octopus-staging/octopus-api/.env` | plantilla: `octopus-api/.env.staging.example` |
| SMTP | credenciales reales del colegio | cuenta de pruebas (Mailtrap/Mailhog) | un correo mal disparado en staging no debe llegar a un representante real |
| Google Drive (respaldos) | carpeta/cuenta de servicio real | vacío (recomendado) o carpeta/cuenta de servicio de prueba | staging nunca debe escribir en la carpeta de Drive real del colegio |
| Nginx | `deploy/nginx/app.clhmacoro.com.conf` | `deploy/nginx/staging.example.conf` | server block, certificado y `proxy_pass` propios |

## Pasos manuales en el servidor (documentados, NO ejecutados desde aquí)

Reemplazar los marcadores (`<...>`) por los valores reales del colegio.
Cada bloque indica el resultado esperado para poder confirmarlo sin
necesidad de repetir el paso.

1. **Base de datos separada** (mismo Postgres, BD nueva; nunca apuntar
   staging a la BD de producción):
   ```bash
   sudo -u postgres psql -c "CREATE DATABASE octopus_staging;"
   sudo -u postgres psql -c "CREATE USER octopus_staging_user WITH PASSWORD '<password-de-staging>';"
   sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE octopus_staging TO octopus_staging_user;"
   ```
   Resultado esperado: `CREATE DATABASE` / `CREATE ROLE` / `GRANT` sin error.
   Verificación sin efectos secundarios: `sudo -u postgres psql -l | grep octopus_staging`
   debe listar la BD nueva junto a (no en lugar de) `octopus`.

2. **Segundo checkout del repo**:
   ```bash
   sudo mkdir -p /var/www/octopus-staging
   sudo chown "$USER":"$USER" /var/www/octopus-staging
   git clone <repo> /var/www/octopus-staging
   ```
   Resultado esperado: `/var/www/octopus-staging/octopus-api`,
   `octopus-frontend` y `octopus-sitio` existen como checkout independiente
   de `/var/www/octopus`.

3. **`.env` propio** en `/var/www/octopus-staging/octopus-api/.env` — copiar
   desde la plantilla `octopus-api/.env.staging.example` (no desde el `.env`
   real de producción) y completar los valores de staging:
   ```bash
   cp /var/www/octopus-staging/octopus-api/.env.staging.example \
      /var/www/octopus-staging/octopus-api/.env
   # editar el .env recién copiado: DB_NAME=octopus_staging, dominio de
   # staging, CELERY_BROKER_URL con índice /1, SMTP de prueba, etc.
   ```
   La plantilla ya documenta, campo por campo, por qué cada valor debe ser
   distinto al de producción (ver comentarios dentro del archivo).

4. **Migrar la BD de staging** (una vez el `.env` apunta a `octopus_staging`):
   ```bash
   cd /var/www/octopus-staging/octopus-api
   ./venv/bin/python manage.py migrate --noinput
   ```
   Resultado esperado: todas las migraciones se aplican sobre `octopus_staging`
   (BD vacía la primera vez) — nunca sobre `octopus`.

5. **Servicio systemd propio** (`octopus-staging.service`), copiando el
   `octopus.service` existente y ajustando `WorkingDirectory`/`ExecStart`
   al checkout de staging y un puerto interno distinto (8001 en vez de 8000):
   ```bash
   sudo cp /etc/systemd/system/octopus.service /etc/systemd/system/octopus-staging.service
   sudo sed -i \
     -e 's#/var/www/octopus#/var/www/octopus-staging#g' \
     -e 's/:8000/:8001/' \
     /etc/systemd/system/octopus-staging.service
   sudo systemctl daemon-reload
   sudo systemctl enable octopus-staging
   sudo systemctl start octopus-staging
   ```
   Resultado esperado: `systemctl is-active octopus-staging` responde `active`,
   y `systemctl is-active octopus` (producción) sigue `active` sin haberse
   tocado.

6. **Celery Worker y Beat de staging** — ver plantillas completas en
   `octopus-api/ARRANQUE_CELERY.md` (sección "Para un ambiente de staging"):
   crear `octopus-staging-celery-worker.service` y
   `octopus-staging-celery-beat.service` apuntando al checkout de staging.
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable octopus-staging-celery-worker octopus-staging-celery-beat
   sudo systemctl start octopus-staging-celery-worker octopus-staging-celery-beat
   ```
   Resultado esperado: ambas unidades `active`; verificar sin reiniciar nada
   con `cd /var/www/octopus-staging/octopus-api && ./venv/bin/python manage.py verificar_celery`
   (PING a Redis índice `/1`, worker de staging responde, tareas de Beat
   habilitadas) — debe reportar OK sin haber tocado el worker/beat de
   producción (índice `/0`).

7. **Bloque nginx propio** para `staging.tudominio.com` a partir de
   `deploy/nginx/staging.example.conf` (reemplazar `STAGING_DOMAIN`,
   `STAGING_REPO`, `STAGING_PORT`):
   ```bash
   sudo cp deploy/nginx/staging.example.conf /etc/nginx/sites-available/staging.tudominio.com
   # reemplazar los marcadores en el archivo copiado, luego:
   sudo ln -s /etc/nginx/sites-available/staging.tudominio.com /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo certbot certonly --webroot -w /var/www/certbot -d staging.tudominio.com
   sudo systemctl reload nginx
   ```
   Resultado esperado: `nginx -t` reporta `syntax is ok` / `test is successful`;
   `curl -I https://staging.tudominio.com/api/health/` responde `200`.

8. **Deploy a staging** con el mismo script parametrizado, ahora con guardas
   de seguridad (ver "Salvaguardas en deploy.sh" abajo):
   ```bash
   REPO=/var/www/octopus-staging SERVICE=octopus-staging BRANCH=<rama-a-probar> ./deploy.sh
   ```
   Resultado esperado: el script hace `git pull origin <rama-a-probar>` dentro
   de `/var/www/octopus-staging`, reinicia `octopus-staging`,
   `octopus-staging-celery-worker` y `octopus-staging-celery-beat`, y corre
   `verificar_celery` — todo sin tocar `/var/www/octopus` ni las unidades de
   producción.

## Salvaguardas en deploy.sh

`deploy.sh` valida, antes de tocar nada, que `REPO` y `SERVICE` estén de
acuerdo en el ambiente: los dos deben contener `staging`, o ninguno. Si uno
de los dos se pasa por error (p. ej. se define `SERVICE=octopus-staging`
pero se olvida `REPO`), el script se detiene con un error explícito antes de
hacer `git pull` o `systemctl restart` — nunca reinicia el servicio de
producción con un checkout de staging a medio configurar, ni viceversa.

También valida que una rama distinta de `main` (`BRANCH=...`) solo pueda
desplegarse contra un `REPO`/`SERVICE` cuyos nombres contengan `staging` en
minúsculas. Así una rama de feature no puede terminar en una instalación de
producción con un nombre alternativo. Sin overrides, el script se comporta
exactamente igual que antes (rama `main`, `REPO`/`SERVICE` de producción).

Nginx es un proceso compartido si staging y producción viven en el mismo VPS.
Por eso un `deploy.sh` de staging hace una recarga *graceful* de la
configuración completa de Nginx, incluida producción; no reinicia las
conexiones activas, pero requiere que `nginx -t` pase y que el operador haya
revisado el bloque de staging antes de la recarga.

## Flujo de trabajo sugerido

```
local → push a una rama → deploy manual a staging (BRANCH=esa-rama) → probar →
merge a main → deploy a producción (sin BRANCH, usa main por defecto)
```

El CI (`.github/workflows/ci.yml`) ya corre tests/build en cada push/PR a
`main` — staging es el paso siguiente, antes de que el cambio llegue a
producción, no un reemplazo del CI.

## Qué NO hacer

- No apuntar staging a la BD de producción "para probar con datos reales" —
  cualquier bug en un script de staging (ej. un comando de gestión con
  `--confirm` corrido sin querer) se lleva los datos reales.
- No apuntar `CELERY_BROKER_URL`/`CELERY_RESULT_BACKEND` de staging al mismo
  índice de Redis que producción (`/0`) — el worker de staging empezaría a
  consumir tareas encoladas por producción (y viceversa), con datos reales
  de por medio (recordatorios de mora, respaldo de BD, etc.).
- No usar las credenciales SMTP reales en staging — un test mal hecho no
  debe mandarle un recordatorio de mora a un representante real.
- No apuntar `GOOGLE_DRIVE_BACKUP_FOLDER_ID` de staging a la carpeta de
  Drive real del colegio — dejar esas variables vacías en staging es la
  opción segura por defecto (el respaldo automático simplemente no corre).
- No correr `deploy.sh` con `BRANCH` distinto de `main` contra el `REPO`/
  `SERVICE` de producción — el script ya lo bloquea, pero tampoco intentar
  evadir la guarda editándola sin pasar antes por staging.
