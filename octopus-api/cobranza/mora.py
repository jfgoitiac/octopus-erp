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
  - Deuda de inscripción: cualquier cuota de inscripción sin pagar (no tiene
    fecha límite propia, se considera vencida desde que se genera).
  - Deuda de solvencia: cualquier cuota de solvencia sin pagar con monto > 0
    (igual que inscripción, no tiene fecha límite propia). Se cuenta aparte
    en `monto_solvencia_adeudado` — no se suma a `monto_adeudado` — para que
    morosos y su exportación puedan mostrarla como un renglón separado.
  - Deuda de proyecto de inversión: es por REPRESENTANTE, no por alumno, así
    que se evalúa contra `alumno.representante`. Cualquier cuota impaga o
    parcialmente abonada (pagado=False) cuenta como mora. Se cuenta aparte en
    `monto_proyecto_inversion_adeudado` (saldo real, no el monto bruto) por
    el mismo motivo que la deuda de solvencia.
"""
from datetime import date
from decimal import Decimal

from django.db.models import (
    F, Q, Exists, OuterRef, Sum, Count, Subquery,
    DecimalField, IntegerField, BooleanField, Case, When, Value,
)
from django.db.models.functions import Coalesce

from .models import CuotaInscripcion, CuotaProyectoInversion, CuotaSolvencia, Mensualidad


def _hoy(hoy=None):
    return hoy or date.today()


def _condicion_mora(hoy):
    """
    Devuelve (deuda_mes_pasado, deuda_mes_actual, deuda_inscripcion,
    deuda_solvencia, deuda_proyecto_inversion) como expresiones para anotar
    sobre un queryset de Alumno. OuterRef('pk') referencia al Alumno;
    deuda_proyecto_inversion usa OuterRef('representante') porque esa cuota
    es por representante, no por alumno.
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

    deuda_inscripcion = Exists(
        CuotaInscripcion.objects.filter(
            alumno=OuterRef('pk'),
            pagado=False,
        )
    )

    deuda_solvencia = Exists(
        CuotaSolvencia.objects.filter(
            alumno=OuterRef('pk'),
            pagado=False,
            monto_usd__gt=0,
        )
    )

    deuda_proyecto_inversion = Exists(
        CuotaProyectoInversion.objects.filter(
            representante=OuterRef('representante'),
            pagado=False,
        )
    )

    return (
        deuda_mes_pasado, deuda_mes_actual, deuda_inscripcion, deuda_solvencia,
        deuda_proyecto_inversion,
    )


def annotate_en_mora(alumno_qs, hoy=None):
    """
    Anota `en_mora` (BooleanField) sobre un queryset de Alumno según el criterio
    canónico. NO excluye becados: quien decide qué hacer con 'becado' es el
    consumidor (la tarea Celery los excluye; el serializer conserva la etiqueta).
    """
    hoy = _hoy(hoy)
    (
        deuda_mes_pasado, deuda_mes_actual, deuda_inscripcion, deuda_solvencia,
        deuda_proyecto_inversion,
    ) = _condicion_mora(hoy)
    return alumno_qs.annotate(
        en_mora=Case(
            When(
                deuda_mes_pasado | deuda_mes_actual | deuda_inscripcion | deuda_solvencia
                | deuda_proyecto_inversion,
                then=Value(True),
            ),
            default=Value(False),
            output_field=BooleanField(),
        )
    )


def annotate_mora_detalle(alumno_qs, hoy=None):
    """
    Como annotate_en_mora pero además anota `monto_adeudado`, `meses_adeudados`
    y `monto_solvencia_adeudado`. `monto_adeudado` suma mensualidades vencidas
    (meses anteriores + mes actual) más cuotas de inscripción impagas.
    `meses_adeudados` cuenta solo mensualidades, ya que la inscripción no es una
    deuda mensual. `monto_solvencia_adeudado` va aparte, sin sumarse a
    `monto_adeudado`, para mostrarse como renglón separado en morosos.
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
    inscripcion_subq = (
        CuotaInscripcion.objects.filter(alumno=OuterRef('pk'), pagado=False)
        .values('alumno').annotate(t=Sum('monto_usd')).values('t')[:1]
    )
    solvencia_subq = (
        CuotaSolvencia.objects.filter(alumno=OuterRef('pk'), pagado=False, monto_usd__gt=0)
        .values('alumno').annotate(t=Sum('monto_usd')).values('t')[:1]
    )
    proyecto_inversion_subq = (
        CuotaProyectoInversion.objects.filter(representante=OuterRef('representante'), pagado=False)
        .annotate(saldo=F('monto_usd') - F('monto_pagado'))
        .values('representante').annotate(t=Sum('saldo')).values('t')[:1]
    )
    return alumno_qs.annotate(
        monto_adeudado=Coalesce(
            Subquery(debt_subq, output_field=DecimalField(max_digits=10, decimal_places=2)),
            Decimal('0.00'),
        ) + Coalesce(
            Subquery(inscripcion_subq, output_field=DecimalField(max_digits=10, decimal_places=2)),
            Decimal('0.00'),
        ),
        meses_adeudados=Coalesce(
            Subquery(count_subq, output_field=IntegerField()),
            0,
        ),
        monto_solvencia_adeudado=Coalesce(
            Subquery(solvencia_subq, output_field=DecimalField(max_digits=10, decimal_places=2)),
            Decimal('0.00'),
        ),
        monto_proyecto_inversion_adeudado=Coalesce(
            Subquery(proyecto_inversion_subq, output_field=DecimalField(max_digits=10, decimal_places=2)),
            Decimal('0.00'),
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


def sincronizar_estatus_alumno(alumno, hoy=None):
    """
    Recalcula el estatus con el criterio canónico y lo persiste si cambió.
    Usar tras registrar/aprobar un pago: antes se asignaba 'solvente' a ciegas,
    dejando solvente a alumnos que aún debían meses anteriores (divergencia
    entre módulos hasta la corrida nocturna de Celery). Devuelve el estatus.
    """
    if alumno.estatus_financiero == 'becado':
        return 'becado'

    from secretaria.models import Alumno
    anotado = annotate_en_mora(Alumno.todos.filter(pk=alumno.pk), hoy).first()
    nuevo = 'mora' if (anotado and anotado.en_mora) else 'solvente'
    if alumno.estatus_financiero != nuevo:
        alumno.estatus_financiero = nuevo
        alumno.save(update_fields=['estatus_financiero'])
    return nuevo
