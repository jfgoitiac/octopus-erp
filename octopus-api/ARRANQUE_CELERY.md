# Arranque de Celery + Beat

## Instalacion (una sola vez)

pip install django-celery-beat
python manage.py migrate django_celery_beat

NOTA: django-celery-beat NO estaba en el venv al momento de la integracion.
Debe instalarse antes de levantar los procesos.

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

## Variables de entorno requeridas

  CELERY_BROKER_URL       URL de Redis               redis://localhost:6379/0
  CELERY_RESULT_BACKEND   Backend de resultados      redis://localhost:6379/0

## Nota sobre cobranza/celery.py

El archivo cobranza/celery.py es la configuracion Celery original del proyecto
(apunta a octopus.settings). El nuevo config/celery.py es la instancia canonica
que usa config.settings y es el punto de entrada correcto para -A config.
La instancia de cobranza/celery.py puede eliminarse una vez confirmado que
ningun otro proceso la referencia directamente.
