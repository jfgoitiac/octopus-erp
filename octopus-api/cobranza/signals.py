from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Pago
from secretaria.services import NotificadorService
from usuarios.models import LogAuditoria

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