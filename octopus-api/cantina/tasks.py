"""
Tareas Celery de cantina (Fase 6 — §5.5 de cantina.md):
- notificación de recarga aprobada (disparada desde AprobarRecargaView)
- verificación diaria de tarjetas en saldo negativo sostenido

Toda tarea de notificación va envuelta en try/except + logger.exception para
que un fallo de envío (SMTP caído, template roto, etc.) nunca rompa la vista
que la dispara ni tumbe el worker — mismo criterio que notificaciones/tasks.py
y cobranza/tasks.py.
"""
from celery import shared_task
import logging

logger = logging.getLogger(__name__)


@shared_task
def task_notificar_recarga_aprobada(recarga_id):
    from cantina.models import RecargaTarjeta
    from cantina.notificaciones_cantina import notificar_recarga_aprobada
    try:
        recarga = RecargaTarjeta.objects.select_related('tarjeta__alumno__representante').get(id=recarga_id)
        notificar_recarga_aprobada(recarga)
    except Exception:
        logger.exception('Error notificando recarga aprobada id=%s', recarga_id)


@shared_task
def verificar_saldos_negativos_cantina():
    """Recorre tarjetas en negativo y notifica según ParametroCantina.dias_alerta_saldo_negativo.

    Cada tarjeta se evalúa en su propio try/except: una tarjeta con datos
    corruptos (saldo_negativo_desde inconsistente, etc.) no debe abortar el
    resto del batch — mejora sobre el pseudocódigo de §5.5.
    """
    from cantina.models import TarjetaPrepago, ParametroCantina
    from cantina.mora_cantina import dias_en_negativo, debe_notificarse_hoy, parsear_dias_configurados
    from cantina.notificaciones_cantina import notificar_saldo_negativo

    parametros = ParametroCantina.objects.first()
    dias_config = parsear_dias_configurados(parametros.dias_alerta_saldo_negativo if parametros else '1,3,7')

    tarjetas = TarjetaPrepago.objects.filter(
        saldo__lt=0, saldo_negativo_desde__isnull=False,
    ).select_related('alumno__representante')

    for tarjeta in tarjetas:
        try:
            dias = dias_en_negativo(tarjeta)
            if debe_notificarse_hoy(tarjeta, dias_config):
                notificar_saldo_negativo(tarjeta, dias)
        except Exception:
            logger.exception('Error notificando saldo negativo tarjeta id=%s', tarjeta.id)
