"""Lectura canónica de penalidades: una deuda por recargo, nunca por ciclo.

La imputación al menor alumno_id de todos los ciclos es estable incluso al
filtrar hermanos, sedes o páginas. No altera el principal de las mensualidades.
"""
from collections import defaultdict
from decimal import Decimal

from django.db.models import OuterRef, Q, Subquery
from django.utils import timezone

from .models import CicloCobranza, RecargoConvenio

ZERO = Decimal('0.00')


def recargo_pendiente(recargo):
    if recargo.estado == RecargoConvenio.PENDIENTE:
        return True
    return (recargo.estado == RecargoConvenio.PAGADO
            and (recargo.pago_id is None or recargo.pago.estatus != 'completado'))


def penalidades_pendientes(hoy=None):
    """Un recibo anulado/reabierto devuelve el cargo al saldo sin borrar auditoría."""
    hoy = hoy or timezone.localdate()
    ancla = (CicloCobranza.objects.filter(convenios=OuterRef('convenio_id'))
             .order_by('mensualidad__alumno_id').values('mensualidad__alumno_id')[:1])
    return (RecargoConvenio.objects.filter(fecha_programada__lte=hoy)
            .filter(Q(estado=RecargoConvenio.PENDIENTE)
                    | (Q(estado=RecargoConvenio.PAGADO)
                       & (Q(pago__isnull=True) | ~Q(pago__estatus='completado'))))
            .annotate(alumno_imputado_id=Subquery(ancla)))


def items_penalidades_convenio(*, alumno_ids=None, representante_ids=None, hoy=None):
    qs = penalidades_pendientes(hoy)
    if alumno_ids is not None:
        qs = qs.filter(alumno_imputado_id__in=list(alumno_ids))
    if representante_ids is not None:
        qs = qs.filter(convenio__representante_id__in=list(representante_ids))
    recargos = list(qs.select_related('convenio__representante').order_by('fecha_programada', 'id'))
    from secretaria.models import Alumno
    nombres = {a.id: f'{a.nombre} {a.apellido}'.strip() for a in
               Alumno.todos.filter(id__in={r.alumno_imputado_id for r in recargos})}
    return [{
        'id': r.id, 'tipo': 'recargo_convenio', 'convenio_id': r.convenio_id,
        'representante_id': r.convenio.representante_id,
        'alumno_id': r.alumno_imputado_id,
        'alumno_nombre': nombres.get(r.alumno_imputado_id),
        'concepto': f'Penalidad del convenio #{r.convenio_id}, período {r.numero_periodo}',
        'descripcion': f'Penalidad del convenio #{r.convenio_id}, período {r.numero_periodo}',
        'monto_usd': r.monto_recargo_usd,
        'saldo_pendiente_usd': r.monto_recargo_usd,
        'fecha_programada': r.fecha_programada,
    } for r in recargos]


def saldos_penalidades_por_alumno(alumno_ids, hoy=None):
    saldos = defaultdict(lambda: ZERO)
    for item in items_penalidades_convenio(alumno_ids=alumno_ids, hoy=hoy):
        saldos[item['alumno_id']] += item['monto_usd']
    return dict(saldos)
