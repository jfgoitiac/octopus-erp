"""Consultas agregadas usadas por el tablero y los informes de egresos.

Los importes devueltos son snapshots ``Decimal``; nunca se recalculan con la
tasa actual.  Este módulo deliberadamente no conoce los modelos de CxP.
"""
from datetime import date
from decimal import Decimal

from django.db.models import DecimalField, Exists, OuterRef, Sum, Value
from django.db.models.functions import Coalesce, TruncMonth

from .models import ComprobanteEgreso, Egreso

ZERO = Value(Decimal('0.00'), output_field=DecimalField(max_digits=14, decimal_places=2))


def sumar(*campos):
    """Agregados monetarios consistentes, incluso cuando no haya filas."""
    return {campo: Coalesce(Sum(campo), ZERO) for campo in campos}


def egresos_pagados(usuario, sede=None, desde=None, hasta=None):
    """Egresos que representan gasto real (nunca borradores, pendientes ni anulados)."""
    from cobranza.permissions import filtrar_por_sede

    qs = Egreso.objects.filter(estado='registrado').select_related('proveedor', 'categoria', 'sede')
    qs = filtrar_por_sede(usuario, qs, campo='sede')
    if sede:
        qs = qs.filter(sede_id=sede)
    if desde:
        qs = qs.filter(fecha_egreso__gte=desde)
    if hasta:
        qs = qs.filter(fecha_egreso__lte=hasta)
    return qs


def egresos_libro_compras(usuario, sede=None, desde=None, hasta=None):
    """Documentos fiscales: incluyen pendientes y registrados, nunca anulados."""
    from cobranza.permissions import filtrar_por_sede

    qs = Egreso.objects.exclude(estado='anulado').filter(
        estado__in=('pendiente_pago', 'registrado')
    ).select_related('proveedor', 'categoria', 'sede')
    qs = filtrar_por_sede(usuario, qs, campo='sede')
    if sede:
        qs = qs.filter(sede_id=sede)
    if desde:
        qs = qs.filter(fecha_emision__gte=desde)
    if hasta:
        qs = qs.filter(fecha_emision__lte=hasta)
    return qs


def sin_comprobante(qs):
    activos = ComprobanteEgreso.objects.filter(egreso_id=OuterRef('pk'), activo=True)
    return qs.annotate(tiene_comprobante=Exists(activos)).filter(tiene_comprobante=False)


def rango_mes_actual(hoy=None):
    hoy = hoy or date.today()
    inicio = hoy.replace(day=1)
    anterior_fin = inicio.fromordinal(inicio.toordinal() - 1)
    return inicio, anterior_fin.replace(day=1), anterior_fin


def por_mes(qs):
    return (qs.annotate(mes=TruncMonth('fecha_egreso'))
              .values('mes')
              .annotate(**sumar('monto_usd_pagado', 'monto_ves_pagado'))
              .order_by('mes'))
