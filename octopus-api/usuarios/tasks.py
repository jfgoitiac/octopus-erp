import logging

from celery import shared_task

from .backup import ejecutar_respaldo_externo

logger = logging.getLogger(__name__)


@shared_task
def respaldo_diario_automatico():
    """
    Genera el respaldo completo diario (PostgreSQL + media), lo conserva
    localmente con rotación y lo carga a Google Drive. Las fallas se relanzan
    para que Celery Beat/monitorización las registre y se notifica por correo
    sin adjuntar archivos.
    """
    return ejecutar_respaldo_externo()
