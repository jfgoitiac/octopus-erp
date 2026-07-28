from celery import shared_task

from .services import generar_alertas_rendimiento as _generar_alertas_rendimiento


@shared_task
def generar_alertas_rendimiento():
    """Cron diario: crea/resuelve AlertaRendimiento comparando cada Nota
    definitiva del período vigente contra el umbral aprobatorio."""
    _generar_alertas_rendimiento()
