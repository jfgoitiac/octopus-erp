"""
Gestión humana de Cobranza Inteligente (PLAN_COBRANZA_INTELIGENTE.md, Fase 3):
acciones sobre un ciclo, convenio de pago mínimo, bandeja "Atención requerida
hoy" con puntuación explicable y cola de pagos en revisión.

Toda acción deja un EventoCiclo (historial de solo inserción).
"""
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from .ciclos import dias_de_mora, etapa_por_dias
from .models import (
    CicloCobranza, ConvenioPago, CuotaConvenio, EnvioCobranza, EventoCiclo,
    IntervaloExoneracionRecargoConvenio, Pago,
)

MOTIVOS_CIERRE = ('anulada', 'condonada', 'retirado', 'conciliada', 'descartada')
TIPOS_GESTION = {
    'llamada': 'llamada_registrada',
    'whatsapp_manual': 'whatsapp_manual',
    'nota': 'nota',
}
DIAS_PAGO_REVISION_VIEJO = 3
DIAS_SIN_RESPUESTA = 7
DIAS_RESPUESTA_PENDIENTE = 3
# Pausa de un "takeover": una persona tomó la conversación y el bot deja de escribir.
MOTIVO_GESTION_HUMANA = 'gestion_humana'
ACCIONES_SUGERIDAS = {
    'responder': 'Responder al representante',
    'revisar_pago': 'Revisar el pago en revisión',
    'renegociar': 'Llamar y renegociar el convenio',
    'verificar_contacto': 'Verificar el teléfono y llamar',
    'recordar_cuota': 'Recordar la cuota del convenio',
    'ofrecer_convenio': 'Ofrecer un convenio de pago',
    'llamar': 'Llamar al representante',
    'enviar_recordatorio': 'Enviar recordatorio por WhatsApp',
}


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


# ── Takeover: una persona toma la conversación ─────────────────────────────────

def tomar_conversacion(ciclos, usuario):
    """Pausa los ciclos abiertos (el motor no escribe a ciclos pausados) y los asigna al usuario."""
    tomados = 0
    for ciclo in ciclos:
        if not ciclo.abierto or ciclo.motivo_pausa == MOTIVO_GESTION_HUMANA:
            continue
        if ciclo.estado != CicloCobranza.PAUSADA:
            pausar_ciclo(ciclo, MOTIVO_GESTION_HUMANA, usuario)
        if ciclo.responsable_id != usuario.id:
            asignar_responsable(ciclo, usuario, usuario)
        tomados += 1
    if not tomados:
        raise AccionInvalida('No hay deudas abiertas que tomar.')


def devolver_al_bot(ciclos, usuario):
    """Reanuda solo los ciclos pausados por un takeover; el resto de pausas se respeta."""
    devueltos = [c for c in ciclos if c.estado == CicloCobranza.PAUSADA
                 and c.motivo_pausa == MOTIVO_GESTION_HUMANA]
    if not devueltos:
        raise AccionInvalida('La conversación no está en manos de una persona.')
    for ciclo in devueltos:
        reanudar_ciclo(ciclo, usuario)


def registrar_cobro_whatsapp(representante_id, usuario, mensaje, log_id):
    """Un cobro por WhatsApp enviado desde la UI cuenta como gestión en cada deuda abierta."""
    for ciclo in CicloCobranza.objects.filter(
            mensualidad__alumno__representante_id=representante_id,
            estado__in=CicloCobranza.ESTADOS_ABIERTOS):
        _evento(ciclo, 'whatsapp_manual', usuario, texto=mensaje[:1000], origen='cobro_whatsapp', log=log_id)


# ── Convenio de pago mínimo ────────────────────────────────────────────────────

def _configuracion_recargo_convenio(configuracion):
    configuracion = configuracion if configuracion is not None else {}
    if not isinstance(configuracion, dict):
        raise AccionInvalida('La configuración del recargo por incumplimiento no es válida.')

    def booleano(campo):
        valor = configuracion.get(campo, False)
        if not isinstance(valor, bool):
            raise AccionInvalida(f'{campo} debe ser verdadero o falso.')
        return valor

    def importe(campo, etiqueta, obligatorio=False):
        valor = configuracion.get(campo)
        if valor in (None, '') and not obligatorio:
            return None
        try:
            numero = Decimal(str(valor))
        except (ValueError, TypeError, ArithmeticError):
            raise AccionInvalida(f'{etiqueta} debe ser un número válido.')
        # Validar antes de comparar o cuantizar: NaN puede lanzar InvalidOperation
        # e infinitos/precisiones excesivas no caben en DecimalField(10, 2).
        if not numero.is_finite():
            raise AccionInvalida(f'{etiqueta} debe ser un número finito.')
        if numero <= 0 or numero > Decimal('99999999.99'):
            raise AccionInvalida(f'{etiqueta} debe estar entre 0.01 y 99999999.99.')
        if numero.as_tuple().exponent < -2:
            raise AccionInvalida(f'{etiqueta} admite como máximo dos decimales.')
        return numero

    def entero(campo, etiqueta, defecto=None):
        valor = configuracion.get(campo)
        if valor in (None, ''):
            return defecto
        try:
            numero = Decimal(str(valor))
        except (ValueError, TypeError, ArithmeticError):
            raise AccionInvalida(f'{etiqueta} debe ser un entero entre 1 y 32767.')
        if (not numero.is_finite() or numero < 1 or numero > 32767
                or numero != numero.to_integral_value()):
            raise AccionInvalida(f'{etiqueta} debe ser un entero entre 1 y 32767.')
        return int(numero)

    aplica = booleano('aplicar_recargo_incumplimiento')
    datos = {
        'exonera_recargos_durante_vigencia': booleano('exonera_recargos_durante_vigencia'),
        'aplicar_recargo_incumplimiento': aplica,
        'modo_recargo': configuracion.get('modo_recargo') or 'monto_fijo_usd',
        'frecuencia_recargo': configuracion.get('frecuencia_recargo') or 'unico',
        'intervalo_unidad': configuracion.get('intervalo_unidad') or 'mes',
        'intervalo_cantidad': entero('intervalo_cantidad', 'El intervalo', defecto=1),
        'valor_recargo': importe('valor_recargo', 'El valor del recargo', obligatorio=True) if aplica else None,
        'maximo_aplicaciones': entero('maximo_aplicaciones', 'El máximo de aplicaciones'),
        'tope_recargo_usd': importe('tope_recargo_usd', 'El tope del recargo'),
    }
    if datos['modo_recargo'] not in [valor for valor, _ in ConvenioPago.MODOS_RECARGO]:
        raise AccionInvalida('Modo de recargo por incumplimiento inválido.')
    if datos['frecuencia_recargo'] not in [valor for valor, _ in ConvenioPago.FRECUENCIAS_RECARGO]:
        raise AccionInvalida('Frecuencia de recargo por incumplimiento inválida.')
    if datos['intervalo_unidad'] not in [valor for valor, _ in ConvenioPago.UNIDADES_INTERVALO]:
        raise AccionInvalida('Unidad de intervalo inválida.')
    return datos


def _abrir_intervalo_exoneracion(convenio, momento):
    if not convenio.exonera_recargos_durante_vigencia:
        return
    IntervaloExoneracionRecargoConvenio.objects.get_or_create(
        convenio=convenio, finalizado_en__isnull=True,
        defaults={'iniciado_en': momento},
    )


def _cerrar_intervalo_exoneracion(convenio, momento, motivo):
    IntervaloExoneracionRecargoConvenio.objects.filter(
        convenio=convenio, finalizado_en__isnull=True,
    ).update(finalizado_en=momento, motivo_finalizacion=motivo)


@transaction.atomic
def crear_convenio(
        representante, ciclos, cuotas, usuario, notas='', hoy=None,
        configuracion=None, momento=None):
    """
    `cuotas`: lista de (fecha, monto). La suma debe igualar el saldo de las
    deudas incluidas (±0.01) y las fechas no pueden ser pasadas ni desordenadas.
    Pausa el ciclo de cada deuda con motivo 'convenio'.
    """
    hoy = hoy or timezone.localdate()
    momento = momento or timezone.now()
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

    configuracion_validada = _configuracion_recargo_convenio(configuracion)
    convenio = ConvenioPago.objects.create(
        representante=representante, notas=notas, creado_por=usuario,
        **configuracion_validada,
    )
    convenio.ciclos.set(ciclos)
    CuotaConvenio.objects.bulk_create([
        CuotaConvenio(convenio=convenio, numero=i, fecha=f, monto_usd=Decimal(m))
        for i, (f, m) in enumerate(cuotas, start=1)
    ])
    for c in ciclos:
        if c.estado != CicloCobranza.PAUSADA:
            pausar_ciclo(c, 'convenio', usuario)
        _evento(c, 'convenio_creado', usuario, convenio=convenio.id, cuotas=len(cuotas))
    _abrir_intervalo_exoneracion(convenio, momento)

    # Crear un convenio sobre ciclos de uno incumplido equivale a una
    # renegociación: congela las recurrencias del anterior y deja el vínculo.
    anteriores = ConvenioPago.objects.filter(
        ciclos__in=ciclos, estado=ConvenioPago.INCUMPLIDO,
        recargos_detenidos_en__isnull=True,
    ).exclude(pk=convenio.pk).distinct()
    from .recargos_convenio import liquidar_recargos_antes_de_cierre
    # PostgreSQL no admite FOR UPDATE sobre un SELECT DISTINCT.
    anteriores_bloqueados = ConvenioPago.objects.select_for_update().filter(
        pk__in=anteriores.values('pk'),
    ).order_by('pk')
    for anterior in anteriores_bloqueados:
        liquidar_recargos_antes_de_cierre(anterior, momento=momento)
        anterior.reemplazado_por = convenio
        anterior.recargos_detenidos_en = momento
        anterior.motivo_detencion_recargos = 'renegociado'
        anterior.save(update_fields=[
            'reemplazado_por', 'recargos_detenidos_en', 'motivo_detencion_recargos',
        ])
    return convenio


def _reanudar_pausados_por_convenio(convenio, usuario=None, hoy=None):
    for c in convenio.ciclos.all():
        if c.estado == CicloCobranza.PAUSADA and c.motivo_pausa == 'convenio':
            reanudar_ciclo(c, usuario, hoy)


@transaction.atomic
def marcar_cuota_pagada(cuota, usuario):
    # Mismo orden de bloqueo que el job: convenio antes de sus cuotas.
    convenio = ConvenioPago.objects.select_for_update().get(pk=cuota.convenio_id)
    cuota = CuotaConvenio.objects.select_for_update().get(pk=cuota.pk)
    if convenio.estado not in (ConvenioPago.VIGENTE, ConvenioPago.INCUMPLIDO) or convenio.reemplazado_por_id:
        raise AccionInvalida('El convenio no admite nuevos pagos.')
    if cuota.pagada:
        raise AccionInvalida('La cuota ya está pagada.')
    ahora = timezone.now()
    from .recargos_convenio import liquidar_recargos_antes_de_cierre
    liquidar_recargos_antes_de_cierre(convenio, momento=ahora, pago_en_fecha=True)
    # El generador puede haber detenido automáticamente por tope/máximo.
    convenio.refresh_from_db()
    cuota.pagada, cuota.pagada_en = True, ahora
    cuota.save(update_fields=['pagada', 'pagada_en'])
    for c in convenio.ciclos.all():
        _evento(c, 'cuota_convenio_pagada', usuario, convenio=convenio.id, cuota=cuota.numero)
    if not convenio.cuotas.filter(pagada=False).exists():
        convenio.estado = ConvenioPago.CUMPLIDO
        convenio.finalizado_en = ahora
        if convenio.incumplido_en and not convenio.recargos_detenidos_en:
            convenio.recargos_detenidos_en = ahora
            convenio.recargos_detenidos_por = usuario
            convenio.motivo_detencion_recargos = 'cumplido'
        convenio.save(update_fields=[
            'estado', 'finalizado_en', 'recargos_detenidos_en',
            'recargos_detenidos_por', 'motivo_detencion_recargos',
        ])
        _cerrar_intervalo_exoneracion(convenio, ahora, 'cumplido')
        _reanudar_pausados_por_convenio(convenio, usuario)
    elif convenio.estado == ConvenioPago.INCUMPLIDO:
        hoy = timezone.localdate(ahora)
        if not convenio.cuotas.filter(pagada=False, fecha__lt=hoy).exists():
            convenio.estado = ConvenioPago.VIGENTE
            convenio.finalizado_en = None
            convenio.recargos_detenidos_en = ahora
            convenio.recargos_detenidos_por = usuario
            convenio.motivo_detencion_recargos = 'regularizado'
            convenio.save(update_fields=[
                'estado', 'finalizado_en', 'recargos_detenidos_en',
                'recargos_detenidos_por', 'motivo_detencion_recargos',
            ])
            _abrir_intervalo_exoneracion(convenio, ahora)
            for c in convenio.ciclos.all():
                if c.estado != CicloCobranza.PAUSADA:
                    pausar_ciclo(c, 'convenio', usuario)
                _evento(c, 'convenio_regularizado', usuario, convenio=convenio.id)


@transaction.atomic
def cancelar_convenio(convenio, usuario, momento=None):
    convenio = ConvenioPago.objects.select_for_update().get(pk=convenio.pk)
    if convenio.estado != ConvenioPago.VIGENTE:
        raise AccionInvalida('El convenio no está vigente.')
    momento = momento or timezone.now()
    convenio.estado = ConvenioPago.CANCELADO
    convenio.finalizado_en = momento
    convenio.save(update_fields=['estado', 'finalizado_en'])
    _cerrar_intervalo_exoneracion(convenio, convenio.finalizado_en, 'cancelado')
    _reanudar_pausados_por_convenio(convenio, usuario)


@transaction.atomic
def incumplir_convenio(convenio, momento=None):
    convenio = ConvenioPago.objects.select_for_update().get(pk=convenio.pk)
    if convenio.estado != ConvenioPago.VIGENTE:
        return False
    momento = momento or timezone.now()
    convenio.estado = ConvenioPago.INCUMPLIDO
    convenio.incumplido_en = momento
    convenio.finalizado_en = momento
    if convenio.motivo_detencion_recargos == 'regularizado':
        convenio.recargos_detenidos_en = None
        convenio.recargos_detenidos_por = None
        convenio.motivo_detencion_recargos = ''
    convenio.save(update_fields=[
        'estado', 'incumplido_en', 'finalizado_en', 'recargos_detenidos_en',
        'recargos_detenidos_por', 'motivo_detencion_recargos',
    ])
    _cerrar_intervalo_exoneracion(convenio, momento, 'incumplido')
    for c in convenio.ciclos.all():
        _evento(c, 'convenio_incumplido', None, convenio=convenio.id)
    _reanudar_pausados_por_convenio(convenio, None, timezone.localdate(momento))
    if convenio.aplicar_recargo_incumplimiento:
        from .recargos_convenio import generar_recargos_convenio
        generar_recargos_convenio(
            convenio.id, fecha_referencia=timezone.localdate(momento), momento=momento,
        )
    return True


@transaction.atomic
def revisar_convenios(hoy=None, momento=None):
    """
    Tarea diaria: un convenio vigente con una cuota vencida sin pagar pasa a
    'incumplido' y sus deudas vuelven al ciclo en su etapa. Devuelve cuántos.
    """
    hoy = hoy or timezone.localdate()
    momento = momento or timezone.now()
    incumplidos = 0
    for convenio in ConvenioPago.objects.filter(
            estado=ConvenioPago.VIGENTE, cuotas__pagada=False, cuotas__fecha__lt=hoy).distinct():
        if incumplir_convenio(convenio, momento=momento):
            incumplidos += 1
    return incumplidos


# ── Bandeja "Atención requerida hoy" ───────────────────────────────────────────

def _razon(razones, texto, puntos):
    if puntos > 0:
        razones.append({'texto': texto, 'puntos': puntos})


def _accion_sugerida(f):
    """Primera regla que aplica, de la más urgente a la más general."""
    if f['respuesta_pendiente']:
        codigo = 'responder'
    elif f['pago_viejo']:
        codigo = 'revisar_pago'
    elif f['incumplido']:
        codigo = 'renegociar'
    elif f['fallido']:
        codigo = 'verificar_contacto'
    elif f['cuota_proxima']:
        codigo = 'recordar_cuota'
    elif f['dias_max'] >= 30 or f['deudas'] >= 3:
        codigo = 'ofrecer_convenio'
    elif f['sin_respuesta']:
        codigo = 'llamar'
    else:
        codigo = 'enviar_recordatorio'
    return {'codigo': codigo, 'texto': ACCIONES_SUGERIDAS[codigo]}


def _respuestas_sin_contestar(por_rep, ahora):
    """
    Representantes que escribieron por WhatsApp en los últimos días y no tienen
    una gestión humana posterior (toda gestión actualiza `ultima_accion_en`).
    """
    from notificaciones.models import NotificacionLog
    from notificaciones.whatsapp_entrante import TIPO_ENTRANTE
    cedula_a_rep = {ciclos[0].mensualidad.alumno.representante.cedula: rep_id for rep_id, ciclos in por_rep.items()}
    ultima = {}
    for cedula, fecha in NotificacionLog.objects.filter(
            tipo=TIPO_ENTRANTE, representante_cedula__in=cedula_a_rep,
            fecha_envio__gte=ahora - timedelta(days=DIAS_RESPUESTA_PENDIENTE)
    ).values_list('representante_cedula', 'fecha_envio'):
        ultima[cedula] = max(fecha, ultima.get(cedula, fecha))
    pendientes = set()
    for cedula, fecha in ultima.items():
        rep_id = cedula_a_rep[cedula]
        if not any(c.ultima_accion_en and c.ultima_accion_en > fecha for c in por_rep[rep_id]):
            pendientes.add(rep_id)
    return pendientes


def calcular_bandeja(ciclos_qs, hoy=None, ahora=None):
    """
    Una fila por representante con su puntuación y las razones que la forman
    (todas visibles en la UI). `ciclos_qs` ya viene filtrado por sedes/permisos.
    """
    from portal.models import ComprobantePago
    from .saldos_recargos_convenio import items_penalidades_convenio
    from .recargos import precargar_contexto_recargos, resolver_recargo
    hoy = hoy or timezone.localdate()
    ahora = ahora or timezone.now()
    abiertos = list(
        # `mensualidad__pagado=False`: defensa en la lectura. Un pago que no pasó
        # por save() (update masivo) no dispara el cierre del ciclo.
        ciclos_qs.filter(
            estado__in=CicloCobranza.ESTADOS_ABIERTOS,
            mensualidad__pagado=False,
            mensualidad__alumno__activo=True,
        )
        .exclude(mensualidad__alumno__estatus_financiero='becado')
        .select_related('mensualidad__alumno__representante', 'responsable')
        .prefetch_related('mensualidad__lineas_recargo'))
    contexto_recargos = precargar_contexto_recargos([c.mensualidad for c in abiertos])
    por_rep = {}
    for c in abiertos:
        por_rep.setdefault(c.mensualidad.alumno.representante_id, []).append(c)
    # La deuda del convenio se imputa una sola vez al alumno ancla canónico.
    # El ámbito conserva ciclos cerrados para localizar esa deuda aun cuando
    # todo el principal ya esté pagado; nunca los incorpora a la cartera.
    alumno_ids = ciclos_qs.values_list('mensualidad__alumno_id', flat=True).distinct()
    penalidades_por_rep = {}
    for item in items_penalidades_convenio(alumno_ids=alumno_ids, hoy=hoy):
        penalidades_por_rep.setdefault(item['representante_id'], []).append(item)
    contexto_penalidades = {}
    if penalidades_por_rep:
        alumnos_ancla = {item['alumno_id'] for items in penalidades_por_rep.values() for item in items}
        for ciclo in ciclos_qs.filter(mensualidad__alumno_id__in=alumnos_ancla).select_related(
                'mensualidad__alumno__representante'):
            rep_id = ciclo.mensualidad.alumno.representante_id
            contexto_penalidades.setdefault(rep_id, ciclo.mensualidad.alumno.representante)
            por_rep.setdefault(rep_id, [])
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
    respuestas = _respuestas_sin_contestar({rep_id: ciclos for rep_id, ciclos in por_rep.items() if ciclos}, ahora)
    proximos = set(CuotaConvenio.objects.filter(
        convenio__representante_id__in=ids, convenio__estado=ConvenioPago.VIGENTE, pagada=False,
        fecha__lte=hoy + timedelta(days=3)).values_list('convenio__representante_id', flat=True))

    filas = []
    for rep_id, ciclos in por_rep.items():
        # Lo tomado por una persona sigue en la bandeja: la pausa solo calla al bot.
        tomados = [c for c in ciclos if c.motivo_pausa == MOTIVO_GESTION_HUMANA]
        activos = [c for c in ciclos if c.estado != CicloCobranza.PAUSADA] + tomados
        # Mora calculada hoy desde el vencimiento (la etapa guardada se pone al
        # día en la corrida diaria y puede ir atrasada).
        morosos = [c for c in activos if dias_de_mora(c.fecha_vencimiento, hoy) >= 0]
        # Saldo y número de deudas: solo lo ya vencido. Los ciclos de cuotas de
        # meses futuros inflaban el saldo del caso con deuda que aún no existe.
        # Solo las deudas vencidas y activas forman la cartera. Si el caso entró
        # por otra señal (p. ej. un comprobante viejo), no se sustituyen por
        # cuotas futuras: eso inflaba artificialmente saldo, cantidad y puntaje.
        # Las pausas por reclamo/convenio tampoco deben contaminar otra deuda
        # activa del mismo representante; el takeover humano sí sigue visible.
        cartera = [c for c in activos if dias_de_mora(c.fecha_vencimiento, hoy) >= 0]
        razones = []
        dias_max = max((dias_de_mora(c.fecha_vencimiento, hoy) for c in morosos), default=0)
        _razon(razones, f'Mora de {dias_max} días', min(dias_max, 30))
        if dias_max >= 30:
            _razon(razones, 'Más de 30 días de mora', 20)
        _razon(razones, f'{len(cartera)} mensualidades pendientes', 5 * (len(cartera) - 1))
        saldo_principal = sum((_saldo(c) for c in cartera), Decimal('0.00'))
        penalidades = penalidades_por_rep.get(rep_id, [])
        total_penalidades = sum((item['monto_usd'] for item in penalidades), Decimal('0.00'))
        total_recargos_normales = sum((
            (resolver_recargo(c.mensualidad, hoy, _cache_reglas=contexto_recargos) or {}).get('monto_usd', Decimal('0.00'))
            for c in cartera), Decimal('0.00'))
        saldo = saldo_principal + total_recargos_normales + total_penalidades
        _razon(razones, f'Saldo total ${saldo}', min(20, int(saldo // 10)))
        if any(0 < c.mensualidad.monto_pagado < c.mensualidad.monto_usd for c in cartera):
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
        if rep_id in respuestas:
            _razon(razones, 'Respondió por WhatsApp y nadie le ha contestado', 25)

        requiere_atencion = bool(
            morosos or rep_id in pagos_viejos or rep_id in fallidos
            or rep_id in incumplidos or rep_id in proximos or rep_id in respuestas
            or total_penalidades > 0)
        if not requiere_atencion:
            continue
        rep = ciclos[0].mensualidad.alumno.representante if ciclos else contexto_penalidades[rep_id]
        responsable = next((c.responsable for c in ciclos if c.responsable_id), None)
        filas.append({
            'representante': {'id': rep.id, 'nombre': f'{rep.nombre} {rep.apellido}',
                              'cedula': rep.cedula, 'telefono': rep.telefono},
            'puntaje': sum(r['puntos'] for r in razones),
            'razones': razones,
            'saldo_total_usd': str(saldo),
            'saldo_principal_usd': str(saldo_principal),
            'total_recargos_normales_usd': str(total_recargos_normales),
            'total_penalidades_convenio_usd': str(total_penalidades),
            'penalidades_convenio': penalidades,
            'dias_mora_max': dias_max,
            'ciclos': [c.id for c in cartera],
            'estados': sorted({c.estado for c in cartera}),
            'responsable': responsable.get_username() if responsable else None,
            'gestion_humana': bool(tomados),
            'accion_sugerida': ({'codigo': 'ver_convenios', 'texto': 'Revisar penalidades del convenio'}
                                if not cartera and total_penalidades > 0 else _accion_sugerida({
                'respuesta_pendiente': rep_id in respuestas, 'pago_viejo': rep_id in pagos_viejos, 'incumplido': rep_id in incumplidos,
                'fallido': rep_id in fallidos, 'cuota_proxima': rep_id in proximos,
                'dias_max': dias_max, 'deudas': len(cartera),
                'sin_respuesta': rep_id in avisos_viejos and bool(morosos),
            })),
        })
    return sorted(filas, key=lambda f: (-f['puntaje'], f['representante']['nombre']))


def actualizar_proximas_acciones(ciclos_qs, hoy=None):
    """
    Tarea diaria: guarda en cada ciclo abierto la acción sugerida de su
    representante (o la limpia si ya no requiere atención). Devuelve cuántos quedaron con acción.
    """
    hoy = hoy or timezone.localdate()
    por_texto = {}
    for fila in calcular_bandeja(ciclos_qs, hoy):
        por_texto.setdefault(fila['accion_sugerida']['texto'], []).extend(fila['ciclos'])
    abiertos = ciclos_qs.filter(estado__in=CicloCobranza.ESTADOS_ABIERTOS)
    con_accion = [i for ids in por_texto.values() for i in ids]
    abiertos.exclude(id__in=con_accion).update(proxima_accion='', proxima_accion_fecha=None)
    for texto, ids in por_texto.items():
        abiertos.filter(id__in=ids).update(proxima_accion=texto, proxima_accion_fecha=hoy)
    return len(con_accion)


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
        'mensualidad__alumno__representante').prefetch_related(
        'mensualidades__alumno__representante')
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
        mensualidades = c.mensualidades_incluidas()
        alumnos = list({m.alumno_id: m.alumno for m in mensualidades}.values())
        a = alumnos[0]
        if sede_ids is not None and a.sede_id not in sede_ids:
            continue
        rep = a.representante
        filas.append({
            'tipo': 'comprobante', 'id': c.id, 'desde': c.fecha_subida,
            'dias_espera': max((ahora - c.fecha_subida).days, 0),
            'monto_usd': str(sum(
                (m.monto_usd - m.monto_pagado for m in mensualidades), Decimal('0.00'))),
            'alumno': ', '.join(f'{alumno.nombre} {alumno.apellido}' for alumno in alumnos),
            'representante': {'id': rep.id, 'nombre': f'{rep.nombre} {rep.apellido}', 'cedula': rep.cedula},
        })
    return sorted(filas, key=lambda f: -f['dias_espera'])
