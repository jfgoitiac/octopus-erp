from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import RegistroNomina
from usuarios.models import LogAuditoria

@receiver(post_save, sender=RegistroNomina)
def auditar_pago_nomina(sender, instance, created, **kwargs):
    if created:
        LogAuditoria.objects.create(
            accion="GENERACION_NOMINA",
            modulo="NOMINA",
            detalles=f"Se generó pago para el empleado {instance.empleado.cedula} por {instance.total_pagar_ves} VES"
        )