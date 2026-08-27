"""
Tasks de Celery propias del portal de representantes.

Las notificaciones automáticas de cobranza (día 0, recordatorios y alerta
al director) viven en `notificaciones.tasks` — ver
`programar_notificaciones_mensualidad`, `task_notificar_mora_programada` y
`revisar_y_programar_notificaciones_pendientes` en ese módulo.
"""

import logging
from celery import shared_task

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# TASK — NOTIFICACIÓN AL EQUIPO DE COBRANZA AL SUBIR COMPROBANTE
# ──────────────────────────────────────────────────────────────────────────────

@shared_task
def notificar_comprobante_subido(comprobante_id):
    """
    Notifica al equipo de cobranza que un representante subió
    un comprobante de pago pendiente de revisión.
    """
    try:
        from .models import ComprobantePago
        from django.core.mail import send_mail
        from django.conf import settings

        comprobante = ComprobantePago.objects.select_related(
            'mensualidad__alumno__representante'
        ).get(id=comprobante_id)

        alumno = comprobante.mensualidad.alumno
        representante = alumno.representante
        mensualidad = comprobante.mensualidad

        # Obtener emails de usuarios con rol cobranza, administrador o director
        from django.contrib.auth import get_user_model
        from authentication.models import PerfilUsuario
        User = get_user_model()

        emails_destino = list(
            User.objects.filter(
                perfil__rol__in=('cobranza', 'administrador', 'director'),
                perfil__esta_activo=True,
                is_active=True,
                email__isnull=False,
            ).exclude(email='').values_list('email', flat=True)
        )

        # Fallback: usar PORTAL_EMAIL_DIRECTOR si no hay emails configurados
        if not emails_destino:
            director_email = getattr(settings, 'PORTAL_EMAIL_DIRECTOR', '')
            if director_email:
                emails_destino = [director_email]

        if not emails_destino:
            logger.warning(f'No hay destinatarios para notificación de comprobante {comprobante_id}')
            return

        asunto = f'[Octopus] Comprobante de pago pendiente — {alumno.nombre} {alumno.apellido}'
        mensaje = (
            f'El representante {representante.nombre} {representante.apellido} '
            f'(Cédula: {representante.cedula}) ha subido un comprobante de pago.\n\n'
            f'Alumno: {alumno.nombre} {alumno.apellido}\n'
            f'Grado: {alumno.grado_seccion or "Sin grado"}\n'
            f'Mensualidad: {mensualidad.get_mes_display()} {mensualidad.anio}\n'
            f'Monto: ${mensualidad.monto_usd} USD\n\n'
            f'Ingrese al panel administrativo para revisar y aprobar o rechazar el comprobante.'
        )

        send_mail(
            subject=asunto,
            message=mensaje,
            from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@octopus.edu.ve'),
            recipient_list=emails_destino,
            fail_silently=False,
        )

        logger.info(f'Notificación de comprobante {comprobante_id} enviada a {emails_destino}')

    except Exception as e:
        logger.error(f'Error notificando comprobante {comprobante_id}: {e}')
