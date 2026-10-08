"""
Motor de reglas y envíos de Cobranza Inteligente
(PLAN_COBRANZA_INTELIGENTE.md, Fase 2).

Flujo (una sola vía, sin tareas agendadas a futuro):

  evaluar_reglas_sede(sede, hoy)   -> crea EnvioCobranza (estado 'pendiente' o
                                      'simulado') agrupando por representante
  procesar_envios(ahora)           -> aplica las verificaciones JUSTO ANTES de
                                      enviar y envía (o omite / reintenta)

Garantías: un aviso por (representante, regla, día) por clave única; un solo
mensaje por representante y día; nada sale con el módulo apagado, en modo
sombra, fuera de horario, sobre deudas saldadas o con pagos en revisión.

WhatsApp: hoy se envía texto libre por el proveedor ya configurado. Dejado
listo para conectar plantillas aprobadas por Meta (necesarias fuera de la
ventana de 24 h): `notificaciones.services.enviar_whatsapp` ya acepta
`template_data`; ver TODO_META_TEMPLATES en `_enviar_whatsapp`.
"""
import logging
from datetime import date, timedelta
from decimal import Decimal
from html import escape

from django.db import IntegrityError, transaction
from django.utils import timezone

from .ciclos import dias_de_mora
from .inteligente import corte_global_activo, obtener_configuracion
from .models import (
    BajaCobranza, CicloCobranza, EnvioCobranza, EventoCiclo, Pago, ReglaCobranza,
)

logger = logging.getLogger(__name__)

# ── Límites de contacto (valores por defecto de la Fase 0) ─────────────────────
HORA_INICIO = 8            # 08:00
HORA_FIN = 19              # hasta las 19:00 (exclusivo)
DIAS_PERMITIDOS = range(0, 6)  # lunes a sábado (weekday 0-5)
MAX_MENSAJES_SEMANA = 3
MAX_INTENTOS = 3
ESPERA_REINTENTO = (timedelta(hours=1), timedelta(hours=4))  # tras 1.er y 2.º fallo

_GRAVEDAD_ETAPA = {
    ReglaCobranza.ETAPA_PREVENTIVA: 0,
    ReglaCobranza.ETAPA_TEMPRANA: 1,
    ReglaCobranza.ETAPA_PRIORITARIA: 2,
}

# Reglas por defecto (tabla del plan, Fase 2 / semana 5)
REGLAS_POR_DEFECTO = (
    # dia, nombre, etapa, canal, plantilla, destinatario
    (-5, 'Recordatorio preventivo', 'preventiva', 'ambos', 'preventivo', 'representante'),
    (-1, 'Aviso de vencimiento cercano', 'preventiva', 'whatsapp', 'vence_manana', 'representante'),
    (0, 'Aviso de vencimiento', 'preventiva', 'ambos', 'vence_hoy', 'representante'),
    (3, 'Seguimiento cordial', 'temprana', 'whatsapp', 'seguimiento_1', 'representante'),
    (7, 'Segundo seguimiento', 'temprana', 'ambos', 'seguimiento_2', 'representante'),
    (15, 'Cobranza prioritaria', 'prioritaria', 'whatsapp', 'prioritaria', 'representante'),
    (30, 'Caso crítico: aviso al director', 'prioritaria', 'ambos', 'critico_director', 'director'),
)


def crear_reglas_por_defecto(sede_id):
    """Crea las reglas por defecto de una sede si todavía no tiene ninguna."""
    if ReglaCobranza.objects.filter(sede_id=sede_id).exists():
        return 0
    ReglaCobranza.objects.bulk_create([
        ReglaCobranza(sede_id=sede_id, nombre=n, etapa=e, dia_relativo=d,
                      canal=c, plantilla=p, destinatario=dest)
        for d, n, e, c, p, dest in REGLAS_POR_DEFECTO
    ])
    return len(REGLAS_POR_DEFECTO)


def _reglas_de_sede(sede_id):
    """{dia_relativo: regla}. Las reglas propias de la sede reemplazan a las globales."""
    propias = ReglaCobranza.objects.filter(sede_id=sede_id, activa=True)
    if not propias.exists() and sede_id is not None:
        propias = ReglaCobranza.objects.filter(sede__isnull=True, activa=True)
    return {r.dia_relativo: r for r in propias}


def _modulo_efectivo(cfg):
    return cfg.activo and not corte_global_activo()


def _envia_de_verdad(cfg, regla):
    return (not cfg.modo_sombra) and regla.etapa in (cfg.etapas_envio_activas or [])


def _saldo(ciclo):
    m = ciclo.mensualidad
    return m.monto_usd - m.monto_pagado


# ── Evaluación diaria ─────────────────────────────────────────────────────────

def evaluar_reglas_sede(sede_id, hoy=None):
    """
    Crea los EnvioCobranza que corresponden HOY (coincidencia exacta del día
    relativo: nunca avisos atrasados). Idempotente. Devuelve contadores.
    """
    hoy = hoy or date.today()
    cfg = obtener_configuracion(sede_id)
    resumen = {'creados': 0, 'simulados': 0, 'repetidos': 0}
    if not _modulo_efectivo(cfg):
        return resumen

    reglas = _reglas_de_sede(sede_id)
    if not reglas:
        return resumen

    ciclos = (
        CicloCobranza.objects.filter(
            mensualidad__alumno__sede_id=sede_id,
            estado__in=[e for e in CicloCobranza.ESTADOS_ABIERTOS if e != CicloCobranza.PAUSADA])
        .select_related('mensualidad__alumno__representante')
    )
    por_representante = {}
    for ciclo in ciclos:
        # dias_de_mora = hoy - vencimiento: coincide con dia_relativo tal cual.
        regla = reglas.get(dias_de_mora(ciclo.fecha_vencimiento, hoy))
        if regla is None or _saldo(ciclo) < regla.saldo_minimo:
            continue
        rep = ciclo.mensualidad.alumno.representante
        por_representante.setdefault(rep.id, {'rep': rep, 'items': []})['items'].append((ciclo, regla))

    for datos in por_representante.values():
        rep, items = datos['rep'], datos['items']
        # Si hay deudas en etapas distintas manda la más avanzada.
        regla = max((r for _, r in items), key=lambda r: (_GRAVEDAD_ETAPA[r.etapa], r.dia_relativo))
        # Un solo mensaje por representante y día.
        if EnvioCobranza.objects.filter(representante=rep, fecha=hoy).exists():
            resumen['repetidos'] += 1
            continue
        real = _envia_de_verdad(cfg, regla)
        detalle = {
            'ciclos': [c.id for c, _ in items],
            'saldo_total': str(sum((_saldo(c) for c, _ in items), Decimal('0.00'))),
            'dia_relativo': regla.dia_relativo,
        }
        try:
            with transaction.atomic():
                EnvioCobranza.objects.create(
                    representante=rep, regla=regla, fecha=hoy, canal=regla.canal,
                    estado=EnvioCobranza.PENDIENTE if real else EnvioCobranza.SIMULADO,
                    detalle=detalle)
        except IntegrityError:
            resumen['repetidos'] += 1
            continue
        resumen['creados' if real else 'simulados'] += 1
    return resumen


# ── Verificaciones justo antes de enviar ───────────────────────────────────────

def dentro_de_horario(ahora):
    local = timezone.localtime(ahora)
    return local.weekday() in DIAS_PERMITIDOS and HORA_INICIO <= local.hour < HORA_FIN


def proxima_ventana(ahora):
    """Primer instante permitido a partir de `ahora`."""
    if dentro_de_horario(ahora):
        return ahora
    local = timezone.localtime(ahora)
    candidato = local.replace(hour=HORA_INICIO, minute=0, second=0, microsecond=0)
    if local >= candidato:
        candidato += timedelta(days=1)
    while candidato.weekday() not in DIAS_PERMITIDOS:
        candidato += timedelta(days=1)
    return candidato


def _tiene_pago_en_revision(ciclo):
    from portal.models import ComprobantePago
    m = ciclo.mensualidad
    return (
        Pago.objects.filter(alumno_id=m.alumno_id, estatus='en_revision').exists()
        or ComprobantePago.objects.filter(mensualidad=m, estatus='pendiente').exists()
    )


def _ciclos_vigentes(envio, regla):
    """Ciclos del envío que siguen abiertos, con saldo suficiente y sin pago en revisión."""
    ciclos = (
        CicloCobranza.objects.filter(id__in=envio.detalle.get('ciclos', []))
        .select_related('mensualidad__alumno')
    )
    vigentes, descartados = [], []
    for c in ciclos:
        if not c.abierto or c.estado == CicloCobranza.PAUSADA or c.mensualidad.pagado:
            descartados.append((c, 'deuda_saldada'))
        elif _saldo(c) < regla.saldo_minimo:
            descartados.append((c, 'saldo_insuficiente'))
        elif _tiene_pago_en_revision(c):
            descartados.append((c, 'pago_en_revision'))
        else:
            vigentes.append(c)
    return vigentes, descartados


def _canales_permitidos(regla, rep):
    deseados = {'whatsapp': ['whatsapp'], 'email': ['email'], 'ambos': ['whatsapp', 'email'],
                'interno': []}[regla.canal]
    if regla.destinatario != 'representante':
        return deseados  # los avisos al director no dependen de la baja del representante
    bajas = set(BajaCobranza.objects.filter(representante=rep).values_list('canal', flat=True))
    return [c for c in deseados if c not in bajas]


def _omitir(envio, motivo, ciclos=()):
    envio.estado = EnvioCobranza.OMITIDO
    envio.motivo_omision = motivo
    envio.proximo_intento = None
    envio.save(update_fields=['estado', 'motivo_omision', 'proximo_intento'])
    EventoCiclo.objects.bulk_create([
        EventoCiclo(ciclo=c, tipo='mensaje_omitido', detalle={'motivo': motivo, 'envio': envio.id})
        for c in ciclos
    ])


# ── Texto del mensaje ──────────────────────────────────────────────────────────

_ASUNTOS = {
    'preventivo': 'Recordatorio: su mensualidad vence pronto',
    'vence_manana': 'Su mensualidad vence mañana',
    'vence_hoy': 'Hoy vence su mensualidad',
    'seguimiento_1': 'Seguimiento de su mensualidad pendiente',
    'seguimiento_2': 'Segundo aviso: mensualidad pendiente',
    'prioritaria': 'Mensualidad vencida: necesitamos su apoyo',
    'critico_director': 'Caso crítico de cobranza',
}
_INTROS = {
    'preventivo': 'Le recordamos que pronto vence el pago de:',
    'vence_manana': 'Mañana vence el pago de:',
    'vence_hoy': 'Hoy vence el pago de:',
    'seguimiento_1': 'Notamos que sigue pendiente el pago de:',
    'seguimiento_2': 'Le escribimos nuevamente: sigue pendiente el pago de:',
    'prioritaria': 'Tenemos pendiente desde hace varios días el pago de:',
    'critico_director': 'Caso con más de 30 días de mora:',
}


def construir_mensaje(rep, ciclos, regla):
    """Asunto y texto plano. El monto en Bs se calcula AHORA con la tasa vigente."""
    from notificaciones.services import _config_colegio, _monto_whatsapp, montos_ref
    cfg = _config_colegio()
    total = sum((_saldo(c) for c in ciclos), Decimal('0.00'))
    montos = montos_ref(total)
    monto_txt = _monto_whatsapp(montos)
    nota = f"\n_{montos['nota_tasa']}_" if montos.get('nota_tasa') else ''
    lineas = [
        f"• {c.mensualidad.alumno.nombre} {c.mensualidad.alumno.apellido}: "
        f"{c.mensualidad.get_mes_display()} {c.mensualidad.anio}"
        for c in ciclos
    ]
    intro = _INTROS.get(regla.plantilla, 'Tiene pagos pendientes:')
    if regla.destinatario == 'director':
        saludo = (f"*{cfg['nombre_colegio']}* — Aviso a dirección\n"
                  f"Representante: {rep.nombre} {rep.apellido} (CI {rep.cedula}, tel. {rep.telefono})")
        cierre = ''
    else:
        saludo = f"*{cfg['nombre_colegio']}*\n\nHola {rep.nombre},"
        cierre = (f"\n\nPuede pagar desde el portal: {cfg['portal_url']}"
                  "\nSi ya realizó el pago, ignore este mensaje.")
    texto = f"{saludo} {intro}\n" + "\n".join(lineas) + f"\n\nTotal: {monto_txt}{nota}{cierre}"
    return _ASUNTOS.get(regla.plantilla, 'Aviso de pago'), texto


def _html(texto):
    return '<p>' + escape(texto).replace('\n\n', '</p><p>').replace('\n', '<br>') + '</p>'


def _enviar_whatsapp(telefono, texto, rep):
    from notificaciones.services import enviar_whatsapp
    # TODO_META_TEMPLATES: al aprobarse las plantillas en Meta, pasar aquí
    # template_data={'nombre': ..., 'idioma': 'es', 'parametros': [...]} para
    # poder escribir fuera de la ventana de 24 h.
    return bool(enviar_whatsapp(telefono, texto, tipo='cobranza_inteligente',
                                representante_cedula=rep.cedula))


def _enviar_email(correo, asunto, texto, rep):
    from notificaciones.services import enviar_email
    return bool(enviar_email(correo, asunto, _html(texto), texto_plano=texto,
                             tipo='cobranza_inteligente', representante_cedula=rep.cedula))


def _destinos(regla, rep):
    """(telefono, correo) del destinatario de la regla."""
    if regla.destinatario == 'director':
        from django.conf import settings
        from notificaciones.services import _notif_cfg
        n = _notif_cfg()
        correo = (n.director_email if n else '') or getattr(settings, 'PORTAL_EMAIL_DIRECTOR', '')
        tel = (n.director_whatsapp if n else '') or getattr(settings, 'DIRECTOR_WHATSAPP', '')
        return tel, correo
    return rep.telefono, rep.correo


# ── Procesamiento ──────────────────────────────────────────────────────────────

def procesar_envio(envio, ahora=None):
    """
    Aplica las verificaciones JUSTO ANTES de enviar y envía, omite o reprograma.
    Devuelve el estado final del envío.
    """
    ahora = ahora or timezone.now()
    regla, rep = envio.regla, envio.representante
    cfg = obtener_configuracion(regla.sede_id)

    if not _modulo_efectivo(cfg):
        envio.estado, envio.motivo_omision = EnvioCobranza.CANCELADO, 'modulo_apagado'
        envio.save(update_fields=['estado', 'motivo_omision'])
        return envio.estado
    if not _envia_de_verdad(cfg, regla):
        # Se apagó el envío real (modo sombra / etapa deshabilitada) tras crearse.
        envio.estado = EnvioCobranza.SIMULADO
        envio.save(update_fields=['estado'])
        return envio.estado
    if not dentro_de_horario(ahora):
        envio.proximo_intento = proxima_ventana(ahora)
        envio.save(update_fields=['proximo_intento'])
        return envio.estado

    vigentes, descartados = _ciclos_vigentes(envio, regla)
    EventoCiclo.objects.bulk_create([
        EventoCiclo(ciclo=c, tipo='mensaje_omitido', detalle={'motivo': motivo, 'envio': envio.id})
        for c, motivo in descartados
    ])
    if not vigentes:
        _omitir(envio, descartados[0][1] if descartados else 'deuda_saldada')
        return envio.estado

    enviados_semana = EnvioCobranza.objects.filter(
        representante=rep, estado=EnvioCobranza.ENVIADO,
        enviado_en__gte=ahora - timedelta(days=7)).count()
    if regla.destinatario == 'representante' and enviados_semana >= MAX_MENSAJES_SEMANA:
        _omitir(envio, 'limite_semanal', vigentes)
        return envio.estado

    if regla.canal == 'interno':
        envio.estado, envio.enviado_en = EnvioCobranza.ENVIADO, ahora
        envio.save(update_fields=['estado', 'enviado_en'])
        EventoCiclo.objects.bulk_create([
            EventoCiclo(ciclo=c, tipo='aviso_interno', detalle={'envio': envio.id}) for c in vigentes])
        return envio.estado
    canales = _canales_permitidos(regla, rep)
    if not canales:
        _omitir(envio, 'baja_voluntaria', vigentes)
        return envio.estado

    telefono, correo = _destinos(regla, rep)
    asunto, texto = construir_mensaje(rep, vigentes, regla)
    resultados = []
    if 'whatsapp' in canales and telefono:
        resultados.append(_enviar_whatsapp(telefono, texto, rep))
    if 'email' in canales and correo:
        resultados.append(_enviar_email(correo, asunto, texto, rep))
    if not resultados:
        _omitir(envio, 'sin_contacto', vigentes)
        return envio.estado

    envio.intentos += 1
    if any(resultados):
        envio.estado, envio.enviado_en, envio.proximo_intento = EnvioCobranza.ENVIADO, ahora, None
        envio.save(update_fields=['estado', 'enviado_en', 'proximo_intento', 'intentos'])
        EventoCiclo.objects.bulk_create([
            EventoCiclo(ciclo=c, tipo='mensaje_enviado',
                        detalle={'envio': envio.id, 'canal': envio.canal, 'regla': regla.dia_relativo})
            for c in vigentes])
    elif envio.intentos >= MAX_INTENTOS:
        envio.estado, envio.proximo_intento = EnvioCobranza.FALLIDO, None
        envio.save(update_fields=['estado', 'proximo_intento', 'intentos'])
        EventoCiclo.objects.bulk_create([
            EventoCiclo(ciclo=c, tipo='mensaje_fallido', detalle={'envio': envio.id}) for c in vigentes])
    else:
        envio.estado = EnvioCobranza.REINTENTO
        envio.proximo_intento = ahora + ESPERA_REINTENTO[min(envio.intentos - 1, len(ESPERA_REINTENTO) - 1)]
        envio.save(update_fields=['estado', 'proximo_intento', 'intentos'])
    return envio.estado


def procesar_envios(ahora=None):
    """Procesa los envíos pendientes o en reintento que ya les toca."""
    ahora = ahora or timezone.now()
    cola = (
        EnvioCobranza.objects.filter(estado__in=EnvioCobranza.ESTADOS_POR_PROCESAR)
        .select_related('regla', 'representante')
    )
    resumen = {}
    for envio in cola:
        if envio.proximo_intento and envio.proximo_intento > ahora:
            continue
        try:
            estado = procesar_envio(envio, ahora)
        except Exception:
            logger.exception('Error procesando el envío de cobranza %s', envio.id)
            continue
        resumen[estado] = resumen.get(estado, 0) + 1
    return resumen


def cancelar_envios_pendientes_sede(sede_id, motivo='modulo_apagado'):
    """Al apagar el módulo: cancela lo que esté por salir."""
    return EnvioCobranza.objects.filter(
        regla__sede_id=sede_id, estado__in=EnvioCobranza.ESTADOS_POR_PROCESAR
    ).update(estado=EnvioCobranza.CANCELADO, motivo_omision=motivo)
