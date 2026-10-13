"""
WhatsApp ENTRANTE: respuestas de los representantes que llegan por webhook
(Meta Cloud API o Twilio) y se guardan como NotificacionLog con
tipo='respuesta_whatsapp' para que aparezcan en la conversación de cobranza.

Se reutiliza NotificacionLog para no abrir un modelo nuevo: `destinatario`
guarda el número de ORIGEN y `asunto` el id del mensaje del proveedor (para
descartar los reintentos del webhook). Ver NOTAS_TECNICAS.md.
"""
import base64
import hashlib
import hmac
import logging
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .models import NotificacionLog
from .services import _normalizar_telefono

logger = logging.getLogger(__name__)

TIPO_ENTRANTE = 'respuesta_whatsapp'
VENTANA_RESPUESTA = timedelta(hours=24)  # WhatsApp Business: texto libre solo dentro de 24 h


def buscar_representante(numero):
    """Representante cuyo teléfono normalizado coincide con `numero` (o None)."""
    from secretaria.models import Representante
    normalizado = _normalizar_telefono(numero)
    if not normalizado:
        return None
    candidatos = Representante.objects.filter(telefono__endswith=normalizado[-7:])
    return next((r for r in candidatos if _normalizar_telefono(r.telefono) == normalizado), None)


def registrar_entrante(numero, texto, id_externo, proveedor):
    """Guarda una respuesta. Devuelve el log, o None si ya se había recibido (reintento)."""
    if id_externo and NotificacionLog.objects.filter(tipo=TIPO_ENTRANTE, asunto=id_externo).exists():
        return None
    rep = buscar_representante(numero)
    if rep is None:
        logger.info('WhatsApp entrante de un número sin representante: %s', numero)
    return NotificacionLog.objects.create(
        canal='whatsapp', tipo=TIPO_ENTRANTE, estado='recibido', proveedor=proveedor,
        destinatario=_normalizar_telefono(numero) or numero, asunto=(id_externo or '')[:255],
        mensaje=(texto or '')[:4000], representante_cedula=rep.cedula if rep else '',
    )


def ultima_respuesta(cedula):
    return (NotificacionLog.objects.filter(tipo=TIPO_ENTRANTE, representante_cedula=cedula)
            .order_by('-fecha_envio').first())


def ventana_abierta(cedula, ahora=None):
    """True si el representante escribió en las últimas 24 h (se le puede responder con texto libre)."""
    ultima = ultima_respuesta(cedula)
    return bool(ultima) and (ahora or timezone.now()) - ultima.fecha_envio <= VENTANA_RESPUESTA


# ── Meta Cloud API ─────────────────────────────────────────────────────────────

def firma_meta_valida(cuerpo, cabecera):
    """X-Hub-Signature-256 = 'sha256=' + HMAC-SHA256(app secret, cuerpo crudo)."""
    secreto = getattr(settings, 'META_APP_SECRET', '')
    if not secreto or not cabecera:
        return False
    esperado = 'sha256=' + hmac.new(secreto.encode(), cuerpo, hashlib.sha256).hexdigest()
    return hmac.compare_digest(esperado, cabecera)


def _texto_meta(msg):
    tipo = msg.get('type')
    if tipo == 'text':
        return msg.get('text', {}).get('body', '')
    if tipo == 'button':
        return msg.get('button', {}).get('text', '')
    if tipo == 'interactive':
        i = msg.get('interactive', {})
        return (i.get('button_reply') or i.get('list_reply') or {}).get('title', '')
    # Imagen, audio, documento, etc.: se deja constancia; el archivo no se descarga.
    return f'[{tipo or "mensaje"} recibido]'


def procesar_meta(payload):
    """Recorre entry[].changes[].value.messages[]. Devuelve cuántos mensajes nuevos guardó."""
    nuevos = 0
    for entry in payload.get('entry', []):
        for change in entry.get('changes', []):
            for msg in change.get('value', {}).get('messages', []):
                if registrar_entrante(msg.get('from', ''), _texto_meta(msg), msg.get('id', ''), 'meta'):
                    nuevos += 1
    return nuevos


# ── Twilio ─────────────────────────────────────────────────────────────────────

def firma_twilio_valida(url, parametros, cabecera):
    """X-Twilio-Signature = base64(HMAC-SHA1(auth token, url + claves y valores ordenados))."""
    from .services import _notif_cfg
    cfg = _notif_cfg()
    token = (cfg.twilio_auth_token if cfg else '') or getattr(settings, 'TWILIO_AUTH_TOKEN', '')
    if not token or not cabecera:
        return False
    datos = url + ''.join(f'{k}{parametros[k]}' for k in sorted(parametros))
    esperado = base64.b64encode(hmac.new(token.encode(), datos.encode(), hashlib.sha1).digest()).decode()
    return hmac.compare_digest(esperado, cabecera)


def procesar_twilio(parametros):
    numero = (parametros.get('From') or '').replace('whatsapp:', '')
    texto = parametros.get('Body') or ('[archivo recibido]' if parametros.get('NumMedia', '0') != '0' else '')
    return 1 if registrar_entrante(numero, texto, parametros.get('MessageSid', ''), 'twilio') else 0
