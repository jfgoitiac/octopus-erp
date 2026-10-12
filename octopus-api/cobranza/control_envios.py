"""
Puerta única de los recordatorios de cobro (PLAN_COBRANZA_INTELIGENTE_V4.md §1.8 / §2.3).

Regla: con el toggle de Cobranza Inteligente ENCENDIDO en una sede, todo
mensaje de cobro a familias de esa sede (email o WhatsApp, automático o manual)
pasa por las mismas verificaciones. Con el toggle APAGADO nada de este módulo
se invoca desde el cobro manual: el comportamiento es el de siempre.

Este módulo contiene:
  - las verificaciones que antes vivían dentro de `motor.py` (horario, tope
    semanal, baja voluntaria, pago en revisión), extraídas SIN cambiar su
    comportamiento; el motor las importa de aquí;
  - `puede_enviar_cobro`: veredicto único (bloqueos + avisos) para un envío;
  - `registrar_cobro`: deja el EventoCiclo de un cobro manual (cuenta para el
    tope semanal y para el "un solo mensaje por día");
  - `historial_cobros`: historial unificado con etiqueta de origen.

Ganchos para las fases B y C (conversaciones y comprobantes por WhatsApp):
`conversacion_humana` y `comprobante_whatsapp_pendiente` devuelven False hasta
que existan `ConversacionWhatsApp` / adjuntos entrantes; `_registrar_en_conversacion`
es el punto donde el saliente se anotará en el hilo.
"""
import uuid
from dataclasses import dataclass, field
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from .models import BajaCobranza, CicloCobranza, EnvioCobranza, EventoCiclo, Pago

# ── Límites de contacto (valores por defecto de la Fase 0) ─────────────────────
HORA_INICIO = 8            # 08:00
HORA_FIN = 19              # hasta las 19:00 (exclusivo)
DIAS_PERMITIDOS = range(0, 6)  # lunes a sábado (weekday 0-5)
MAX_MENSAJES_SEMANA = 3

# ── Orígenes de un cobro ───────────────────────────────────────────────────────
ORIGEN_MOTOR = 'motor'
ORIGEN_MANUAL_API = 'manual_api'      # Morosos, Modo B (API con plantilla)
ORIGEN_MANUAL_WAME = 'manual_wame'    # Morosos, Modo A (enlace wa.me)
ORIGENES_MANUALES = (ORIGEN_MANUAL_API, ORIGEN_MANUAL_WAME)
ETIQUETAS_ORIGEN = {
    ORIGEN_MOTOR: 'Automático (Cobranza Inteligente)',
    ORIGEN_MANUAL_API: 'Manual desde Morosos (API)',
    ORIGEN_MANUAL_WAME: 'Manual desde Morosos (wa.me)',
    'aviso_anterior': 'Aviso automático anterior',
}
EVENTO_COBRO_MANUAL = 'cobro_manual'


# ── Primitivas extraídas del motor ─────────────────────────────────────────────

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


def tiene_pago_en_revision(ciclo):
    from portal.models import ComprobantePago
    m = ciclo.mensualidad
    return (
        Pago.objects.filter(alumno_id=m.alumno_id, estatus='en_revision').exists()
        or ComprobantePago.objects.filter(mensualidad=m, estatus='pendiente').exists()
    )


def canales_deseados(canal):
    return {'whatsapp': ['whatsapp'], 'email': ['email'], 'ambos': ['whatsapp', 'email'],
            'interno': []}[canal]


def canales_sin_baja(deseados, rep):
    """Canales deseados en los que el representante NO se dio de baja."""
    bajas = set(BajaCobranza.objects.filter(representante=rep).values_list('canal', flat=True))
    return [c for c in deseados if c not in bajas]


def _inicio_del_dia(ahora):
    local = timezone.localtime(ahora)
    return local.replace(hour=0, minute=0, second=0, microsecond=0)


def _tokens_cobros_manuales(rep, desde):
    """Tokens (un cobro manual = un token) registrados desde `desde`."""
    eventos = EventoCiclo.objects.filter(
        Q(ciclo__mensualidad__alumno__representante=rep)
        | Q(ciclo__isnull=True, detalle__representante=rep.id),
        tipo=EVENTO_COBRO_MANUAL, creado_en__gte=desde,
    ).values_list('id', 'detalle')
    return {d.get('cobro') or f'ev{i}' for i, d in eventos}


def mensajes_en_semana(rep, ahora):
    """Mensajes de cobro de los últimos 7 días: automáticos enviados + cobros manuales registrados."""
    desde = ahora - timedelta(days=7)
    automaticos = EnvioCobranza.objects.filter(
        representante=rep, estado=EnvioCobranza.ENVIADO, enviado_en__gte=desde).count()
    return automaticos + len(_tokens_cobros_manuales(rep, desde))


def hubo_cobro_manual_hoy(rep, ahora):
    return bool(_tokens_cobros_manuales(rep, _inicio_del_dia(ahora)))


def hubo_envio_automatico_hoy(rep, ahora):
    return EnvioCobranza.objects.filter(
        representante=rep, estado=EnvioCobranza.ENVIADO, enviado_en__gte=_inicio_del_dia(ahora)).exists()


# ── Ganchos de las fases B y C ─────────────────────────────────────────────────

def conversacion_humana(rep):
    """Fase B: True si el cobrador tomó la conversación de WhatsApp del representante."""
    return False


def comprobante_whatsapp_pendiente(rep):
    """Fase C: True si el representante envió un comprobante por WhatsApp aún sin resolver."""
    return False


def _registrar_en_conversacion(rep, canal, texto, usuario, origen):
    """Fase B: anotar el saliente en la ConversacionWhatsApp del representante."""
    return None


# ── Veredicto único ────────────────────────────────────────────────────────────

MENSAJES = {
    'fuera_de_horario': 'Fuera del horario permitido de contacto (lunes a sábado, 8:00 a 19:00).',
    'baja_voluntaria': 'El representante se dio de baja de este canal de cobranza.',
    'limite_semanal': f'Ya recibió {MAX_MENSAJES_SEMANA} mensajes de cobro en los últimos 7 días.',
    'pago_en_revision': 'Tiene un pago o comprobante en revisión.',
    'conversacion_humana': 'Su conversación de WhatsApp fue tomada por el cobrador.',
    'comprobante_pendiente': 'Envió un comprobante por WhatsApp que aún no se resuelve.',
    'cobro_automatico_hoy': 'Ya recibió hoy un mensaje automático de cobranza.',
    'cobro_manual_hoy': 'Ya recibió hoy un cobro manual.',
}


@dataclass
class Veredicto:
    bloqueos: list = field(default_factory=list)   # impiden el envío
    avisos: list = field(default_factory=list)     # el usuario puede continuar confirmando

    @property
    def permitido(self):
        return not self.bloqueos

    @property
    def requiere_confirmacion(self):
        return self.permitido and bool(self.avisos)

    def as_dict(self):
        return {'permitido': self.permitido, 'requiere_confirmacion': self.requiere_confirmacion,
                'bloqueos': self.bloqueos, 'avisos': self.avisos}


def _item(codigo):
    return {'codigo': codigo, 'mensaje': MENSAJES[codigo]}


def ciclos_cobrables(rep):
    """Deudas abiertas y activas (no pausadas) del representante."""
    return list(CicloCobranza.objects.filter(
        mensualidad__alumno__representante=rep,
        estado__in=[e for e in CicloCobranza.ESTADOS_ABIERTOS if e != CicloCobranza.PAUSADA],
    ).select_related('mensualidad__alumno'))


def puede_enviar_cobro(representante, canal, origen, ahora=None, ciclos=None, ignorar_horario=False):
    """
    ¿Puede salir un mensaje de cobro a este representante por este canal?

    `origen`:
      - 'motor': todo es BLOQUEO (el motor omite el envío; se usa para la
        simulación en seco).
      - 'manual_api': baja, pago/comprobante en revisión y comprobante por
        WhatsApp son BLOQUEOS; tope semanal, conversación tomada y "ya recibió
        hoy" son AVISOS que el usuario puede confirmar.
      - 'manual_wame': el mensaje lo abre la persona en su teléfono, no se puede
        impedir: todo es AVISO (se advierte antes de abrir wa.me).

    No consulta el toggle: quien llama decide si aplica control (solo con el
    toggle de la sede encendido).
    """
    ahora = ahora or timezone.now()
    ciclos = ciclos_cobrables(representante) if ciclos is None else list(ciclos)
    duros, blandos = [], []

    if origen == ORIGEN_MOTOR and not ignorar_horario and not dentro_de_horario(ahora):
        duros.append('fuera_de_horario')
    deseados = canales_deseados(canal)
    if deseados and not canales_sin_baja(deseados, representante):
        duros.append('baja_voluntaria')
    if ciclos and any(tiene_pago_en_revision(c) for c in ciclos):
        duros.append('pago_en_revision')
    if comprobante_whatsapp_pendiente(representante):
        duros.append('comprobante_pendiente')

    if mensajes_en_semana(representante, ahora) >= MAX_MENSAJES_SEMANA:
        blandos.append('limite_semanal')
    if conversacion_humana(representante):
        (duros if origen == ORIGEN_MOTOR else blandos).append('conversacion_humana')
    if origen in ORIGENES_MANUALES and hubo_envio_automatico_hoy(representante, ahora):
        blandos.append('cobro_automatico_hoy')
    if hubo_cobro_manual_hoy(representante, ahora):
        blandos.append('cobro_manual_hoy')

    if origen == ORIGEN_MOTOR:
        duros, blandos = duros + blandos, []   # el motor no pide confirmación: omite
    elif origen == ORIGEN_MANUAL_WAME:
        blandos = duros + blandos
        duros = []
    return Veredicto(bloqueos=[_item(c) for c in duros], avisos=[_item(c) for c in blandos])


# ── Registro de cobros manuales ────────────────────────────────────────────────

def registrar_cobro(representante, canal, origen, usuario, texto='', ciclos=None, ahora=None,
                    sede_id=None):
    """
    Anota un cobro manual ya enviado: un EventoCiclo por deuda abierta (o uno
    de sede si no hay deudas), todos con el mismo token. Cuenta para el tope
    semanal y para el "un solo mensaje por día" del motor. Los envíos del motor
    ya se registran solos: con origen 'motor' no hace nada.
    """
    if origen not in ORIGENES_MANUALES:
        return None
    ciclos = ciclos_cobrables(representante) if ciclos is None else list(ciclos)
    token = uuid.uuid4().hex
    detalle = {'cobro': token, 'canal': canal, 'origen': origen, 'texto': (texto or '')[:200],
               'representante': representante.id}
    if ciclos:
        EventoCiclo.objects.bulk_create([
            EventoCiclo(ciclo=c, tipo=EVENTO_COBRO_MANUAL, usuario=usuario, detalle=detalle)
            for c in ciclos])
        CicloCobranza.objects.filter(pk__in=[c.pk for c in ciclos]).update(
            ultima_accion_en=ahora or timezone.now())
    else:
        EventoCiclo.objects.create(sede_id=sede_id, tipo=EVENTO_COBRO_MANUAL, usuario=usuario,
                                   detalle=detalle)
    _registrar_en_conversacion(representante, canal, texto, usuario, origen)
    return token


# ── Historial unificado ────────────────────────────────────────────────────────

def historial_cobros(representante, limite=50):
    """
    Todos los mensajes de cobro del representante, sin importar el origen, del
    más reciente al más antiguo, con `origen` y `origen_etiqueta`.
    """
    from notificaciones.models import NotificacionLog
    filas = []
    for e in (EnvioCobranza.objects.filter(representante=representante)
              .exclude(estado__in=(EnvioCobranza.SIMULADO, EnvioCobranza.CANCELADO))
              .select_related('regla')[:limite]):
        filas.append({
            'fecha': e.enviado_en or e.creado_en, 'canal': e.canal, 'estado': e.estado,
            'origen': ORIGEN_MOTOR, 'detalle': e.regla.nombre, 'motivo_omision': e.motivo_omision,
        })
    logs = NotificacionLog.objects.filter(representante_cedula=representante.cedula).filter(
        Q(tipo='cobro_whatsapp') | Q(tipo__startswith='mora_dia_')).order_by('-fecha_envio')[:limite]
    for n in logs:
        if n.tipo == 'cobro_whatsapp':
            origen = ORIGEN_MANUAL_WAME if n.modo == 'manual' else ORIGEN_MANUAL_API
        else:
            origen = 'aviso_anterior'
        filas.append({
            'fecha': n.fecha_envio, 'canal': n.canal, 'estado': n.estado, 'origen': origen,
            'detalle': (n.asunto or n.mensaje or '')[:120], 'motivo_omision': '',
        })
    filas.sort(key=lambda f: f['fecha'], reverse=True)
    for f in filas:
        f['origen_etiqueta'] = ETIQUETAS_ORIGEN[f['origen']]
    return filas[:limite]


# ── Toggle ─────────────────────────────────────────────────────────────────────

def inteligente_activa_para_representante(representante):
    """
    True si alguna sede donde el representante tiene alumnos activos tiene
    Cobranza Inteligente encendida: solo entonces el cobro manual pasa por
    esta puerta. Con el toggle apagado el cobro manual funciona como siempre.
    """
    from .inteligente import sedes_con_inteligente_activa
    activas = sedes_con_inteligente_activa()
    if not activas:
        return False
    sedes = set(representante.alumnos.filter(activo=True).values_list('sede_id', flat=True))
    return bool(sedes & activas)
