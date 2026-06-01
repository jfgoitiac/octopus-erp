"""
Tasks de Celery para las notificaciones automáticas de cobranza del portal.

Flujo por mensualidad impaga:
  Día  0 → email al generar la factura
  Día  5 → primer recordatorio al representante
  Día 10 → segundo aviso al representante
  Día 15 → alerta al director del colegio

TODO (WhatsApp — fase futura):
  Cada task tiene un bloque marcado con "TODO WHATSAPP" listo para conectar
  Twilio (twilio.rest.Client) o Meta Business Cloud API (requests + Graph API).
  Solo hay que añadir las credenciales en settings y descomentar el bloque.
"""

import logging
from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# HELPERS INTERNOS
# ──────────────────────────────────────────────────────────────────────────────

def _get_mensualidad(mensualidad_id):
    """Obtiene la mensualidad con sus relaciones necesarias para las notificaciones."""
    from cobranza.models import Mensualidad
    return (
        Mensualidad.objects
        .select_related('alumno__representante')
        .get(id=mensualidad_id)
    )


def _enviar_email_representante(representante, asunto, cuerpo):
    """Envía email al representante. Silencia errores para no detener el flujo."""
    if not representante.correo:
        logger.warning(
            f"Representante {representante.cedula} no tiene correo configurado. "
            "Se omite el envío."
        )
        return

    try:
        send_mail(
            subject=asunto,
            message=cuerpo,
            from_email=getattr(settings, 'PORTAL_EMAIL_FROM', settings.DEFAULT_FROM_EMAIL),
            recipient_list=[representante.correo],
            fail_silently=False,
        )
        logger.info(f"Email enviado a {representante.correo} — Asunto: {asunto}")
    except Exception as exc:
        logger.error(f"Error al enviar email a {representante.correo}: {exc}")


def _enviar_email_director(asunto, cuerpo):
    """Envía email al correo del director configurado en settings."""
    correo_director = getattr(settings, 'PORTAL_EMAIL_DIRECTOR', None)
    if not correo_director:
        logger.warning(
            "PORTAL_EMAIL_DIRECTOR no está configurado en settings. "
            "No se puede enviar alerta al director."
        )
        return

    try:
        send_mail(
            subject=asunto,
            message=cuerpo,
            from_email=getattr(settings, 'PORTAL_EMAIL_FROM', settings.DEFAULT_FROM_EMAIL),
            recipient_list=[correo_director],
            fail_silently=False,
        )
        logger.info(f"Alerta enviada al director ({correo_director}) — Asunto: {asunto}")
    except Exception as exc:
        logger.error(f"Error al enviar alerta al director: {exc}")


# ──────────────────────────────────────────────────────────────────────────────
# TASK DÍA 0 — NOTIFICACIÓN DE FACTURA GENERADA
# ──────────────────────────────────────────────────────────────────────────────

@shared_task(bind=True, max_retries=3, default_retry_delay=300)
def enviar_notificacion_dia_0(self, mensualidad_id):
    """
    Se ejecuta al generar una mensualidad nueva.
    Notifica al representante que la factura ya está disponible.
    """
    try:
        mensualidad = _get_mensualidad(mensualidad_id)
        if mensualidad.pagado:
            logger.info(f"Mensualidad {mensualidad_id} ya pagada. Se omite notificación día 0.")
            return

        alumno = mensualidad.alumno
        representante = alumno.representante
        mes_nombre = mensualidad.get_mes_display()

        asunto = f"Factura de {mes_nombre} {mensualidad.anio} disponible — {alumno.nombre} {alumno.apellido}"
        cuerpo = (
            f"Estimado/a {representante.nombre} {representante.apellido},\n\n"
            f"Le informamos que la mensualidad de {mes_nombre} {mensualidad.anio} "
            f"para {alumno.nombre} {alumno.apellido} ({alumno.grado_seccion}) "
            f"ya está disponible por un monto de ${mensualidad.monto_usd} USD.\n\n"
            f"Puede realizar su pago a través del portal o comunicarse con administración.\n\n"
            f"Gracias por su preferencia."
        )

        _enviar_email_representante(representante, asunto, cuerpo)

        # ── TODO WHATSAPP (DÍA 0) ──────────────────────────────────────────
        # from twilio.rest import Client
        # client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        # client.messages.create(
        #     from_=f"whatsapp:{settings.TWILIO_WHATSAPP_NUMBER}",
        #     to=f"whatsapp:+58{representante.telefono}",
        #     body=f"Hola {representante.nombre}, su factura de {mes_nombre} está lista. Monto: ${mensualidad.monto_usd}"
        # )
        # ── FIN TODO WHATSAPP ──────────────────────────────────────────────

    except Exception as exc:
        logger.error(f"Error en enviar_notificacion_dia_0 (mensualidad {mensualidad_id}): {exc}")
        raise self.retry(exc=exc)


# ──────────────────────────────────────────────────────────────────────────────
# TASK DÍA 5 — PRIMER RECORDATORIO
# ──────────────────────────────────────────────────────────────────────────────

@shared_task(bind=True, max_retries=3, default_retry_delay=300)
def enviar_notificacion_dia_5(self, mensualidad_id):
    """
    Primer recordatorio de pago. Se programa 5 días después de generar la factura.
    """
    try:
        mensualidad = _get_mensualidad(mensualidad_id)
        if mensualidad.pagado:
            logger.info(f"Mensualidad {mensualidad_id} ya pagada. Se omite recordatorio día 5.")
            return

        alumno = mensualidad.alumno
        representante = alumno.representante
        mes_nombre = mensualidad.get_mes_display()

        asunto = f"Recordatorio: Mensualidad de {mes_nombre} pendiente — {alumno.nombre} {alumno.apellido}"
        cuerpo = (
            f"Estimado/a {representante.nombre} {representante.apellido},\n\n"
            f"Le recordamos que la mensualidad de {mes_nombre} {mensualidad.anio} "
            f"de {alumno.nombre} {alumno.apellido} aún no ha sido cancelada.\n\n"
            f"Monto: ${mensualidad.monto_usd} USD\n\n"
            f"Por favor, realice su pago a la brevedad posible para evitar recargos.\n\n"
            f"Atentamente, Administración."
        )

        _enviar_email_representante(representante, asunto, cuerpo)

        # ── TODO WHATSAPP (DÍA 5) ──────────────────────────────────────────
        # from twilio.rest import Client
        # client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        # client.messages.create(
        #     from_=f"whatsapp:{settings.TWILIO_WHATSAPP_NUMBER}",
        #     to=f"whatsapp:+58{representante.telefono}",
        #     body=f"Recordatorio: La mensualidad de {mes_nombre} de {alumno.nombre} está pendiente. Monto: ${mensualidad.monto_usd}"
        # )
        # ── FIN TODO WHATSAPP ──────────────────────────────────────────────

    except Exception as exc:
        logger.error(f"Error en enviar_notificacion_dia_5 (mensualidad {mensualidad_id}): {exc}")
        raise self.retry(exc=exc)


# ──────────────────────────────────────────────────────────────────────────────
# TASK DÍA 10 — SEGUNDO AVISO
# ──────────────────────────────────────────────────────────────────────────────

@shared_task(bind=True, max_retries=3, default_retry_delay=300)
def enviar_notificacion_dia_10(self, mensualidad_id):
    """
    Segundo aviso de pago con tono más urgente. 10 días después de la factura.
    """
    try:
        mensualidad = _get_mensualidad(mensualidad_id)
        if mensualidad.pagado:
            logger.info(f"Mensualidad {mensualidad_id} ya pagada. Se omite segundo aviso día 10.")
            return

        alumno = mensualidad.alumno
        representante = alumno.representante
        mes_nombre = mensualidad.get_mes_display()

        asunto = f"AVISO IMPORTANTE: Mensualidad de {mes_nombre} vencida — {alumno.nombre} {alumno.apellido}"
        cuerpo = (
            f"Estimado/a {representante.nombre} {representante.apellido},\n\n"
            f"AVISO IMPORTANTE: La mensualidad de {mes_nombre} {mensualidad.anio} "
            f"correspondiente a {alumno.nombre} {alumno.apellido} lleva 10 días sin ser cancelada.\n\n"
            f"Monto adeudado: ${mensualidad.monto_usd} USD\n\n"
            f"Le solicitamos regularizar su situación a la brevedad posible para evitar "
            f"que se restrinja el acceso a servicios escolares.\n\n"
            f"Puede cancelar a través del portal o comunicarse con administración.\n\n"
            f"Atentamente, Administración."
        )

        _enviar_email_representante(representante, asunto, cuerpo)

        # ── TODO WHATSAPP (DÍA 10) ─────────────────────────────────────────
        # from twilio.rest import Client
        # client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        # client.messages.create(
        #     from_=f"whatsapp:{settings.TWILIO_WHATSAPP_NUMBER}",
        #     to=f"whatsapp:+58{representante.telefono}",
        #     body=f"AVISO: La mensualidad de {mes_nombre} de {alumno.nombre} lleva 10 días sin pagar. Monto: ${mensualidad.monto_usd}"
        # )
        # ── FIN TODO WHATSAPP ──────────────────────────────────────────────

    except Exception as exc:
        logger.error(f"Error en enviar_notificacion_dia_10 (mensualidad {mensualidad_id}): {exc}")
        raise self.retry(exc=exc)


# ──────────────────────────────────────────────────────────────────────────────
# TASK DÍA 15 — ALERTA AL DIRECTOR
# ──────────────────────────────────────────────────────────────────────────────

@shared_task(bind=True, max_retries=3, default_retry_delay=300)
def enviar_notificacion_dia_15(self, mensualidad_id):
    """
    Alerta al director del colegio sobre mensualidad sin pagar a 15 días.
    También envía un último aviso al representante.
    """
    try:
        mensualidad = _get_mensualidad(mensualidad_id)
        if mensualidad.pagado:
            logger.info(f"Mensualidad {mensualidad_id} ya pagada. Se omite alerta día 15.")
            return

        alumno = mensualidad.alumno
        representante = alumno.representante
        mes_nombre = mensualidad.get_mes_display()

        # Email al representante — último aviso
        asunto_rep = f"ÚLTIMO AVISO: Mensualidad de {mes_nombre} en mora — {alumno.nombre} {alumno.apellido}"
        cuerpo_rep = (
            f"Estimado/a {representante.nombre} {representante.apellido},\n\n"
            f"Este es el ÚLTIMO AVISO. La mensualidad de {mes_nombre} {mensualidad.anio} "
            f"de {alumno.nombre} {alumno.apellido} lleva 15 días sin ser cancelada.\n\n"
            f"Monto adeudado: ${mensualidad.monto_usd} USD\n\n"
            f"Se ha notificado a la dirección del plantel. Por favor, comuníquese con "
            f"administración a la brevedad posible.\n\n"
            f"Atentamente, Administración."
        )
        _enviar_email_representante(representante, asunto_rep, cuerpo_rep)

        # Email al director — alerta de mora
        asunto_dir = f"ALERTA MORA 15 días: {alumno.nombre} {alumno.apellido} — {mes_nombre} {mensualidad.anio}"
        cuerpo_dir = (
            f"Estimado/a Director/a,\n\n"
            f"Se le notifica que el alumno {alumno.nombre} {alumno.apellido} "
            f"({alumno.grado_seccion}) tiene la mensualidad de {mes_nombre} {mensualidad.anio} "
            f"sin cancelar luego de 15 días.\n\n"
            f"Datos del representante:\n"
            f"  Nombre: {representante.nombre} {representante.apellido}\n"
            f"  Cédula: {representante.cedula}\n"
            f"  Teléfono: {representante.telefono}\n"
            f"  Correo: {representante.correo}\n\n"
            f"Monto adeudado: ${mensualidad.monto_usd} USD\n\n"
            f"Se recomienda contactar directamente al representante."
        )
        _enviar_email_director(asunto_dir, cuerpo_dir)

        # ── TODO WHATSAPP (DÍA 15) ─────────────────────────────────────────
        # Notificar al representante:
        # from twilio.rest import Client
        # client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        # client.messages.create(
        #     from_=f"whatsapp:{settings.TWILIO_WHATSAPP_NUMBER}",
        #     to=f"whatsapp:+58{representante.telefono}",
        #     body=f"ÚLTIMO AVISO: La mensualidad de {mes_nombre} lleva 15 días sin pagar. Se ha notificado a dirección."
        # )
        # Notificar al director (si tiene WhatsApp registrado):
        # director_telefono = getattr(settings, 'PORTAL_DIRECTOR_WHATSAPP', None)
        # if director_telefono:
        #     client.messages.create(
        #         from_=f"whatsapp:{settings.TWILIO_WHATSAPP_NUMBER}",
        #         to=f"whatsapp:{director_telefono}",
        #         body=f"ALERTA MORA: {alumno.nombre} {alumno.apellido} - {mes_nombre} ${mensualidad.monto_usd} - Rep: {representante.telefono}"
        #     )
        # ── FIN TODO WHATSAPP ──────────────────────────────────────────────

    except Exception as exc:
        logger.error(f"Error en enviar_notificacion_dia_15 (mensualidad {mensualidad_id}): {exc}")
        raise self.retry(exc=exc)


# ──────────────────────────────────────────────────────────────────────────────
# PROGRAMADOR DE NOTIFICACIONES
# ──────────────────────────────────────────────────────────────────────────────

def programar_notificaciones_mensualidad(mensualidad_id):
    """
    Programa las 4 notificaciones automáticas para una mensualidad recién creada.
    Llamar desde la señal post_save de Mensualidad o desde la vista de generación.

    Uso:
        from portal.tasks import programar_notificaciones_mensualidad
        programar_notificaciones_mensualidad(mensualidad.id)
    """
    SEGUNDOS_POR_DIA = 86_400  # 60 * 60 * 24

    # Día 0: inmediato
    enviar_notificacion_dia_0.apply_async(
        args=[mensualidad_id],
        countdown=0,
    )

    # Día 5: 5 días después
    enviar_notificacion_dia_5.apply_async(
        args=[mensualidad_id],
        countdown=5 * SEGUNDOS_POR_DIA,
    )

    # Día 10: 10 días después
    enviar_notificacion_dia_10.apply_async(
        args=[mensualidad_id],
        countdown=10 * SEGUNDOS_POR_DIA,
    )

    # Día 15: 15 días después
    enviar_notificacion_dia_15.apply_async(
        args=[mensualidad_id],
        countdown=15 * SEGUNDOS_POR_DIA,
    )

    logger.info(
        f"Notificaciones de cobranza programadas para mensualidad {mensualidad_id} "
        f"(días 0, 5, 10, 15)."
    )


# ──────────────────────────────────────────────────────────────────────────────
# TASK PERIÓDICA — CELERY BEAT (corre cada día a las 8am)
# ──────────────────────────────────────────────────────────────────────────────

@shared_task(name='portal.tasks.revisar_y_programar_notificaciones_pendientes')
def revisar_y_programar_notificaciones_pendientes():
    """
    Task periódica (Celery Beat la corre cada día a las 8am).
    Busca todas las mensualidades impagas y dispara la notificación
    correspondiente según los días transcurridos desde el vencimiento.

    Casos que maneja:
    - Día  0: mensualidad recién vencida (hoy == fecha_vencimiento)
    - Día  5: primer recordatorio
    - Día 10: segundo aviso
    - Día 15: alerta al director
    """
    import calendar
    from datetime import date
    from cobranza.models import Mensualidad

    hoy = date.today()
    procesadas = 0

    # Buscar mensualidades impagas de alumnos activos
    mensualidades = Mensualidad.objects.filter(
        pagado=False,
        alumno__activo=True,
    ).select_related('alumno__representante')

    for mensualidad in mensualidades:
        # Calcular fecha de vencimiento usando dia_limite_pago del alumno (default 5)
        dia_limite = getattr(mensualidad.alumno, 'dia_limite_pago', None) or 5
        ultimo_dia = calendar.monthrange(mensualidad.anio, mensualidad.mes)[1]
        dia_real = min(dia_limite, ultimo_dia)

        try:
            fecha_vencimiento = date(mensualidad.anio, mensualidad.mes, dia_real)
        except ValueError:
            logger.warning(
                f"Fecha de vencimiento inválida para mensualidad {mensualidad.id} "
                f"({mensualidad.anio}-{mensualidad.mes}-{dia_real}). Se omite."
            )
            continue

        dias_vencida = (hoy - fecha_vencimiento).days

        if dias_vencida == 0:
            enviar_notificacion_dia_0.delay(mensualidad.id)
            procesadas += 1
        elif dias_vencida == 5:
            enviar_notificacion_dia_5.delay(mensualidad.id)
            procesadas += 1
        elif dias_vencida == 10:
            enviar_notificacion_dia_10.delay(mensualidad.id)
            procesadas += 1
        elif dias_vencida == 15:
            enviar_notificacion_dia_15.delay(mensualidad.id)
            procesadas += 1

    logger.info(f"[Beat] revisar_y_programar_notificaciones_pendientes: {procesadas} notificaciones disparadas.")
    return f'Notificaciones programadas: {procesadas}'


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
            fail_silently=True,
        )

        logger.info(f'Notificación de comprobante {comprobante_id} enviada a {emails_destino}')

    except Exception as e:
        logger.error(f'Error notificando comprobante {comprobante_id}: {e}')
