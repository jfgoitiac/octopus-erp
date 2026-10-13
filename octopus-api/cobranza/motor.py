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

WhatsApp: si la regla tiene `plantilla_meta` (y el proveedor es Meta) el
recordatorio sale como plantilla aprobada con botones de respuesta rápida (Ya
pagué / Necesito un acuerdo / Hablar con alguien; ver `flujo_botones`), lo que
permite escribir fuera de la ventana de 24 h. Sin `plantilla_meta` se envía
texto libre por el proveedor configurado, como siempre.
"""
import logging
from datetime import date, timedelta
from decimal import Decimal
from html import escape

from django.db import IntegrityError, transaction
from django.utils import timezone

from .ciclos import dias_de_mora
from .control_envios import (  # noqa: F401  (re-exportados: los usan pruebas y otros módulos)
    DIAS_PERMITIDOS, HORA_FIN, HORA_INICIO, MAX_MENSAJES_SEMANA, canales_deseados,
    canales_sin_baja, comprobante_whatsapp_pendiente, conversacion_humana, dentro_de_horario,
    hubo_cobro_manual_hoy, mensajes_en_semana, proxima_ventana, tiene_pago_en_revision,
)
from .inteligente import corte_global_activo, obtener_configuracion
from .models import (
    CicloCobranza, EnvioCobranza, EventoCiclo, ReglaCobranza,
)
from .perfil_pagador import PAGA_TARDE, perfiles_de

logger = logging.getLogger(__name__)

# ── Límites de contacto (valores por defecto de la Fase 0) ─────────────────────
# Viven en control_envios (puerta única de §1.8); aquí solo los de reintentos.
MAX_INTENTOS = 3
ESPERA_REINTENTO = (timedelta(hours=1), timedelta(hours=4))  # tras 1.er y 2.º fallo

_GRAVEDAD_ETAPA = {
    ReglaCobranza.ETAPA_PREVENTIVA: 0,
    ReglaCobranza.ETAPA_TEMPRANA: 1,
    ReglaCobranza.ETAPA_PRIORITARIA: 2,
}

# Día del recordatorio extra para el perfil "Paga tarde" (fase D, opcional por regla).
DIA_RECORDATORIO_EXTRA = -3

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


def _regla_extra(reglas):
    """Regla con el recordatorio extra en −3 (si no hay regla propia en ese día)."""
    if DIA_RECORDATORIO_EXTRA in reglas:
        return None
    for r in sorted(reglas.values(), key=lambda r: r.dia_relativo):
        if (r.recordatorio_extra_paga_tarde and r.destinatario == 'representante'
                and r.canal != 'interno'):
            return r
    return None


def es_recordatorio_extra(items, hoy):
    """True si el candidato salió por el recordatorio extra en −3 y no por el día de su regla."""
    return any(dias_de_mora(c.fecha_vencimiento, hoy) != r.dia_relativo for c, r in items)


VARIANTE_A, VARIANTE_B = 'A', 'B'


def variante_para(rep, regla):
    """
    Variante A/B de la regla para el representante (v4 fase D): '' si la regla no tiene dos
    plantillas de Meta o no es un aviso por WhatsApp al representante. La asignación es
    estable y alterna por representante (id impar = A, id par = B): el mismo representante
    ve siempre la misma variante.
    """
    if (regla.destinatario != 'representante' or regla.canal not in ('whatsapp', 'ambos')
            or not regla.plantilla_meta or not regla.plantilla_meta_b):
        return ''
    return VARIANTE_A if rep.id % 2 else VARIANTE_B


def plantilla_meta_de(regla, variante):
    """Nombre de la plantilla de Meta que corresponde a la variante del envío."""
    if variante == VARIANTE_B and regla.plantilla_meta_b:
        return regla.plantilla_meta_b
    return regla.plantilla_meta


def _modulo_efectivo(cfg):
    return cfg.activo and not corte_global_activo()


def _envia_de_verdad(cfg, regla):
    return (not cfg.modo_sombra) and regla.etapa in (cfg.etapas_envio_activas or [])


def _saldo(ciclo):
    m = ciclo.mensualidad
    return m.monto_usd - m.monto_pagado


# ── Evaluación diaria ─────────────────────────────────────────────────────────

def _candidatos(sede_id, hoy):
    """
    [(rep, regla, items)] de lo que corresponde HOY en la sede: una fila por
    representante con la regla más avanzada entre sus deudas. Solo lectura.
    """
    reglas = _reglas_de_sede(sede_id)
    if not reglas:
        return []
    ciclos = (
        CicloCobranza.objects.filter(
            mensualidad__alumno__sede_id=sede_id,
            estado__in=[e for e in CicloCobranza.ESTADOS_ABIERTOS if e != CicloCobranza.PAUSADA])
        .select_related('mensualidad__alumno__representante')
    )
    ciclos = list(ciclos)
    extra = _regla_extra(reglas)
    perfiles = {}
    if extra is not None:
        # Solo se clasifica a quienes tienen una deuda que vence en 3 días.
        reps_extra = {c.mensualidad.alumno.representante_id for c in ciclos
                      if dias_de_mora(c.fecha_vencimiento, hoy) == DIA_RECORDATORIO_EXTRA}
        perfiles = perfiles_de(reps_extra, hoy)
    por_representante = {}
    for ciclo in ciclos:
        # dias_de_mora = hoy - vencimiento: coincide con dia_relativo tal cual.
        dias = dias_de_mora(ciclo.fecha_vencimiento, hoy)
        regla = reglas.get(dias)
        if (regla is None and extra is not None and dias == DIA_RECORDATORIO_EXTRA
                and perfiles.get(ciclo.mensualidad.alumno.representante_id) == PAGA_TARDE):
            regla = extra
        if regla is None or _saldo(ciclo) < regla.saldo_minimo:
            continue
        rep = ciclo.mensualidad.alumno.representante
        por_representante.setdefault(rep.id, {'rep': rep, 'items': []})['items'].append((ciclo, regla))

    resultado = []
    for datos in por_representante.values():
        items = datos['items']
        # Si hay deudas en etapas distintas manda la más avanzada.
        regla = max((r for _, r in items), key=lambda r: (_GRAVEDAD_ETAPA[r.etapa], r.dia_relativo))
        resultado.append((datos['rep'], regla, items))
    return resultado


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

    for rep, regla, items in _candidatos(sede_id, hoy):
        # Un solo mensaje por representante y día.
        if EnvioCobranza.objects.filter(representante=rep, fecha=hoy).exists():
            resumen['repetidos'] += 1
            continue
        real = _envia_de_verdad(cfg, regla)
        detalle = {
            'ciclos': [c.id for c, _ in items],
            'saldo_total': str(sum((_saldo(c) for c, _ in items), Decimal('0.00'))),
            # saldo de cada ciclo al crear el envío: base del reporte A/B (lo recuperado a 7 días)
            'saldos': {str(c.id): str(_saldo(c)) for c, _ in items},
            'dia_relativo': regla.dia_relativo,
        }
        if es_recordatorio_extra(items, hoy):
            detalle['dia_relativo'] = DIA_RECORDATORIO_EXTRA
            detalle['extra'] = 'paga_tarde'
        try:
            with transaction.atomic():
                EnvioCobranza.objects.create(
                    representante=rep, regla=regla, fecha=hoy, canal=regla.canal,
                    variante=variante_para(rep, regla),
                    estado=EnvioCobranza.PENDIENTE if real else EnvioCobranza.SIMULADO,
                    detalle=detalle)
        except IntegrityError:
            resumen['repetidos'] += 1
            continue
        resumen['creados' if real else 'simulados'] += 1
    return resumen


def simular_reglas_sede(sede_id, fecha=None, ahora=None):
    """
    Evaluación EN SECO del motor (v4 §1.2 / §2.4): qué saldría en `fecha` con las
    mismas reglas que `evaluar_reglas_sede`, sin crear ningún registro. Para cada
    caso informa si saldría de verdad, si solo se simularía (modo sombra / etapa
    apagada), si ya existe el envío de ese día o si alguna verificación lo
    omitiría. El horario no se evalúa: el motor siempre reprograma al horario
    permitido. Solo ve las deudas que existen hoy: las mensualidades futuras
    que aún no se generaron no aparecen.
    """
    from .control_envios import ORIGEN_MOTOR, puede_enviar_cobro
    fecha = fecha or date.today()
    ahora = ahora or timezone.now()
    cfg = obtener_configuracion(sede_id)
    if not _modulo_efectivo(cfg):
        return []
    filas = []
    for rep, regla, items in _candidatos(sede_id, fecha):
        existente = EnvioCobranza.objects.filter(representante=rep, fecha=fecha).first()
        ciclos = [c for c, _ in items]
        if existente:
            estado, motivos = 'ya_creado', []
        elif not _envia_de_verdad(cfg, regla):
            estado, motivos = 'solo_simulado', []
        else:
            veredicto = puede_enviar_cobro(rep, regla.canal, ORIGEN_MOTOR, ahora, ciclos,
                                           ignorar_horario=True)
            motivos = [b['codigo'] for b in veredicto.bloqueos]
            estado = 'se_omitiria' if motivos else 'saldria'
        filas.append({
            'sede': sede_id, 'estado': estado, 'motivos_omision': motivos,
            'representante': {'id': rep.id, 'nombre': f'{rep.nombre} {rep.apellido}',
                              'cedula': rep.cedula},
            'regla': {'id': regla.id, 'nombre': regla.nombre, 'dia_relativo': regla.dia_relativo,
                      'etapa': regla.etapa, 'plantilla': regla.plantilla,
                      'destinatario': regla.destinatario},
            'canal': regla.canal,
            'saldo_total_usd': str(sum((_saldo(c) for c in ciclos), Decimal('0.00'))),
            'ciclos': [c.id for c in ciclos],
            'envio_existente': existente.id if existente else None,
            'recordatorio_extra': es_recordatorio_extra(items, fecha),
            'variante': variante_para(rep, regla),
        })
    return filas


# ── Verificaciones justo antes de enviar ───────────────────────────────────────

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
        elif tiene_pago_en_revision(c):
            descartados.append((c, 'pago_en_revision'))
        else:
            vigentes.append(c)
    return vigentes, descartados


def _canales_permitidos(regla, rep):
    deseados = canales_deseados(regla.canal)
    if regla.destinatario != 'representante':
        return deseados  # los avisos al director no dependen de la baja del representante
    return canales_sin_baja(deseados, rep)


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


# Plantillas de texto válidas para una regla (las usa el CRUD de reglas).
PLANTILLAS_TEXTO = tuple(_INTROS)


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
        cierre = (f"\n\nPuede pagar desde el portal: {cfg['link_pago']}"
                  "\nSi ya realizó el pago, ignore este mensaje.")
    texto = f"{saludo} {intro}\n" + "\n".join(lineas) + f"\n\nTotal: {monto_txt}{nota}{cierre}"
    return _ASUNTOS.get(regla.plantilla, 'Aviso de pago'), texto


def _html(texto):
    return '<p>' + escape(texto).replace('\n\n', '</p><p>').replace('\n', '<br>') + '</p>'


def _parametros_plantilla(rep, ciclos):
    """
    Variables posicionales del cuerpo de las plantillas de cobro de Meta (v4 §6):
    {{1}} nombre, {{2}} alumnos, {{3}} saldo USD, {{4}} referencia en Bs (tasa de
    AHORA), {{5}} vencimiento más próximo, {{6}} link al portal (sección de pago).
    """
    from notificaciones.services import _config_colegio, montos_ref
    total = sum((_saldo(c) for c in ciclos), Decimal('0.00'))
    alumnos = sorted({f'{c.mensualidad.alumno.nombre} {c.mensualidad.alumno.apellido}' for c in ciclos})
    vence = min(c.fecha_vencimiento for c in ciclos)
    return [
        rep.nombre,
        ', '.join(alumnos[:-1]) + ' y ' + alumnos[-1] if len(alumnos) > 1 else ''.join(alumnos),
        f'{total:.2f}',
        montos_ref(total)['monto_bs'] or '-',
        vence.strftime('%d/%m/%Y'),
        _config_colegio()['link_pago'],
    ]


def _enviar_whatsapp(telefono, texto, rep, envio=None, registrar=True, regla=None, ciclos=(), variante=''):
    from notificaciones import conversaciones
    from notificaciones.services import _proveedor_whatsapp, enviar_whatsapp, pop_ultimo_wa_message_id
    from .flujo_botones import BOTONES_RECORDATORIO
    plantilla = plantilla_meta_de(regla, variante) if (regla and regla.destinatario == 'representante') else ''
    template_data = None
    if plantilla and ciclos and _proveedor_whatsapp() == 'meta':
        template_data = {'nombre': plantilla, 'idioma': 'es', 'botones': list(BOTONES_RECORDATORIO),
                         'parametros': _parametros_plantilla(rep, ciclos)}
    ok = bool(enviar_whatsapp(telefono, texto, tipo='cobranza_inteligente',
                              representante_cedula=rep.cedula, template_data=template_data))
    wa_id = pop_ultimo_wa_message_id()
    if ok and registrar:
        # El saliente queda en la conversación del número (v4 §2.3); nunca rompe el envío.
        extra = {}
        if template_data:
            extra = {'plantilla': plantilla, 'idioma': 'es', 'parametros': template_data['parametros'],
                     'botones': template_data['botones']}
            if variante:
                extra['variante'] = variante
        conversaciones.registrar_saliente_cobro(
            rep, telefono, texto, 'motor', envio=envio, wa_message_id=wa_id,
            tipo='plantilla' if template_data else 'texto', payload_extra=extra)
    return ok


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

    # Los cobros manuales registrados (solo existen con el toggle encendido)
    # cuentan para el tope semanal y para "un solo mensaje por día" (§1.8).
    if regla.destinatario == 'representante' and mensajes_en_semana(rep, ahora) >= MAX_MENSAJES_SEMANA:
        _omitir(envio, 'limite_semanal', vigentes)
        return envio.estado
    if regla.destinatario == 'representante' and hubo_cobro_manual_hoy(rep, ahora):
        _omitir(envio, 'cobro_manual_hoy', vigentes)
        return envio.estado

    # Conversación tomada por el cobrador / comprobante recibido por WhatsApp (ver control_envios).
    if regla.destinatario == 'representante' and conversacion_humana(rep):
        _omitir(envio, 'conversacion_humana', vigentes)
        return envio.estado
    if regla.destinatario == 'representante' and comprobante_whatsapp_pendiente(rep):
        _omitir(envio, 'comprobante_pendiente', vigentes)
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
        resultados.append(_enviar_whatsapp(telefono, texto, rep, envio,
                                           registrar=regla.destinatario == 'representante',
                                           regla=regla, ciclos=vigentes, variante=envio.variante))
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
