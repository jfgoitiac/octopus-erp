import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'octopus.settings')

app = Celery('octopus')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

app.conf.beat_schedule = {
    'actualizar-tasa-bcv-diario': {
        'task': 'cobranza.tasks.actualizar_tasa_bcv_automatica',
        'schedule': crontab(minute='*/30', hour='8-17', day_of_week='1-5'),
    },
    'verificar-solvencia-diaria': {
        'task': 'cobranza.tasks.verificar_solvencia_estudiantil_automatica',
        'schedule': crontab(hour=0, minute=0), # Medianoche diaria
    },
}