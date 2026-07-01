"""
Fuente de verdad ÚNICA para el cálculo de morosidad.

Antes existían dos criterios distintos y divergentes:
  - La lista de morosos (ListaMorososView) calculaba la mora en tiempo real
    desde las mensualidades, considerando meses anteriores + mes actual vencido.
  - La tarea Celery (verificar_solvencia_estudiantil_automatica) solo miraba
    la mensualidad del mes actual y persistía Alumno.estatus_financiero.

Resultado: un alumno podía aparecer como MOROSO en el módulo de cobranza y
SOLVENTE en el módulo de alumnos (que leía el campo persistido y desactualizado).

Este módulo centraliza la regla para que morosos, la tarea Celery y las vistas
de alumnos usen exactamente el mismo criterio.

Criterio de MORA (alumno activo, no becado):
  - Deuda de meses anteriores: cualquier mensualidad de un mes/año previo sin pagar.
  - Deuda del mes actual: mensualidad del mes actual sin pagar y hoy ya alcanzó
    (o pasó) el dia_limite_pago del alumno.
"""
from datetime import date
from decimal import Decimal

from django.db.models import (
    Q, Exists, OuterRef, Sum, Count, Subquery,
    DecimalField, IntegerField, BooleanField, Case, When, Value,
)
from django.db.models.functions import Coalesce

from .models import Mensualidad


def _hoy(hoy=None):
    return hoy or date.today()


def _condicion_mora(hoy):
    """
    Devuelve (deuda_mes_pasado, deuda_mes_actual) como expresiones para anotar
    sobre un queryset de Alumno. OuterRef('pk') referencia al Alumno.
    """
    deuda_mes_pasado = Exists(
        Mensualidad.objects.filter(
            alumno=OuterRef('pk'),
            pagado=False,
        ).filter(
            Q(anio__lt=hoy.year) |
            Q(anio=hoy.year, mes__lt=hoy.month)
        )
    )

    deuda_mes_actual = (
        Exists(
            Mensualidad.objects.filter(
                alumno=OuterRef('pk'),
                pagado=False,
                anio=hoy.year,
                mes=hoy.month,
            )
        ) & Q(dia_limite_pago__lte=hoy.day)
    )

    return deuda_mes_pasado, deuda_mes_actual


def annotate_en_mora(alumno_qs, hoy=None):
    """
    Anota `en_mora` (BooleanField) sobre un queryset de Alumno según el criterio
    canónico. NO excluye becados: quien decide qué hacer con 'becado' es el
    consumidor (la tarea Celery los excluye; el serializer conserva la etiqueta).
    """
    hoy = _hoy(hoy)
    deuda_mes_pasado, deuda_mes_actual = _condicion_mora(hoy)
    return alumno_qs.annotate(
        en_mora=Case(
            When(deuda_mes_pasado | deuda_mes_actual, then=Value(True)),
            default=Value(False),
            output_field=BooleanField(),
        )
    )


def annotate_mora_detalle(alumno_qs, hoy=None):
    """
    Como annotate_en_mora pero además anota `monto_adeudado` y `meses_adeudados`
    (suma y conteo de mensualidades vencidas: meses anteriores + mes actual).
    Usado por la lista de morosos y su exportación a Excel.
    """
    hoy = _hoy(hoy)
    alumno_qs = annotate_en_mora(alumno_qs, hoy)

    overdue_q = Q(pagado=False) & (
        Q(anio__lt=hoy.year) |
        Q(anio=hoy.year, mes__lte=hoy.month)
    )
    debt_subq = (
        Mensualidad.objects.filter(alumno=OuterRef('pk')).filter(overdue_q)
        .values('alumno').annotate(t=Sum('monto_usd')).values('t')[:1]
    )
    count_subq = (
        Mensualidad.objects.filter(alumno=OuterRef('pk')).filter(overdue_q)
        .values('alumno').annotate(c=Count('id')).values('c')[:1]
    )
    return alumno_qs.annotate(
        monto_adeudado=Coalesce(
            Subquery(debt_subq, output_field=DecimalField(max_digits=10, decimal_places=2)),
            Decimal('0.00'),
        ),
        meses_adeudados=Coalesce(
            Subquery(count_subq, output_field=IntegerField()),
            0,
        ),
    )


def estatus_financiero_actual(alumno):
    """
    Estado a mostrar para un Alumno que ya trae la anotación `en_mora`.
    Conserva la etiqueta 'becado'; en cualquier otro caso deriva de `en_mora`.
    Si el alumno no fue anotado, cae al campo persistido (compatibilidad).
    """
    if alumno.estatus_financiero == 'becado':
        return 'becado'
    en_mora = getattr(alumno, 'en_mora', None)
    if en_mora is None:
        return alumno.estatus_financiero
    return 'mora' if en_mora else 'solvente'
