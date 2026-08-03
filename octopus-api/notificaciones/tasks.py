from celery import shared_task
import logging

logger = logging.getLogger(__name__)


@shared_task
def task_notificar_mora(mensualidad_id, tipo):
    try:
        from cobranza.models import Mensualidad
        from datetime import date
        import calendar

        m = Mensualidad.objects.select_related('alumno__representante').get(id=mensualidad_id)
        dias_mora = 0
        if tipo != 'mora_dia_0':
            dia = m.alumno.dia_limite_pago or 5
            ultimo = calendar.monthrange(m.anio, m.mes)[1]
            fv = date(m.anio, m.mes, min(dia, ultimo))
            dias_mora = max(0, (date.today() - fv).days)
        from notificaciones.services import notificar_mora
        notificar_mora(m, dias_mora, tipo)
    except Exception as e:
        logger.error(f'task_notificar_mora({mensualidad_id},{tipo}): {e}')


@shared_task
def task_notificar_bienvenida(representante_id, contrasena_inicial):
    try:
        from secretaria.models import Representante
        rep = Representante.objects.get(id=representante_id)
        from notificaciones.services import notificar_bienvenida_portal
        notificar_bienvenida_portal(rep, contrasena_inicial)
    except Exception as e:
        logger.error(f'task_notificar_bienvenida({representante_id}): {e}')


@shared_task
def task_notificar_pago_exitoso(mensualidad_id, pago_id):
    try:
        from cobranza.models import Mensualidad, Pago
        m = Mensualidad.objects.select_related('alumno__representante').get(id=mensualidad_id)
        p = Pago.objects.get(id=pago_id)
        from notificaciones.services import notificar_pago_exitoso
        notificar_pago_exitoso(m, p)
    except Exception as e:
        logger.error(f'task_notificar_pago_exitoso({mensualidad_id},{pago_id}): {e}')


@shared_task
def task_notificar_comprobante_inscripcion(inscripcion_id):
    try:
        from secretaria.models import Inscripcion
        inscripcion = Inscripcion.objects.select_related('alumno__representante').get(id=inscripcion_id)
        from notificaciones.services import notificar_comprobante_inscripcion
        notificar_comprobante_inscripcion(inscripcion)
    except Exception as e:
        logger.error(f'task_notificar_comprobante_inscripcion({inscripcion_id}): {e}')


@shared_task
def task_notificar_circular_nueva(circular_id):
    try:
        from comunicacion.models import Circular
        circular = Circular.objects.get(id=circular_id)
        from notificaciones.services import notificar_circular_nueva
        notificar_circular_nueva(circular)
    except Exception as e:
        logger.error(f'task_notificar_circular_nueva({circular_id}): {e}')


@shared_task
def task_enviar_push(suscripcion_id, titulo, cuerpo, url='/portal'):
    """Envia un push puntual a una suscripcion (ej. notificacion de prueba
    al activar, o reintentos disparados fuera de los eventos de negocio)."""
    try:
        from notificaciones.models import SuscripcionPush
        suscripcion = SuscripcionPush.objects.get(id=suscripcion_id)
        from notificaciones.services import enviar_push
        enviar_push(suscripcion, titulo, cuerpo, url=url, tipo='prueba')
    except Exception as e:
        logger.error(f'task_enviar_push({suscripcion_id}): {e}')


@shared_task
def task_notificar_mensaje_nuevo(mensaje_id):
    try:
        from comunicacion.models import MensajeDirecto
        mensaje = MensajeDirecto.objects.select_related(
            'alumno', 'remitente_docente', 'remitente_representante__representante',
            'destinatario_docente', 'destinatario_representante__representante',
        ).get(id=mensaje_id)
        from notificaciones.services import notificar_mensaje_directo
        notificar_mensaje_directo(mensaje)
    except Exception as e:
        logger.error(f'task_notificar_mensaje_nuevo({mensaje_id}): {e}')
