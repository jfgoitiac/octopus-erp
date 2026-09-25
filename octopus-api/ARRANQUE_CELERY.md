# Arranque de Celery + Beat

## Instalacion (una sola vez)

celery, django-celery-beat y redis ya estan en octopus-api/requirements.txt
(pip install -r requirements.txt los instala junto con el resto). Falta
unicamente aplicar sus migraciones:

python manage.py migrate django_celery_beat

## Desarrollo (3 terminales)

### Terminal 1 - Redis
redis-server

### Terminal 2 - Worker Celery
cd octopus-api
celery -A config worker -l info

### Terminal 3 - Beat (scheduler)
cd octopus-api
celery -A config beat -l info --scheduler django_celery_beat.schedulers:DatabaseScheduler

## Produccion con Supervisor

Instalar supervisor:
  pip install supervisor
  o: sudo apt install supervisor

Crear /etc/supervisor/conf.d/octopus_celery.conf:

[program:octopus_worker]
command=/ruta/al/venv/bin/celery -A config worker -l info
directory=/ruta/al/octopus-api
user=www-data
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
redirect_stderr=true
stdout_logfile=/var/log/octopus/celery_worker.log

[program:octopus_beat]
command=/ruta/al/venv/bin/celery -A config beat -l info --scheduler django_celery_beat.schedulers:DatabaseScheduler
directory=/ruta/al/octopus-api
user=www-data
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
redirect_stderr=true
stdout_logfile=/var/log/octopus/celery_beat.log

Activar:
  sudo supervisorctl reread
  sudo supervisorctl update
  sudo supervisorctl start octopus_worker octopus_beat

## Produccion con systemd

/etc/systemd/system/octopus-celery-worker.service:

[Unit]
Description=Octopus Celery Worker
After=network.target

[Service]
Type=forking
User=www-data
WorkingDirectory=/ruta/al/octopus-api
ExecStart=/ruta/al/venv/bin/celery -A config worker -l info
Restart=always

[Install]
WantedBy=multi-user.target

/etc/systemd/system/octopus-celery-beat.service:

[Unit]
Description=Octopus Celery Beat
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/ruta/al/octopus-api
ExecStart=/ruta/al/venv/bin/celery -A config beat -l info --scheduler django_celery_beat.schedulers:DatabaseScheduler
Restart=always

[Install]
WantedBy=multi-user.target

Activar:
  sudo systemctl daemon-reload
  sudo systemctl enable octopus-celery-worker octopus-celery-beat
  sudo systemctl start octopus-celery-worker octopus-celery-beat

Para un ambiente de staging con otro nombre de servicio (mismo patron que
usa deploy.sh via la variable SERVICE), duplicar las dos unidades con el
prefijo correspondiente, p.ej. octopus-staging-celery-worker.service y
octopus-staging-celery-beat.service, ajustando WorkingDirectory a la ruta
de ese REPO.

## Integracion con deploy.sh

deploy.sh reinicia backend, Celery Worker y Celery Beat como tres unidades
systemd independientes: $SERVICE, $SERVICE-celery-worker y
$SERVICE-celery-beat (SERVICE=octopus por defecto). Tras reiniciarlas
corre `manage.py verificar_celery` (ver abajo) para confirmar que todo
quedo operativo, sin volver a reiniciar nada.

## Verificar estado sin reiniciar nada

Comando de Django, de solo lectura (no reinicia procesos ni toca datos):

  python manage.py verificar_celery

Revisa: PING a Redis (via CELERY_BROKER_URL), PING de broadcast a los
workers de Celery (`celery control inspect ping`, no interrumpe tareas en
curso) y si hay tareas periodicas habilitadas para Beat en la base de
datos. Termina con exit code 1 si Redis o el worker no responden.

Para revisar los *procesos* systemd en el servidor sin reiniciarlos:

  systemctl is-active octopus-celery-worker octopus-celery-beat
  systemctl status --no-pager octopus-celery-worker octopus-celery-beat
  journalctl -u octopus-celery-worker -n 50 --no-pager
  journalctl -u octopus-celery-beat -n 50 --no-pager
  redis-cli ping

## Variables de entorno requeridas

  CELERY_BROKER_URL       URL de Redis               redis://localhost:6379/0
  CELERY_RESULT_BACKEND   Backend de resultados      redis://localhost:6379/0

## Nota sobre config/celery.py

config/celery.py es la unica instancia de Celery del proyecto (usa
config.settings) y el punto de entrada correcto para -A config en todos
los comandos de este documento. La configuracion original en
cobranza/celery.py (que apuntaba a octopus.settings) ya fue eliminada.
