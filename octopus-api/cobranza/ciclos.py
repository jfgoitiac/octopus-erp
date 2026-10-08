"""
Ciclos de cobranza (PLAN_COBRANZA_INTELIGENTE.md, Fase 1).

Un CicloCobranza acompaña UNA mensualidad impaga. Este módulo concentra:
  - la fecha de vencimiento (mismo criterio que cobranza/mora.py: el día
    límite del alumno dentro del mes de la mensualidad),
  - el paso de días de mora a etapa,
  - la evaluación diaria idempotente (`evaluar_ciclos`),
  - el cierre inmediato por pago (`cerrar_ciclo_si_pagado`),
  - la puesta al día silenciosa al encender el módulo (`poner_al_dia_sede`).

Todo opera solo sobre sedes con Cobranza Inteligente efectivamente encendida
(cobranza/inteligente.py). Nada aquí envía mensajes.
"""
import calendar
from datetime import date

from django.db import transaction
from django.utils import timezone

from .inteligente import sedes_con_inteligente_activa
from .models import CicloCobranza, EventoCiclo, Mensualidad

# Límites de cada etapa en días de mora (hoy - vencimiento). Valores por
# defecto de la Fase 0; se firman con el colegio piloto.
DIAS_SEGUIMIENTO = 3
DIAS_PRIORITARIA = 15
DIAS_CRITICA = 30

DIA_LIMITE_POR_DEFECTO = 5


def calcular_fecha_vencimiento(mensualidad):
    """Día límite del alumno dentro del mes de la mensualidad (acotado al mes)."""
    dia_limite = getattr(mensualidad.alumno, 'dia_limite_pago', None) or DIA_LIMITE_POR_DEFECTO
    dia = min(dia_limite, calendar.monthrange(mensualidad.anio, mensualidad.mes)[1])
    return date(mensualidad.anio, mensualidad.mes, dia)


def dias_de_mora(fecha_vencimiento, hoy=None):
    """Días desde el vencimiento; negativo si todavía no vence."""
    return ((hoy or date.today()) - fecha_vencimiento).days


def etapa_por_dias(dias):
    """
    Etapa según los días de mora. Coherente con cobranza/mora.py: una
    mensualidad cuenta como mora desde el día del vencimiento (dias >= 0).
    """
    if dias < 0:
        return CicloCobranza.PREVENTIVA
    if dias < DIAS_SEGUIMIENTO:
        return CicloCobranza.VENCIDA
    if dias < DIAS_PRIORITARIA:
        return CicloCobranza.SEGUIMIENTO
    if dias < DIAS_CRITICA:
        return CicloCobranza.PRIORITARIA
    return CicloCobranza.CRITICA


def _evento(ciclo, tipo, detalle=None, usuario=None, sede_id=None):
    return EventoCiclo(ciclo=ciclo, sede_id=sede_id, tipo=tipo,
                       detalle=detalle or {}, usuario=usuario)


def _mensualidades_de_sede(sede_id):
    return Mensualidad.objects.filter(alumno__sede_id=sede_id).select_related('alumno')


def _cerrar(ciclo, motivo, ahora):
    ciclo.estado = CicloCobranza.CERRADA
    ciclo.motivo_cierre = motivo
    ciclo.cerrado_en = ahora
    ciclo.proxima_accion = ''
    ciclo.proxima_accion_fecha = None


CAMPOS_CIERRE = ['estado', 'motivo_cierre', 'cerrado_en', 'proxima_accion', 'proxima_accion_fecha']


@transaction.atomic
def evaluar_ciclos_sede(sede_id, hoy=None):
    """
    Pone al día los ciclos de una sede para `hoy`. IDEMPOTENTE: correrla dos
    veces el mismo día no produce cambios ni eventos nuevos.

      1. Crea el ciclo de cada mensualidad impaga de un alumno activo que no lo tenga.
      2. Cierra los ciclos abiertos cuya mensualidad ya se pagó (motivo 'pagada')
         o cuyo alumno se retiró (motivo 'retirado').
      3. Recalcula la etapa de los ciclos abiertos que no están pausados.

    Devuelve un dict con los contadores de lo que cambió.
    """
    hoy = hoy or date.today()
    ahora = timezone.now()
    resumen = {'creados': 0, 'cerrados': 0, 'cambios_etapa': 0}
    eventos = []

    # 1. Ciclos faltantes
    faltantes = (
        _mensualidades_de_sede(sede_id)
        .filter(pagado=False, alumno__activo=True, ciclo__isnull=True)
        .exclude(alumno__estatus_financiero='becado')  # igual que Morosos: los becados no se cobran
    )
    nuevos = []
    for m in faltantes:
        venc = calcular_fecha_vencimiento(m)
        nuevos.append(CicloCobranza(
            mensualidad=m, fecha_vencimiento=venc,
            estado=etapa_por_dias(dias_de_mora(venc, hoy)),
        ))
    if nuevos:
        CicloCobranza.objects.bulk_create(nuevos)
        resumen['creados'] = len(nuevos)
        eventos.extend(
            _evento(c, 'ciclo_creado', {'estado': c.estado, 'vencimiento': c.fecha_vencimiento.isoformat()})
            for c in nuevos
        )

    # 2 y 3. Ciclos abiertos de la sede
    abiertos = (
        CicloCobranza.objects.filter(
            mensualidad__alumno__sede_id=sede_id, estado__in=CicloCobranza.ESTADOS_ABIERTOS)
        .select_related('mensualidad__alumno')
    )
    for ciclo in abiertos:
        m = ciclo.mensualidad
        motivo = 'pagada' if m.pagado else ('retirado' if not m.alumno.activo else None)
        if motivo:
            _cerrar(ciclo, motivo, ahora)
            ciclo.save(update_fields=CAMPOS_CIERRE)
            eventos.append(_evento(ciclo, 'ciclo_cerrado', {'motivo': motivo}))
            resumen['cerrados'] += 1
            continue
        if ciclo.estado == CicloCobranza.PAUSADA:
            continue
        nueva = etapa_por_dias(dias_de_mora(ciclo.fecha_vencimiento, hoy))
        if nueva != ciclo.estado:
            eventos.append(_evento(ciclo, 'cambio_etapa', {'de': ciclo.estado, 'a': nueva}))
            ciclo.estado = nueva
            ciclo.save(update_fields=['estado'])
            resumen['cambios_etapa'] += 1

    if eventos:
        EventoCiclo.objects.bulk_create(eventos)
    return resumen


def evaluar_ciclos(hoy=None):
    """Tarea diaria: evalúa solo las sedes con el módulo efectivamente encendido."""
    return {sede_id: evaluar_ciclos_sede(sede_id, hoy) for sede_id in sedes_con_inteligente_activa()}


def poner_al_dia_sede(sede_id, usuario=None, hoy=None):
    """
    Puesta al día silenciosa al ENCENDER el módulo: crea los ciclos faltantes,
    cierra lo que se pagó mientras estuvo apagado y recalcula etapas. No envía
    nada ni dispara reglas atrasadas.
    """
    resumen = evaluar_ciclos_sede(sede_id, hoy)
    EventoCiclo.objects.create(
        sede_id=sede_id, tipo='modulo_encendido', usuario=usuario, detalle=resumen)
    return resumen


def registrar_apagado_sede(sede_id, usuario=None, motivo=''):
    """Deja constancia de que el módulo se apagó (los datos se conservan)."""
    EventoCiclo.objects.create(
        sede_id=sede_id, tipo='modulo_apagado', usuario=usuario, detalle={'motivo': motivo})


def crear_ciclo_para(mensualidad, hoy=None):
    """Crea el ciclo de una mensualidad impaga recién creada (si aún no tiene)."""
    if (mensualidad.pagado or not mensualidad.alumno.activo
            or mensualidad.alumno.estatus_financiero == 'becado'):
        return None
    venc = calcular_fecha_vencimiento(mensualidad)
    ciclo, creado = CicloCobranza.objects.get_or_create(
        mensualidad=mensualidad,
        defaults={'fecha_vencimiento': venc,
                  'estado': etapa_por_dias(dias_de_mora(venc, hoy))},
    )
    if creado:
        EventoCiclo.objects.create(
            ciclo=ciclo, tipo='ciclo_creado',
            detalle={'estado': ciclo.estado, 'vencimiento': venc.isoformat()})
    return ciclo


_GRAVEDAD = {
    CicloCobranza.PREVENTIVA: 0, CicloCobranza.VENCIDA: 1, CicloCobranza.SEGUIMIENTO: 2,
    CicloCobranza.PRIORITARIA: 3, CicloCobranza.CRITICA: 4,
}


def etapa_mas_avanzada_por_alumno(alumnos):
    """
    {alumno_id: etapa} con la etapa más avanzada entre los ciclos abiertos y no
    pausados de cada alumno, SOLO para alumnos cuya sede tiene el módulo
    encendido (apagado, Morosos queda exactamente como antes). Una sola query.
    """
    activas = sedes_con_inteligente_activa()
    ids = [a.id for a in alumnos if a.sede_id in activas]
    if not ids:
        return {}
    resultado = {}
    filas = CicloCobranza.objects.filter(
        mensualidad__alumno_id__in=ids, estado__in=list(_GRAVEDAD)
    ).values_list('mensualidad__alumno_id', 'estado')
    for alumno_id, estado in filas:
        actual = resultado.get(alumno_id)
        if actual is None or _GRAVEDAD[estado] > _GRAVEDAD[actual]:
            resultado[alumno_id] = estado
    return resultado


def cerrar_ciclo_si_pagado(mensualidad):
    """
    Cierre inmediato: si la mensualidad quedó saldada y su ciclo sigue abierto,
    lo cierra sin esperar a la tarea diaria. No hace nada si no hay ciclo.
    """
    if not mensualidad.pagado:
        return False
    ciclo = CicloCobranza.objects.filter(
        mensualidad=mensualidad, estado__in=CicloCobranza.ESTADOS_ABIERTOS).first()
    if ciclo is None:
        return False
    _cerrar(ciclo, 'pagada', timezone.now())
    ciclo.save(update_fields=CAMPOS_CIERRE)
    EventoCiclo.objects.create(ciclo=ciclo, tipo='ciclo_cerrado', detalle={'motivo': 'pagada'})
    return True
