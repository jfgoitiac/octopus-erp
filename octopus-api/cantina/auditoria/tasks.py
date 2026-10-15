"""
Tareas Celery de la Auditoría de Cantina — carril B4 (Fase 2).

`cantina.auditoria` no es una app de Django, así que `autodiscover_tasks()`
no encuentra este módulo por sí solo: lo importa `auditoria/signals.py`
(cargado en `CantinaConfig.ready()`), lo que registra la tarea tanto en el
worker como en el proceso web. El nombre es explícito para que la entrada de
`CELERY_BEAT_SCHEDULE` no dependa de la ruta del módulo.
"""
import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name='cantina.auditoria.tasks.evaluar_alertas_auditoria_cantina')
def evaluar_alertas_auditoria_cantina(fecha=None):
    """Corre el motor de alertas para `fecha` (YYYY-MM-DD; hoy si se omite)."""
    from .services_alertas import evaluar_alertas

    resumen = evaluar_alertas(fecha)
    logger.info('Alertas de auditoría de cantina evaluadas: %s', resumen)
    return resumen
