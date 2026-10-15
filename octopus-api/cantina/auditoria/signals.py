"""Señales de la Auditoría de Cantina."""
from django.db.models.signals import post_save
from django.dispatch import receiver

from cantina.models import CierreCajaCantina, RevisionCierre


@receiver(post_save, sender=CierreCajaCantina, dispatch_uid='auditoria_cantina_crear_revision')
def crear_revision_pendiente(sender, instance, created, **kwargs):
    """Todo cierre nace con su revisión en 'pendiente' para el Director."""
    if created:
        RevisionCierre.objects.get_or_create(cierre=instance)
