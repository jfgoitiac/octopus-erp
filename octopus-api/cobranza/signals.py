from django.core.cache import cache
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver
from .models import BancoInstitucional, Pago
from secretaria.services import NotificadorService
from usuarios.models import LogAuditoria

CACHE_KEY_BANCOS_ACTIVOS = 'cobranza_bancos_activos'


@receiver(post_save, sender=BancoInstitucional)
@receiver(post_delete, sender=BancoInstitucional)
def invalidar_cache_bancos(sender, instance, **kwargs):
    """Invalida el cache de bancos activos (BancosListView / PortalBancosView)
    al crear, editar, (des)activar o eliminar un banco desde el panel admin."""
    cache.delete(CACHE_KEY_BANCOS_ACTIVOS)
    cache.delete(f'{CACHE_KEY_BANCOS_ACTIVOS}_portal')


@receiver(post_save, sender=Pago)
def procesar_notificacion_pago(sender, instance, created, **kwargs):
    if created:
        # 1. Enviar correo automáticamente
        NotificadorService.enviar_recibo_pago(instance)

        # 2. Registrar en auditoría para el Director
        LogAuditoria.objects.create(
            usuario=instance.usuario_receptor,
            accion="ENVIO_RECIBO_DIGITAL", # This action should be more specific, e.g., "RECIBO_ENVIADO"
            modulo="COBRANZA",
            detalles=f"Recibo #{instance.id} enviado a {instance.alumno.representante.correo}"
        )


from .models import Mensualidad

@receiver(post_save, sender=Mensualidad)
def al_crear_mensualidad(sender, instance, created, **kwargs):
    """
    Al crear una nueva mensualidad impaga, programa automáticamente
    las notificaciones de cobranza para días 0, 5, 10 y 15.
    Solo se dispara en creación (created=True) y si no está pagada.
    """
    if created and not instance.pagado:
        try:
            from portal.tasks import programar_notificaciones_mensualidad
            programar_notificaciones_mensualidad(instance.id)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(
                f'No se pudo programar notificaciones para Mensualidad {instance.id}: {e}'
            )