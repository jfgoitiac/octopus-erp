"""
Gestión humana de Cobranza Inteligente (PLAN_COBRANZA_INTELIGENTE.md, Fase 3):
acciones sobre un ciclo, convenio de pago mínimo, bandeja "Atención requerida
hoy" con puntuación explicable y cola de pagos en revisión.

Toda acción deja un EventoCiclo (historial de solo inserción).
"""
from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from .ciclos import dias_de_mora, etapa_por_dias
from .models import (
    CicloCobranza, ConvenioPago, CuotaConvenio, EnvioCobranza, EventoCiclo, Pago,
)

MOTIVOS_CIERRE = ('anulada', 'condonada', 'retirado', 'conciliada', 'descartada')
TIPOS_GESTION = {
    'llamada': 'llamada_registrada',
    'whatsapp_manual': 'whatsapp_manual',
    'nota': 'nota',
}
DIAS_PAGO_REVISION_VIEJO = 3
DIAS_SIN_RESPUESTA = 7


class AccionInvalida(Exception):
    """La acción pedida no es válida para el estado actual del ciclo."""


def _saldo(ciclo):
    m = ciclo.mensualidad
    return m.monto_usd - m.monto_pagado


def _evento(ciclo, tipo, usuario=None, **detalle):
    EventoCiclo.objects.create(ciclo=ciclo, tipo=tipo, usuario=usuario, detalle=detalle)
    CicloCobranza.objects.filter(pk=ciclo.pk).update(ultima_accion_en=timezone.now())


def _exigir_abierto(ciclo):
    if not ciclo.abierto:
        raise AccionInvalida('El ciclo ya está cerrado.')


# ── Acciones sobre un ciclo ────────────────────────────────────────────────────

def registrar_gestion(ciclo, tipo, usuario, texto=''):
    """Registra una llamada, un WhatsApp manual o una nota."""
    _exigir_abierto(ciclo)
    if tipo not in TIPOS_GESTION:
        raise AccionInvalida('Tipo de gestión desconocido.')
    texto = (texto or '').strip()
    if tipo == 'nota' and not texto:
        raise AccionInvalida('La nota no puede estar vacía.')
    _evento(ciclo, TIPOS_GESTION[tipo], usuario, texto=texto[:1000])


def asignar_responsable(ciclo, responsable, usuario):
    _exigir_abierto(ciclo)
    anterior = ciclo.responsable.get_username() if ciclo.responsable_id else None
    ciclo.responsable = responsable
    ciclo.save(update_fields=['responsable'])
    _evento(ciclo, 'responsable_asignado', usuario, anterior=anterior,
            nuevo=responsable.get_username() if responsable else None)


def pausar_ciclo(ciclo, motivo, usuario):
    """Pausa con motivo OBLIGATORIO; guarda la etapa para volver a ella."""
    _exigir_abierto(ciclo)
    motivo = (motivo or '').strip()
    if not motivo:
        raise AccionInvalida('El motivo de la pausa es obligatorio.')
    if ciclo.estado == CicloCobranza.PAUSADA:
        raise AccionInvalida('El ciclo ya está pausado.')
    ciclo.estado_previo_pausa = ciclo.estado
    ciclo.estado = CicloCobranza.PAUSADA
    ciclo.motivo_pausa = motivo[:200]
    ciclo.save(update_fields=['estado', 'estado_previo_pausa', 'motivo_pausa'])
    _evento(ciclo, 'ciclo_pausado', usuario, motivo=motivo[:200])


def marcar_reclamo(ciclo, usuario, detalle=''):
    """Un reclamo del representante pausa el ciclo automáticamente."""
    pausar_ciclo(ciclo, 'reclamo', usuario)
    if detalle:
        _evento(ciclo, 'nota', usuario, texto=f'Reclamo: {detalle[:900]}')


def reanudar_ciclo(ciclo, usuario=None, hoy=None):
    """Vuelve a la etapa guardada (si no hay, la recalcula por los días de mora)."""
    if ciclo.estado != CicloCobranza.PAUSADA:
        raise AccionInvalida('El ciclo no está pausado.')
    previo = ciclo.estado_previo_pausa
    ciclo.estado = previo if previo in CicloCobranza.ETAPAS_CALCULADAS else etapa_por_dias(
        dias_de_mora(ciclo.fecha_vencimiento, hoy))
    motivo = ciclo.motivo_pausa
    ciclo.estado_previo_pausa, ciclo.motivo_pausa = '', ''
    ciclo.save(update_fields=['estado', 'estado_previo_pausa', 'motivo_pausa'])
    _evento(ciclo, 'ciclo_reanudado', usuario, motivo_pausa=motivo)


def cerrar_ciclo(ciclo, motivo, usuario, detalle=''):
    """Cierre o descarte auditable. La condonación exige permiso específico (lo valida la vista)."""
    _exigir_abierto(ciclo)
    if motivo not in MOTIVOS_CIERRE:
        raise AccionInvalida(f'Motivo de cierre inválido. Use: {", ".join(MOTIVOS_CIERRE)}.')
    ciclo.estado = CicloCobranza.CERRADA
    ciclo.motivo_cierre = motivo
    ciclo.cerrado_en = timezone.now()
    ciclo.proxima_accion, ciclo.proxima_accion_fecha = '', None
    ciclo.save(update_fields=['estado', 'motivo_cierre', 'cerrado_en', 'proxima_accion',
                              'proxima_accion_fecha'])
    _evento(ciclo, 'ciclo_cerrado', usuario, motivo=motivo, detalle=(detalle or '')[:500])


# ── Convenio de pago mínimo ────────────────────────────────────────────────────

@transaction.atomic
def crear_convenio(representante, ciclos, cuotas, usuario, notas='', hoy=None):
    """
    `cuotas`: lista de (fecha, monto). La suma debe igualar el saldo de las
    deudas incluidas (±0.01) y las fechas no pueden ser pasadas ni desordenadas.
    Pausa el ciclo de cada deuda con motivo 'convenio'.
    """
    hoy = hoy or date.today()
    ciclos = list(ciclos)
    if not ciclos:
        raise AccionInvalida('Seleccione al menos una deuda.')
    if not cuotas:
        raise AccionInvalida('Defina al menos una cuota.')
    for c in ciclos:
        _exigir_abierto(c)
        if c.mensualidad.alumno.representante_id != representante.id:
            raise AccionInvalida('Todas las deudas deben ser del mismo representante.')
        if c.convenios.filter(estado=ConvenioPago.VIGENTE).exists():
            raise AccionInvalida('Una de las deudas ya está en un convenio vigente.')
    fechas = [f for f, _ in cuotas]
    if any(f < hoy for f in fechas) or fechas != sorted(fechas):
        raise AccionInvalida('Las fechas de las cuotas deben ser futuras y estar en orden.')
    if any(m <= 0 for _, m in cuotas):
        raise AccionInvalida('Cada cuota debe ser mayor que cero.')
    saldo = sum((_saldo(c) for c in ciclos), Decimal('0.00'))
    total = sum((Decimal(m) for _, m in cuotas), Decimal('0.00'))
    if abs(saldo - total) > Decimal('0.01'):
        raise AccionInvalida(f'La suma de las cuotas ({total}) debe igualar el saldo ({saldo}).')

    convenio = ConvenioPago.objects.create(representante=representante, notas=notas, creado_por=usuario)
    convenio.ciclos.set(ciclos)
    CuotaConvenio.objects.bulk_create([
        CuotaConvenio(convenio=convenio, numero=i, fecha=f, monto_usd=Decimal(m))
        for i, (f, m) in enumerate(cuotas, start=1)
    ])
    for c in ciclos:
        if c.estado != CicloCobranza.PAUSADA:
            pausar_ciclo(c, 'convenio', usuario)
        _evento(c, 'convenio_creado', usuario, convenio=convenio.id, cuotas=len(cuotas))
    return convenio


def _reanudar_pausados_por_convenio(convenio, usuario=None, hoy=None):
    for c in convenio.ciclos.all():
        if c.estado == CicloCobranza.PAUSADA and c.motivo_pausa == 'convenio':
            reanudar_ciclo(c, usuario, hoy)


@transaction.atomic
def marcar_cuota_pagada(cuota, usuario):
    if cuota.convenio.estado != ConvenioPago.VIGENTE:
        raise AccionInvalida('El convenio no está vigente.')
    if cuota.pagada:
        raise AccionInvalida('La cuota ya está pagada.')
    cuota.pagada, cuota.pagada_en = True, timezone.now()
    cuota.save(update_fields=['pagada', 'pagada_en'])
    convenio = cuota.convenio
    for c in convenio.ciclos.all():
        _evento(c, 'cuota_convenio_pagada', usuario, convenio=convenio.id, cuota=cuota.numero)
    if not convenio.cuotas.filter(pagada=False).exists():
        convenio.estado = ConvenioPago.CUMPLIDO
        convenio.save(update_fields=['estado'])
        _reanudar_pausados_por_convenio(convenio, usuario)


@transaction.atomic
def cancelar_convenio(convenio, usuario):
    if convenio.estado != ConvenioPago.VIGENTE:
        raise AccionInvalida('El convenio no está vigente.')
    convenio.estado = ConvenioPago.CANCELADO
    convenio.save(update_fields=['estado'])
    _reanudar_pausados_por_convenio(convenio, usuario)


@transaction.atomic
def revisar_convenios(hoy=None):
    """
    Tarea diaria: un convenio vigente con una cuota vencida sin pagar pasa a
    'incumplido' y sus deudas vuelven al ciclo en su etapa. Devuelve cuántos.
    """
    hoy = hoy or date.today()
    incumplidos = 0
    for convenio in ConvenioPago.objects.filter(
            estado=ConvenioPago.VIGENTE, cuotas__pagada=False, cuotas__fecha__lt=hoy).distinct():
        convenio.estado = ConvenioPago.INCUMPLIDO
        convenio.save(update_fields=['estado'])
        for c in convenio.ciclos.all():
            _evento(c, 'convenio_incumplido', None, convenio=convenio.id)
        _reanudar_pausados_por_convenio(convenio, None, hoy)
        incumplidos += 1
    return incumplidos


# ── Bandeja "Atención requerida hoy" ───────────────────────────────────────────

def _razon(razones, texto, puntos):
    if puntos > 0:
        razones.append({'texto': texto, 'puntos': puntos})


def calcular_bandeja(ciclos_qs, hoy=None, ahora=None):
    """
    Una fila por representante con su puntuación y las razones que la forman
    (todas visibles en la UI). `ciclos_qs` ya viene filtrado por sedes/permisos.
    """
    from portal.models import ComprobantePago
    hoy = hoy or date.today()
    ahora = ahora or timezone.now()
    abiertos = list(
        ciclos_qs.filter(estado__in=CicloCobranza.ESTADOS_ABIERTOS)
        .select_related('mensualidad__alumno__representante', 'responsable'))
    por_rep = {}
    for c in abiertos:
        por_rep.setdefault(c.mensualidad.alumno.representante_id, []).append(c)
    if not por_rep:
        return []

    ids = list(por_rep)
    fallidos = set(EnvioCobranza.objects.filter(
        representante_id__in=ids, estado=EnvioCobranza.FALLIDO,
        creado_en__gte=ahora - timedelta(days=14)).values_list('representante_id', flat=True))
    avisos_viejos = set(EnvioCobranza.objects.filter(
        representante_id__in=ids, estado=EnvioCobranza.ENVIADO,
        enviado_en__lte=ahora - timedelta(days=DIAS_SIN_RESPUESTA),
        enviado_en__gte=ahora - timedelta(days=30)).values_list('representante_id', flat=True))
    limite_rev = ahora - timedelta(days=DIAS_PAGO_REVISION_VIEJO)
    alumno_a_rep = {c.mensualidad.alumno_id: c.mensualidad.alumno.representante_id for c in abiertos}
    pagos_viejos = set()
    for alumno_id in Pago.objects.filter(
            alumno_id__in=alumno_a_rep, estatus='en_revision', fecha_pago__lte=limite_rev
    ).values_list('alumno_id', flat=True):
        pagos_viejos.add(alumno_a_rep[alumno_id])
    for alumno_id in ComprobantePago.objects.filter(
            mensualidad__alumno_id__in=alumno_a_rep, estatus='pendiente', fecha_subida__lte=limite_rev
    ).values_list('mensualidad__alumno_id', flat=True):
        pagos_viejos.add(alumno_a_rep[alumno_id])
    incumplidos = set(ConvenioPago.objects.filter(
        representante_id__in=ids, estado=ConvenioPago.INCUMPLIDO,
        creado_en__gte=ahora - timedelta(days=60)).values_list('representante_id', flat=True))
    proximos = set(CuotaConvenio.objects.filter(
        convenio__representante_id__in=ids, convenio__estado=ConvenioPago.VIGENTE, pagada=False,
        fecha__lte=hoy + timedelta(days=3)).values_list('convenio__representante_id', flat=True))

    filas = []
    for rep_id, ciclos in por_rep.items():
        activos = [c for c in ciclos if c.estado != CicloCobranza.PAUSADA]
        morosos = [c for c in activos if c.estado != CicloCobranza.PREVENTIVA]
        razones = []
        dias_max = max((dias_de_mora(c.fecha_vencimiento, hoy) for c in morosos), default=0)
        _razon(razones, f'Mora de {dias_max} días', min(dias_max, 30))
        if dias_max >= 30:
            _razon(razones, 'Más de 30 días de mora', 20)
        _razon(razones, f'{len(ciclos)} mensualidades pendientes', 5 * (len(ciclos) - 1))
        saldo = sum((_saldo(c) for c in ciclos), Decimal('0.00'))
        _razon(razones, f'Saldo total ${saldo}', min(20, int(saldo // 10)))
        if any(0 < c.mensualidad.monto_pagado < c.mensualidad.monto_usd for c in ciclos):
            _razon(razones, 'Pago parcial', 5)
        if rep_id in pagos_viejos:
            _razon(razones, f'Pago en revisión hace más de {DIAS_PAGO_REVISION_VIEJO} días', 10)
        if rep_id in fallidos:
            _razon(razones, 'Envío fallido', 10)
        if rep_id in avisos_viejos and morosos:
            _razon(razones, f'Sin pago {DIAS_SIN_RESPUESTA}+ días después de un aviso', 5)
        if rep_id in incumplidos:
            _razon(razones, 'Convenio incumplido', 15)
        if rep_id in proximos:
            _razon(razones, 'Cuota de convenio próxima a vencer', 5)

        requiere_atencion = bool(
            morosos or rep_id in pagos_viejos or rep_id in fallidos
            or rep_id in incumplidos or rep_id in proximos)
        if not requiere_atencion:
            continue
        rep = ciclos[0].mensualidad.alumno.representante
        responsable = next((c.responsable for c in ciclos if c.responsable_id), None)
        filas.append({
            'representante': {'id': rep.id, 'nombre': f'{rep.nombre} {rep.apellido}',
                              'cedula': rep.cedula, 'telefono': rep.telefono},
            'puntaje': sum(r['puntos'] for r in razones),
            'razones': razones,
            'saldo_total_usd': str(saldo),
            'dias_mora_max': dias_max,
            'ciclos': [c.id for c in ciclos],
            'estados': sorted({c.estado for c in ciclos}),
            'responsable': responsable.get_username() if responsable else None,
        })
    return sorted(filas, key=lambda f: (-f['puntaje'], f['representante']['nombre']))


# ── Cola de pagos en revisión ──────────────────────────────────────────────────

def pagos_en_revision(sede_ids=None, ahora=None):
    """
    Pagos 'en_revision' y comprobantes pendientes del portal, con los días que
    llevan esperando. `sede_ids`: iterable de sede_id (None incluido) o None = todas.
    """
    from portal.models import ComprobantePago
    ahora = ahora or timezone.now()
    filas = []
    pagos = Pago.objects.filter(estatus='en_revision').select_related('alumno__representante')
    comprobantes = ComprobantePago.objects.filter(estatus='pendiente').select_related(
        'mensualidad__alumno__representante')
    for p in pagos:
        if sede_ids is not None and p.alumno.sede_id not in sede_ids:
            continue
        rep = p.alumno.representante
        filas.append({
            'tipo': 'pago', 'id': p.id, 'desde': p.fecha_pago,
            'dias_espera': max((ahora - p.fecha_pago).days, 0),
            'monto_usd': str(p.monto_usd),
            'alumno': f'{p.alumno.nombre} {p.alumno.apellido}',
            'representante': {'id': rep.id, 'nombre': f'{rep.nombre} {rep.apellido}', 'cedula': rep.cedula},
        })
    for c in comprobantes:
        a = c.mensualidad.alumno
        if sede_ids is not None and a.sede_id not in sede_ids:
            continue
        rep = a.representante
        filas.append({
            'tipo': 'comprobante', 'id': c.id, 'desde': c.fecha_subida,
            'dias_espera': max((ahora - c.fecha_subida).days, 0),
            'monto_usd': str(c.mensualidad.monto_usd - c.mensualidad.monto_pagado),
            'alumno': f'{a.nombre} {a.apellido}',
            'representante': {'id': rep.id, 'nombre': f'{rep.nombre} {rep.apellido}', 'cedula': rep.cedula},
        })
    return sorted(filas, key=lambda f: -f['dias_espera'])
