"""
Servicios de dominio del portal de representantes.

``aprobar_comprobante`` concentra la lógica de aprobación de un
``ComprobantePago`` para que la comparta el panel administrativo
(``AdminComprobantesView.patch``) y la conciliación bancaria
(``cobranza.conciliacion_semiauto``) sin duplicarla.
"""
import logging
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from cobranza.models import Pago, TasaCambio
from .models import ComprobantePago

logger = logging.getLogger(__name__)


class ComprobanteNoEncontrado(Exception):
    pass


class ComprobanteYaProcesado(Exception):
    def __init__(self, estatus):
        super().__init__(estatus)
        self.estatus = estatus


def resolver_comprobante(comprobante_id, nuevo_estatus, usuario, observaciones=''):
    """
    Aprueba o rechaza un comprobante pendiente.

    Usa un ``atomic`` propio (anidable): toda la parte monetaria hace rollback
    si algo falla, y NO se traga las excepciones. Devuelve
    ``(comprobante, pago_creado, mensualidad, advertencias)``.
    Lanza ``ComprobanteNoEncontrado`` / ``ComprobanteYaProcesado``.

    Al APROBAR:
    - Marca la mensualidad como pagada.
    - Crea un ``Pago`` vinculado (auditoría y coherencia del sistema).
    - Acumula advertencias antifraude (referencia / hash de archivo repetidos).
    """
    advertencias = []
    mensualidad = None
    pago_creado = None

    with transaction.atomic():
        # select_for_update() bloquea la fila hasta el commit; combinado con
        # el re-chequeo de estatus de abajo, evita que dos aprobaciones
        # concurrentes del mismo comprobante (doble clic, dos admins) generen
        # doble acreditación.
        try:
            comprobante = ComprobantePago.objects.select_for_update().select_related(
                'mensualidad__alumno'
            ).get(id=comprobante_id)
        except ComprobantePago.DoesNotExist:
            raise ComprobanteNoEncontrado()

        if comprobante.estatus != 'pendiente':
            raise ComprobanteYaProcesado(comprobante.estatus)

        comprobante.estatus = nuevo_estatus
        comprobante.observaciones = observaciones
        comprobante.save()

        if nuevo_estatus == 'aprobado':
            mensualidad = comprobante.mensualidad
            alumno = mensualidad.alumno

            # --- ANTIFRAUDE: verificar referencia antes de aprobar ---
            # Filtra por la misma clave compuesta (referencia, metodo_pago,
            # banco_receptor) que el resto del sistema: método/banco distinto
            # ya no es la misma transacción. Cuando este comprobante no
            # trae banco, la alerta queda redactada como sospecha a
            # verificar (no como certeza) y compara contra otros registros
            # que tampoco tienen banco.
            referencia = comprobante.referencia_bancaria
            if referencia:
                dup_pago_qs = Pago.objects.filter(
                    referencia=referencia,
                    metodo_pago=comprobante.metodo_pago,
                    estatus__in=['completado', 'en_revision'],
                )
                dup_pago_qs = (
                    dup_pago_qs.filter(banco_receptor_id=comprobante.banco_receptor_id)
                    if comprobante.banco_receptor_id
                    else dup_pago_qs.filter(banco_receptor__isnull=True)
                )
                dup_pago = dup_pago_qs.first()
                if dup_pago:
                    if comprobante.banco_receptor_id:
                        advertencias.append(
                            f"ALERTA DE FRAUDE: La referencia '{referencia}' ya existe "
                            f"en el pago #{dup_pago.pk} (factura {dup_pago.factura_id or 'N/A'}, "
                            f"alumno: {dup_pago.alumno.nombre} {dup_pago.alumno.apellido}). "
                            "Verifique la autenticidad antes de completar la aprobación."
                        )
                    else:
                        advertencias.append(
                            f"AVISO: La referencia '{referencia}' (sin banco receptor indicado) "
                            f"coincide con el pago #{dup_pago.pk} (factura {dup_pago.factura_id or 'N/A'}, "
                            f"alumno: {dup_pago.alumno.nombre} {dup_pago.alumno.apellido}). "
                            "Verifique manualmente antes de completar la aprobación: sin banco "
                            "confirmado, esta coincidencia es solo una sospecha a revisar."
                        )

                dup_comp_qs = ComprobantePago.objects.filter(
                    referencia_bancaria=referencia,
                    metodo_pago=comprobante.metodo_pago,
                    estatus='aprobado',
                ).exclude(pk=comprobante.pk)
                dup_comp_qs = (
                    dup_comp_qs.filter(banco_receptor_id=comprobante.banco_receptor_id)
                    if comprobante.banco_receptor_id
                    else dup_comp_qs.filter(banco_receptor__isnull=True)
                )
                dup_comp = dup_comp_qs.first()
                if dup_comp:
                    if comprobante.banco_receptor_id:
                        advertencias.append(
                            f"ALERTA: La referencia '{referencia}' ya fue aprobada en el "
                            f"comprobante #{dup_comp.pk} "
                            f"({dup_comp.mensualidad.get_mes_display()} {dup_comp.mensualidad.anio}). "
                            "Posible intento de doble cobro."
                        )
                    else:
                        advertencias.append(
                            f"AVISO: La referencia '{referencia}' (sin banco receptor indicado) "
                            f"coincide con el comprobante ya aprobado #{dup_comp.pk} "
                            f"({dup_comp.mensualidad.get_mes_display()} {dup_comp.mensualidad.anio}). "
                            "Verifique manualmente: sin banco confirmado, es solo una sospecha a revisar."
                        )

            # Hash duplicado (mismo archivo aprobado antes)
            if comprobante.hash_archivo:
                dup_hash = ComprobantePago.objects.filter(
                    hash_archivo=comprobante.hash_archivo,
                    estatus='aprobado',
                ).exclude(pk=comprobante.pk).first()
                if dup_hash:
                    advertencias.append(
                        f"ALERTA: El archivo de este comprobante es idéntico al del "
                        f"comprobante #{dup_hash.pk} que ya fue aprobado "
                        f"({dup_hash.mensualidad.get_mes_display()} {dup_hash.mensualidad.anio}). "
                        "Podría ser el mismo documento presentado dos veces."
                    )

            if not mensualidad.pagado:
                mensualidad.pagado = True
                mensualidad.fecha_pago = timezone.now()
                mensualidad.save()

            # Crear registro Pago para mantener coherencia de auditoría.
            # Si algo de esto falla, la excepción sale del atomic() y
            # revierte TODO (comprobante, mensualidad.pagado incluidos).
            tasa = TasaCambio.objects.order_by('-fecha').first()
            tasa_valor = tasa.valor_bs if tasa else 1

            pago_creado = Pago.objects.create(
                alumno=alumno,
                usuario_receptor=usuario,
                metodo_pago=comprobante.metodo_pago or 'transferencia',
                banco_receptor=comprobante.banco_receptor,
                concepto='mensualidad',
                monto_usd=mensualidad.monto_usd,
                tasa_aplicada=tasa_valor,
                monto_ves=(mensualidad.monto_usd * tasa_valor).quantize(Decimal('0.01')),
                referencia=referencia or f'COMP-{comprobante.id}',
                observaciones=(
                    f'Pago aprobado desde comprobante del portal #{comprobante.id}'
                ),
                estatus='completado',
            )
            mensualidad.pagos.add(pago_creado)
            # Recalcular con el criterio canónico: aprobar un comprobante
            # de un mes no implica solvencia si debe meses anteriores.
            from cobranza.mora import sincronizar_estatus_alumno
            sincronizar_estatus_alumno(alumno)

    return comprobante, pago_creado, mensualidad, advertencias


def aprobar_comprobante(comprobante_id, usuario, observaciones=''):
    """Aprueba un comprobante pendiente. Ver ``resolver_comprobante``."""
    return resolver_comprobante(comprobante_id, 'aprobado', usuario, observaciones)


def notificar_pago_aprobado(mensualidad, pago):
    """
    Notificación al representante: best-effort, DELIBERADAMENTE fuera de la
    transacción de dinero. Si Celery/Redis está caído, el pago ya quedó
    confirmado en BD y no debe revertirse solo porque no se pudo encolar el
    aviso — se registra el fallo para revisión manual.
    """
    try:
        from notificaciones.tasks import task_notificar_pago_exitoso
        task_notificar_pago_exitoso.delay(mensualidad.id, pago.id)
    except Exception as exc:
        logger.error(
            'Pago #%s creado pero falló el encolado de la notificación '
            'al representante: %s', pago.id, exc
        )
