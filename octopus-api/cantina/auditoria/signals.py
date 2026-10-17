"""Señales de la Auditoría de Cantina."""
import logging

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from cantina.models import CierreCajaCantina, RevisionCierre

from . import tasks  # noqa: F401  registra en Celery la tarea Beat del motor de alertas

logger = logging.getLogger(__name__)


@receiver(post_save, sender=CierreCajaCantina, dispatch_uid='auditoria_cantina_crear_revision')
def crear_revision_pendiente(sender, instance, created, **kwargs):
    """Todo cierre nace con su revisión en 'pendiente' para el Director."""
    if created:
        RevisionCierre.objects.get_or_create(cierre=instance)


@receiver(post_save, sender=CierreCajaCantina, dispatch_uid='auditoria_cantina_alerta_diferencia')
def evaluar_diferencia_al_cerrar(sender, instance, created, **kwargs):
    """
    Al cerrar una caja, evalúa la regla de diferencia de caja de ESE cierre.
    Corre en `on_commit`: si el cierre se revierte no queda alerta, y un fallo
    del motor nunca rompe el cierre (la tarea horaria vuelve a evaluarlo).
    """
    if not created:
        return
    cierre_id = instance.pk

    def _evaluar():
        from .services_alertas import evaluar_diferencia_caja
        try:
            cierre = CierreCajaCantina.objects.filter(pk=cierre_id).first()
            if cierre is not None:
                evaluar_diferencia_caja(cierre)
        except Exception:
            logger.exception('No se pudo evaluar la alerta de diferencia del cierre #%s', cierre_id)

    transaction.on_commit(_evaluar)
