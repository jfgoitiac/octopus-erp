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


# ──────────────────────────────────────────────────────────────────────────────
# PROGRAMACIÓN DE LOS AVISOS DE MORA (día 0, recordatorios y alerta al director)
#
# Cronograma configurable en `notificaciones.ConfiguracionNotificaciones`
# (día 0 es fijo, el resto se lee de `_dias_recordatorio()`). El envío real
# (plantilla HTML, log en NotificacionLog y WhatsApp) lo hace task_notificar_mora
# de arriba; estas tasks solo deciden CUÁNDO disparar cada aviso.
# ──────────────────────────────────────────────────────────────────────────────

def _dias_recordatorio():
    """Lee el cronograma configurable de recordatorios de mora (día 0 es fijo)."""
    from notificaciones.models import ConfiguracionNotificaciones
    cfg, _ = ConfiguracionNotificaciones.objects.get_or_create(pk=1)
    return cfg.dias_recordatorio_1, cfg.dias_recordatorio_2, cfg.dias_alerta_director


@shared_task(bind=True, max_retries=3, default_retry_delay=300)
def task_notificar_mora_programada(self, mensualidad_id, tipo):
    """Verifica que la mensualidad siga impaga antes de delegar el envío en
    task_notificar_mora — evita avisar de una mora ya saldada."""
    try:
        from cobranza.models import Mensualidad
        m = Mensualidad.objects.select_related('alumno__representante').get(id=mensualidad_id)
        if m.pagado:
            logger.info(f"Mensualidad {mensualidad_id} ya pagada. Se omite notificación {tipo}.")
            return
        task_notificar_mora(mensualidad_id, tipo)
    except Exception as exc:
        logger.error(f"Error en task_notificar_mora_programada ({mensualidad_id}, {tipo}): {exc}")
        raise self.retry(exc=exc)


def programar_notificaciones_mensualidad(mensualidad_id):
    """
    Programa los 4 avisos automáticos de mora para una mensualidad recién creada.
    Llamar desde la señal post_save de Mensualidad o desde la vista de generación.

    Uso:
        from notificaciones.tasks import programar_notificaciones_mensualidad
        programar_notificaciones_mensualidad(mensualidad.id)
    """
    SEGUNDOS_POR_DIA = 86_400  # 60 * 60 * 24
    dias_r1, dias_r2, dias_dir = _dias_recordatorio()

    # Día 0: inmediato
    task_notificar_mora_programada.apply_async(
        args=[mensualidad_id, 'mora_dia_0'],
        countdown=0,
    )

    task_notificar_mora_programada.apply_async(
        args=[mensualidad_id, 'mora_dia_5'],
        countdown=dias_r1 * SEGUNDOS_POR_DIA,
    )

    task_notificar_mora_programada.apply_async(
        args=[mensualidad_id, 'mora_dia_10'],
        countdown=dias_r2 * SEGUNDOS_POR_DIA,
    )

    task_notificar_mora_programada.apply_async(
        args=[mensualidad_id, 'mora_dia_15'],
        countdown=dias_dir * SEGUNDOS_POR_DIA,
    )

    logger.info(
        f"Notificaciones de mora programadas para mensualidad {mensualidad_id} "
        f"(días 0, {dias_r1}, {dias_r2}, {dias_dir})."
    )


@shared_task(name='notificaciones.tasks.revisar_y_programar_notificaciones_pendientes')
def revisar_y_programar_notificaciones_pendientes():
    """
    Task periódica (Celery Beat la corre cada día a las 8am).
    Busca todas las mensualidades impagas y dispara la notificación
    correspondiente según los días transcurridos desde el vencimiento y el
    cronograma configurable en ConfiguracionNotificaciones.

    Casos que maneja:
    - Día 0: mensualidad recién vencida (hoy == fecha_vencimiento)
    - dias_recordatorio_1: primer recordatorio
    - dias_recordatorio_2: segundo aviso
    - dias_alerta_director: alerta al director
    """
    import calendar
    from datetime import date
    from cobranza.models import Mensualidad

    hoy = date.today()
    procesadas = 0
    dias_r1, dias_r2, dias_dir = _dias_recordatorio()

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
            task_notificar_mora_programada.delay(mensualidad.id, 'mora_dia_0')
            procesadas += 1
        elif dias_vencida == dias_r1:
            task_notificar_mora_programada.delay(mensualidad.id, 'mora_dia_5')
            procesadas += 1
        elif dias_vencida == dias_r2:
            task_notificar_mora_programada.delay(mensualidad.id, 'mora_dia_10')
            procesadas += 1
        elif dias_vencida == dias_dir:
            task_notificar_mora_programada.delay(mensualidad.id, 'mora_dia_15')
            procesadas += 1

    logger.info(f"[Beat] revisar_y_programar_notificaciones_pendientes: {procesadas} notificaciones disparadas.")
    return f'Notificaciones programadas: {procesadas}'


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
