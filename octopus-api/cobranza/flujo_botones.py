"""
Árbol de botones de Cobranza Inteligente v4 (PLAN_COBRANZA_INTELIGENTE_V4.md §1.6).
Sin IA: responde a los botones de respuesta rápida de las plantillas de cobro y a
los adjuntos, y todo lo demás lo ve una persona.

  Ya pagué              -> pide el comprobante (conversacion.esperando = 'comprobante')
  Necesito un acuerdo   -> lista interactiva con 3 fechas (+3, +7, +14 días)
                           (esperando = 'fecha_acuerdo'); al elegir una crea la
                           promesa de pago (ConvenioPago tipo='promesa', origen='whatsapp'),
                           que pausa el ciclo, y confirma la fecha
  Hablar con alguien    -> requiere_humano + "Te escribiremos en horario de atención."
  imagen / PDF          -> el adjunto queda `pendiente` (lo pone el webhook), el motor
                           deja de escribirle y se responde "Recibimos tu comprobante…"
  texto libre           -> requiere_humano (lo marca el webhook, no este módulo)
  BAJA / STOP / NO MAS  -> BajaCobranza (lo resuelve el webhook, no este módulo)

Una conversación en estado `humano` (tomada por el cobrador) NO recibe respuestas
del árbol. Se conecta al webhook con `conversaciones.registrar_manejador` (al
importarse el módulo; lo hace `CobranzaConfig.ready`).
"""
import logging
import re
import unicodedata
from datetime import date, timedelta

from django.utils import timezone

from notificaciones import conversaciones
from notificaciones.models import ConversacionWhatsApp, MensajeWhatsApp

from . import gestion
from .models import CicloCobranza, ConvenioPago

logger = logging.getLogger(__name__)

# Ids que viajan en `button.payload` (los manda el motor al enviar la plantilla).
BOTON_YA_PAGUE = 'YA_PAGUE'
BOTON_ACUERDO = 'NECESITO_ACUERDO'
BOTON_HABLAR = 'HABLAR'
# Orden de los botones en las plantillas de §6 (índice 0, 1, 2).
BOTONES_RECORDATORIO = (BOTON_YA_PAGUE, BOTON_ACUERDO, BOTON_HABLAR)
# Si la plantilla se aprobó sin payload, Meta devuelve el texto del botón.
_ALIAS = {
    'YA_PAGUE': BOTON_YA_PAGUE,
    'NECESITO_ACUERDO': BOTON_ACUERDO, 'NECESITO_UN_ACUERDO': BOTON_ACUERDO,
    'HABLAR': BOTON_HABLAR, 'HABLAR_CON_ALGUIEN': BOTON_HABLAR,
}

ESPERANDO_COMPROBANTE = 'comprobante'   # valores de ConversacionWhatsApp.esperando
ESPERANDO_FECHA = 'fecha_acuerdo'
PREFIJO_FECHA = 'FECHA_ACUERDO:'          # id de cada fila de la lista: FECHA_ACUERDO:2026-10-15
DIAS_FECHAS_ACUERDO = (3, 7, 14)
MINUTOS_SIN_REPETIR_ACUSE = 10             # varios adjuntos seguidos reciben un solo acuse

TEXTO_PIDE_COMPROBANTE = 'Envíanos la foto o el PDF del comprobante por aquí.'
TEXTO_COMPROBANTE_RECIBIDO = 'Recibimos tu comprobante, lo revisaremos en las próximas horas.'
TEXTO_HABLAR = 'Te escribiremos en horario de atención.'
TEXTO_ELIGE_FECHA = '¿Para qué fecha te comprometes a pagar? Elige una opción.'
TEXTO_ARCHIVO_FALLIDO = ('No pudimos abrir el archivo que enviaste. '
                         'Te escribiremos en horario de atención.')

_DIAS_SEMANA = ('lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo')


def _hoy():
    return date.today()


def _normalizar(valor):
    limpio = unicodedata.normalize('NFKD', valor or '').encode('ascii', 'ignore').decode().upper()
    return re.sub(r'[^A-Z0-9]+', '_', limpio).strip('_')


def _accion_de(payload):
    """YA_PAGUE / NECESITO_ACUERDO / HABLAR a partir del id o, si no, del título del botón."""
    for clave in (payload.get('boton_id'), payload.get('titulo')):
        accion = _ALIAS.get(_normalizar(clave))
        if accion:
            return accion
    return None


# ── Utilidades ────────────────────────────────────────────────────────────────

def _derivar_a_humano(conv, texto, motivo='humano'):
    """La conversación queda para una persona (tarjeta en Hoy) y se avisa a la familia."""
    conversaciones._tocar(conv, timezone.now(), requiere_humano=True, esperando='')
    conversaciones.enviar_texto_sistema(conv, texto, {'motivo': motivo})


def _ciclos_elegibles(rep):
    """Deudas abiertas del representante que todavía no están en un convenio vigente."""
    if rep is None:
        return []
    ciclos = CicloCobranza.objects.filter(
        mensualidad__alumno__representante=rep, mensualidad__pagado=False,
        estado__in=CicloCobranza.ESTADOS_ABIERTOS).select_related('mensualidad__alumno')
    return [c for c in ciclos if not c.convenios.filter(estado=ConvenioPago.VIGENTE).exists()]


def _promesa_vigente_whatsapp(rep):
    if rep is None:
        return None
    return ConvenioPago.objects.filter(
        representante=rep, tipo=ConvenioPago.TIPO_PROMESA, origen=ConvenioPago.ORIGEN_WHATSAPP,
        estado=ConvenioPago.VIGENTE).prefetch_related('cuotas').first()


def _texto_fecha(fecha):
    return f'{fecha.strftime("%d/%m/%Y")}'


def _confirmar(conv, fecha):
    conversaciones.enviar_texto_sistema(
        conv, f'Listo, registramos tu compromiso de pago para el {_texto_fecha(fecha)}. ¡Gracias!',
        {'motivo': 'promesa'})


# ── Ramas del árbol ───────────────────────────────────────────────────────────

def _ya_pague(conv):
    conversaciones._tocar(conv, timezone.now(), esperando=ESPERANDO_COMPROBANTE)
    conversaciones.enviar_texto_sistema(conv, TEXTO_PIDE_COMPROBANTE, {'motivo': 'ya_pague'})
    return True


def _hablar(conv):
    _derivar_a_humano(conv, TEXTO_HABLAR, 'hablar')
    return True


def _acuerdo(conv):
    """Responde con la lista de 3 fechas (o deriva a una persona si no hay deuda que prometer)."""
    previa = _promesa_vigente_whatsapp(conv.representante)
    if previa is not None and not _ciclos_elegibles(conv.representante):
        _confirmar(conv, previa.cuotas.first().fecha)
        return True
    if not _ciclos_elegibles(conv.representante):
        # Sin representante vinculado o sin deuda abierta: no hay qué prometer.
        _derivar_a_humano(conv, TEXTO_HABLAR, 'acuerdo_sin_deuda')
        return True
    hoy = _hoy()
    filas = []
    for dias in DIAS_FECHAS_ACUERDO:
        f = hoy + timedelta(days=dias)
        filas.append({'id': f'{PREFIJO_FECHA}{f.isoformat()}', 'title': _texto_fecha(f),
                      'description': f'{_DIAS_SEMANA[f.weekday()].capitalize()}, en {dias} días'})
    conversaciones._tocar(conv, timezone.now(), esperando=ESPERANDO_FECHA)
    enviado = conversaciones.enviar_lista_sistema(conv, TEXTO_ELIGE_FECHA, 'Elegir fecha', filas,
                                                  {'motivo': 'acuerdo'})
    if enviado is None:
        conversaciones._tocar(conv, timezone.now(), requiere_humano=True)
    return True


def _elegir_fecha(conv, boton_id):
    """El representante eligió una fecha de la lista: crea la promesa y la confirma."""
    rep = conv.representante
    try:
        fecha = date.fromisoformat(boton_id[len(PREFIJO_FECHA):])
    except ValueError:
        _derivar_a_humano(conv, TEXTO_HABLAR, 'fecha_invalida')
        return True
    hoy = _hoy()
    ciclos = _ciclos_elegibles(rep)
    if not ciclos:
        previa = _promesa_vigente_whatsapp(rep)
        if previa is not None:      # toque repetido de la lista: no duplicar la promesa
            _confirmar(conv, previa.cuotas.first().fecha)
        else:
            _derivar_a_humano(conv, TEXTO_HABLAR, 'acuerdo_sin_deuda')
        conversaciones._tocar(conv, timezone.now(), esperando='')
        return True
    if not (hoy <= fecha <= hoy + timedelta(days=max(DIAS_FECHAS_ACUERDO))):
        return _acuerdo(conv)       # una lista vieja: se vuelve a ofrecer con fechas vigentes
    try:
        gestion.crear_promesa(
            rep, ciclos, fecha, None, notas='Promesa creada por el representante desde WhatsApp.',
            hoy=hoy, origen=ConvenioPago.ORIGEN_WHATSAPP)
    except gestion.AccionInvalida:
        logger.warning('No se pudo crear la promesa de la conversación %s', conv.id, exc_info=True)
        _derivar_a_humano(conv, TEXTO_HABLAR, 'promesa_fallida')
        return True
    conversaciones._tocar(conv, timezone.now(), esperando='')
    conversaciones._evento_sistema(
        conv, f'El representante prometió pagar el {_texto_fecha(fecha)} (promesa de pago creada).',
        None, timezone.now())
    _confirmar(conv, fecha)
    return True


def _boton(conv, msg):
    payload = msg.payload or {}
    boton_id = payload.get('boton_id') or ''
    if boton_id.startswith(PREFIJO_FECHA):
        return _elegir_fecha(conv, boton_id)
    accion = _accion_de(payload)
    if accion == BOTON_YA_PAGUE:
        return _ya_pague(conv)
    if accion == BOTON_ACUERDO:
        return _acuerdo(conv)
    if accion == BOTON_HABLAR:
        return _hablar(conv)
    # Botón que el árbol no conoce: que lo vea una persona (no se intenta "entender").
    conversaciones._tocar(conv, timezone.now(), requiere_humano=True)
    return True


def _adjunto(conv, msg):
    """Imagen o PDF entrante: el comprobante queda pendiente de asignar."""
    if msg.estado_adjunto != MensajeWhatsApp.ADJUNTO_PENDIENTE:
        if (msg.payload or {}).get('media_error'):
            _derivar_a_humano(conv, TEXTO_ARCHIVO_FALLIDO, 'archivo_fallido')
            return True
        return False
    ahora = timezone.now()
    if conv.esperando == ESPERANDO_COMPROBANTE:
        conversaciones._tocar(conv, ahora, esperando='')
    reciente = MensajeWhatsApp.objects.filter(
        conversacion=conv, direccion=MensajeWhatsApp.SALIENTE, payload__motivo='comprobante',
        creado_en__gte=ahora - timedelta(minutes=MINUTOS_SIN_REPETIR_ACUSE)).exists()
    if not reciente:
        conversaciones.enviar_texto_sistema(conv, TEXTO_COMPROBANTE_RECIBIDO, {'motivo': 'comprobante'})
    return True


# ── Punto de entrada (webhook) ────────────────────────────────────────────────

def manejar_entrante(conv, msg):
    """
    Manejador del webhook: True si el árbol atendió el mensaje. En una
    conversación tomada por el cobrador no responde (devuelve False).
    """
    if conv.estado == ConversacionWhatsApp.HUMANO:
        return False
    if msg.tipo in ('boton', 'lista'):
        return _boton(conv, msg)
    if msg.tipo in ('imagen', 'documento'):
        return _adjunto(conv, msg)
    return False


conversaciones.registrar_manejador(manejar_entrante)
