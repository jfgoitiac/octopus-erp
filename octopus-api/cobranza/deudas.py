"""Fuente de verdad para el desglose de deudas y abonos de cobranza.

Las cuotas conservan ``monto_pagado`` como acumulado; las aplicaciones
persisten el origen de cada abono. Los consumidores nunca deben volver a
inferir un saldo desde el importe nominal de una relación M2M.
"""
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.db.models import Q

from .models import AplicacionPago, CuotaInscripcion, CuotaProyectoInversion, CuotaSolvencia, Mensualidad

ZERO = Decimal('0.00')


def saldo_deuda(deuda):
    """Saldo no negativo de cualquier cuota compatible con monto_pagado."""
    return max(ZERO, (deuda.monto_usd or ZERO) - (deuda.monto_pagado or ZERO))


def estado_deuda(deuda):
    saldo = saldo_deuda(deuda)
    if saldo == ZERO:
        return 'saldada'
    if (deuda.monto_pagado or ZERO) > ZERO:
        return 'parcial'
    return 'pendiente'


def item_deuda(deuda, *, tipo=None, descripcion=None, alumno_nombre=None):
    """Contrato estable para recibos, APIs y avisos de cobro."""
    nominal = deuda.monto_usd or ZERO
    pagado = deuda.monto_pagado or ZERO
    return {
        'id': deuda.id,
        'tipo': tipo or _tipo_deuda(deuda),
        'descripcion': descripcion or _descripcion(deuda),
        'alumno': alumno_nombre or _alumno_nombre(deuda),
        'monto_nominal_usd': nominal.quantize(Decimal('0.01')),
        'monto_pagado_usd': pagado.quantize(Decimal('0.01')),
        'saldo_pendiente_usd': saldo_deuda(deuda).quantize(Decimal('0.01')),
        'estado': estado_deuda(deuda),
    }


def _tipo_deuda(deuda):
    if isinstance(deuda, Mensualidad):
        return 'mensualidad'
    if isinstance(deuda, CuotaInscripcion):
        return 'inscripcion'
    if isinstance(deuda, CuotaSolvencia):
        return 'solvencia'
    if isinstance(deuda, CuotaProyectoInversion):
        return 'proyecto_inversion'
    return deuda._meta.model_name


def _descripcion(deuda):
    if isinstance(deuda, Mensualidad):
        return f'{deuda.get_mes_display()} {deuda.anio}'
    if isinstance(deuda, CuotaInscripcion):
        return f'Inscripción {deuda.periodo_escolar}'
    if isinstance(deuda, CuotaSolvencia):
        return deuda.concepto or f'Solvencia {deuda.periodo_escolar}'
    if isinstance(deuda, CuotaProyectoInversion):
        return f'{deuda.tipo_concepto.nombre} {deuda.periodo_escolar}'
    return str(deuda)


def _alumno_nombre(deuda):
    if hasattr(deuda, 'alumno'):
        return f'{deuda.alumno.nombre} {deuda.alumno.apellido}'.strip()
    if hasattr(deuda, 'representante'):
        return f'{deuda.representante.nombre} {deuda.representante.apellido}'.strip()
    return ''


def registrar_aplicacion(pago, deuda, monto_abonado, monto_ajuste=ZERO):
    """Guarda la aplicación exacta de un pago, una sola vez por deuda.

    El caller mantiene el bloqueo ``select_for_update`` sobre la deuda. La
    restricción única protege además los reintentos de la misma operación.
    """
    monto_abonado = Decimal(str(monto_abonado or ZERO)).quantize(Decimal('0.01'))
    monto_ajuste = Decimal(str(monto_ajuste or ZERO)).quantize(Decimal('0.01'))
    if monto_abonado < ZERO or monto_ajuste < ZERO:
        raise ValueError('Una aplicación no puede tener montos negativos.')
    return AplicacionPago.objects.create(
        pago=pago,
        content_type=ContentType.objects.get_for_model(deuda, for_concrete_model=False),
        object_id=deuda.pk,
        monto_nominal_usd=(deuda.monto_usd or ZERO).quantize(Decimal('0.01')),
        monto_abonado_usd=monto_abonado,
        monto_ajuste_usd=monto_ajuste,
        saldo_resultante_usd=saldo_deuda(deuda).quantize(Decimal('0.01')),
    )


def aplicaciones_operacion(pago):
    """Aplicaciones del recibo/operación, incluso si se recibe un pago hermano."""
    principal = (
        pago.__class__.objects.filter(operacion_uuid=pago.operacion_uuid).order_by('id').first()
        if pago and pago.operacion_uuid else pago
    )
    if not principal:
        return []
    return list(AplicacionPago.objects.filter(
        pago=principal, anulada_en__isnull=True
    ).select_related('content_type').order_by('id'))


def revertir_aplicaciones_pago(pago, cuando):
    """Revierte exactamente los abonos de una operación anulada.

    Las aplicaciones se conservan marcadas como anuladas para auditoría. Esto
    sustituye el antiguo ``monto_pagado = 0`` que borraba abonos posteriores.
    """
    aplicaciones = list(AplicacionPago.objects.select_for_update().filter(
        pago=pago, anulada_en__isnull=True
    ).select_related('content_type'))
    for aplicacion in aplicaciones:
        modelo = aplicacion.content_type.model_class()
        deuda = modelo.objects.select_for_update().get(pk=aplicacion.object_id)
        reversion = aplicacion.monto_abonado_usd + aplicacion.monto_ajuste_usd
        deuda.monto_pagado = max(ZERO, deuda.monto_pagado - reversion)
        # Mensualidad y las cuotas derivan pagado/fecha_pago en save().
        # Dos modelos conservan compatibilidad para ``pagado=True`` legado;
        # al revertir hay que declarar explícitamente que no es ese caso.
        deuda.pagado = False
        deuda.save()
        aplicacion.anulada_en = cuando
        aplicacion.save(update_fields=['anulada_en'])
    return aplicaciones


def deudas_pendientes_alumno(alumno, hoy=None):
    """Items pendientes, con nominal, abonos acumulados y saldo real."""
    from datetime import date
    hoy = hoy or date.today()
    mensualidades = Mensualidad.objects.filter(alumno=alumno, pagado=False).filter(
        Q(anio__lt=hoy.year) | Q(anio=hoy.year, mes__lte=hoy.month)
    ).select_related('alumno').order_by('anio', 'mes')
    items = [item_deuda(m) for m in mensualidades]
    items += [item_deuda(c) for c in CuotaInscripcion.objects.filter(alumno=alumno, pagado=False).select_related('alumno')]
    items += [item_deuda(c) for c in CuotaSolvencia.objects.filter(alumno=alumno, pagado=False, monto_usd__gt=0).select_related('alumno')]
    if alumno.representante_id:
        items += [item_deuda(c) for c in CuotaProyectoInversion.objects.filter(
            representante=alumno.representante, pagado=False
        ).select_related('representante', 'tipo_concepto')]
    return items
