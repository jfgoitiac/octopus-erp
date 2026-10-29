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
import logging
from datetime import date

from django.db import transaction
from django.utils import timezone

from .inteligente import sedes_con_inteligente_activa
from .models import CicloCobranza, EventoCiclo, Mensualidad
from .mora import DIA_LIMITE_POR_DEFECTO, fecha_vencimiento_mensualidad  # noqa: F401

# Límites de cada etapa en días de mora (hoy - vencimiento). Valores por
# defecto de la Fase 0; se firman con el colegio piloto.
DIAS_SEGUIMIENTO = 3
DIAS_PRIORITARIA = 15
DIAS_CRITICA = 30

logger = logging.getLogger(__name__)


def calcular_fecha_vencimiento(mensualidad):
    """
    Vencimiento del ciclo: el mismo de mora y recargos (la fecha congelada en
    la cuota). Antes se recalculaba con el día límite actual del alumno y el
    ciclo podía vencer en una fecha distinta a la que usaba el resto del sistema.
    """
    return fecha_vencimiento_mensualidad(mensualidad)


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


def _reabrir(ciclo, hoy=None):
    """Reabre un ciclo cerrado por pago, en la etapa que le toca hoy. Deja evento."""
    m = ciclo.mensualidad
    if (ciclo.estado != CicloCobranza.CERRADA or ciclo.motivo_cierre != 'pagada'
            or m.pagado or not m.alumno.activo or m.alumno.estatus_financiero == 'becado'):
        return False
    ciclo.estado = etapa_por_dias(dias_de_mora(ciclo.fecha_vencimiento, hoy))
    ciclo.motivo_cierre = ''
    ciclo.cerrado_en = None
    ciclo.save(update_fields=['estado', 'motivo_cierre', 'cerrado_en'])
    EventoCiclo.objects.create(ciclo=ciclo, tipo='ciclo_reabierto', detalle={'motivo': 'pago_anulado'})
    return True


def reabrir_ciclo_si_impago(mensualidad, hoy=None):
    """Reapertura inmediata cuando se anula un pago y la mensualidad vuelve a deber."""
    from .inteligente import inteligente_activa_para_sede
    if mensualidad.pagado or not inteligente_activa_para_sede(mensualidad.alumno.sede_id):
        return False
    ciclo = CicloCobranza.objects.filter(
        mensualidad=mensualidad, estado=CicloCobranza.CERRADA, motivo_cierre='pagada'
    ).select_related('mensualidad__alumno').first()
    return bool(ciclo and _reabrir(ciclo, hoy))


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
    resumen = {'creados': 0, 'cerrados': 0, 'cambios_etapa': 0, 'reabiertos': 0}
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

    # 1b. Ciclos cerrados por pago cuya mensualidad volvió a quedar impaga
    # (pago anulado por un update masivo que no dispara la señal).
    for ciclo in CicloCobranza.objects.filter(
            mensualidad__alumno__sede_id=sede_id, estado=CicloCobranza.CERRADA,
            motivo_cierre='pagada', mensualidad__pagado=False,
            mensualidad__alumno__activo=True).select_related('mensualidad__alumno'):
        if _reabrir(ciclo, hoy):
            resumen['reabiertos'] += 1

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
        # Ciclos creados antes de unificar el vencimiento: se alinean con la cuota.
        if m.fecha_vencimiento and ciclo.fecha_vencimiento != m.fecha_vencimiento:
            ciclo.fecha_vencimiento = m.fecha_vencimiento
            ciclo.save(update_fields=['fecha_vencimiento'])
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


def poner_al_dia_si_hace_falta(sedes, hoy=None):
    """
    Evalúa los ciclos de cada sede como mucho una vez por día y proceso, al
    abrir la bandeja o el dashboard. La evaluación diaria dependía solo de
    Celery Beat: si el beat no corre (instalación en modo sencillo, servicio
    caído) los ciclos de cuotas nuevas no se creaban y las etapas quedaban
    congeladas días enteros. Es idempotente, así que coexistir con la tarea
    de Beat no duplica nada. Un fallo aquí nunca rompe la lectura.
    """
    from django.core.cache import cache
    from .gestion import actualizar_proximas_acciones
    hoy = hoy or date.today()
    for sede_id in sedes:
        clave = f'cobranza_inteligente:ciclos_evaluados:{sede_id}:{hoy.isoformat()}'
        if not cache.add(clave, True, timeout=26 * 3600):
            continue
        try:
            resumen = evaluar_ciclos_sede(sede_id, hoy)
            if any(resumen.values()):
                actualizar_proximas_acciones(
                    CicloCobranza.objects.filter(mensualidad__alumno__sede_id=sede_id), hoy)
        except Exception:
            cache.delete(clave)
            logger.exception('No se pudo poner al día los ciclos de la sede %s', sede_id)


def poner_al_dia_sede(sede_id, usuario=None, hoy=None):
    """
    Puesta al día silenciosa al ENCENDER el módulo: crea los ciclos faltantes,
    cierra lo que se pagó mientras estuvo apagado y recalcula etapas. No envía
    nada ni dispara reglas atrasadas.
    """
    from .motor import crear_reglas_por_defecto
    crear_reglas_por_defecto(sede_id)
    resumen = evaluar_ciclos_sede(sede_id, hoy)
    EventoCiclo.objects.create(
        sede_id=sede_id, tipo='modulo_encendido', usuario=usuario, detalle=resumen)
    return resumen


def registrar_apagado_sede(sede_id, usuario=None, motivo=''):
    """Deja constancia de que el módulo se apagó (los datos se conservan)."""
    from .motor import cancelar_envios_pendientes_sede
    cancelar_envios_pendientes_sede(sede_id)
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
