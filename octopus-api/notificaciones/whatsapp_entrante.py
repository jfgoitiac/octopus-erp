"""
WhatsApp ENTRANTE: respuestas de los representantes que llegan por webhook
(Meta Cloud API o Twilio) y se guardan como NotificacionLog con
tipo='respuesta_whatsapp' para que aparezcan en la conversación de cobranza.

Se reutiliza NotificacionLog para no abrir un modelo nuevo: `destinatario`
guarda el número de ORIGEN y `asunto` el id del mensaje del proveedor (para
descartar los reintentos del webhook). Ver NOTAS_TECNICAS.md.

Las credenciales se leen de ConfiguracionNotificaciones (editable desde la
app) y, si están vacías, de settings/.env.
"""
import base64
import hashlib
import hmac
import logging
import mimetypes
import uuid
from datetime import timedelta

from django.conf import settings
from django.core.files.base import ContentFile
from django.utils import timezone

from .models import NotificacionLog
from .services import _normalizar_telefono, _notif_cfg

logger = logging.getLogger(__name__)

TIPO_ENTRANTE = 'respuesta_whatsapp'
VENTANA_RESPUESTA = timedelta(hours=24)  # WhatsApp Business: texto libre solo dentro de 24 h
MAX_ADJUNTO = 16 * 1024 * 1024
# Tipos que se guardan; cualquier otro (ejecutables, comprimidos…) solo deja constancia.
TIPOS_ADJUNTO = {
    'image/jpeg', 'image/png', 'image/webp',
    'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr',
    'video/mp4', 'video/3gpp', 'application/pdf',
}
ROLES_AVISO = ('director', 'administrador', 'cobranza')
GRAPH = 'https://graph.facebook.com/v19.0'


def _config(campo, setting):
    cfg = _notif_cfg()
    return (getattr(cfg, campo, '') if cfg else '') or getattr(settings, setting, '')


def token_verificacion_meta():
    return _config('meta_webhook_verify_token', 'META_WEBHOOK_VERIFY_TOKEN')


def buscar_representante(numero):
    """Representante cuyo teléfono normalizado coincide con `numero` (o None)."""
    from secretaria.models import Representante
    normalizado = _normalizar_telefono(numero)
    if not normalizado:
        return None
    candidatos = Representante.objects.filter(telefono__endswith=normalizado[-7:])
    return next((r for r in candidatos if _normalizar_telefono(r.telefono) == normalizado), None)


def registrar_entrante(numero, texto, id_externo, proveedor, medio=None):
    """
    Guarda una respuesta, descarga su adjunto (si trae) y avisa al equipo.
    Devuelve el log, o None si ya se había recibido (reintento del webhook).
    """
    if id_externo and NotificacionLog.objects.filter(tipo=TIPO_ENTRANTE, asunto=id_externo).exists():
        return None
    rep = buscar_representante(numero)
    if rep is None:
        logger.info('WhatsApp entrante de un número sin representante: %s', numero)
    log = NotificacionLog.objects.create(
        canal='whatsapp', tipo=TIPO_ENTRANTE, estado='recibido', proveedor=proveedor,
        destinatario=_normalizar_telefono(numero) or numero, asunto=(id_externo or '')[:255],
        mensaje=(texto or '')[:4000], representante_cedula=rep.cedula if rep else '',
    )
    if medio:
        guardar_adjunto(log, medio)
    if rep:
        avisar_equipo(rep, log)
    return log


def ultima_respuesta(cedula):
    return (NotificacionLog.objects.filter(tipo=TIPO_ENTRANTE, representante_cedula=cedula)
            .order_by('-fecha_envio').first())


def ventana_abierta(cedula, ahora=None):
    """True si el representante escribió en las últimas 24 h (se le puede responder con texto libre)."""
    ultima = ultima_respuesta(cedula)
    return bool(ultima) and (ahora or timezone.now()) - ultima.fecha_envio <= VENTANA_RESPUESTA


# ── Adjuntos ───────────────────────────────────────────────────────────────────

def _descargar(medio):
    """(contenido, mime) del archivo en el proveedor. Lanza excepción si falla."""
    import requests
    if medio['proveedor'] == 'meta':
        cabeceras = {'Authorization': f"Bearer {_config('meta_whatsapp_token', 'META_WHATSAPP_TOKEN')}"}
        info = requests.get(f"{GRAPH}/{medio['id']}", headers=cabeceras, timeout=10)
        info.raise_for_status()
        info = info.json()
        if int(info.get('file_size') or 0) > MAX_ADJUNTO:
            raise ValueError('archivo demasiado grande')
        resp = requests.get(info['url'], headers=cabeceras, timeout=20)
        mime = info.get('mime_type') or medio.get('mime', '')
    else:
        auth = (_config('twilio_account_sid', 'TWILIO_ACCOUNT_SID'), _config('twilio_auth_token', 'TWILIO_AUTH_TOKEN'))
        resp = requests.get(medio['url'], auth=auth, timeout=20)
        mime = medio.get('mime') or resp.headers.get('Content-Type', '')
    resp.raise_for_status()
    if len(resp.content) > MAX_ADJUNTO:
        raise ValueError('archivo demasiado grande')
    return resp.content, mime.split(';')[0].strip().lower()


def guardar_adjunto(log, medio):
    """Descarga y guarda el adjunto. Si no se puede, el mensaje queda con una nota."""
    try:
        contenido, mime = _descargar(medio)
    except Exception:
        logger.exception('No se pudo descargar el adjunto de WhatsApp %s', log.asunto)
        nota = '[No se pudo descargar el archivo]'
    else:
        if mime in TIPOS_ADJUNTO:
            extension = mimetypes.guess_extension(mime) or ''
            log.adjunto.save(f'{uuid.uuid4().hex}{extension}', ContentFile(contenido), save=False)
            log.adjunto_tipo = mime
            log.save(update_fields=['adjunto', 'adjunto_tipo'])
            return
        nota = f'[Archivo no permitido: {mime or "tipo desconocido"}]'
    log.mensaje = f'{log.mensaje}\n{nota}'.strip()
    log.save(update_fields=['mensaje'])


# ── Aviso al equipo ────────────────────────────────────────────────────────────

def avisar_equipo(rep, log):
    """Push al responsable del caso; si nadie lo tiene asignado, al equipo de cobranza."""
    from django.contrib.auth import get_user_model
    from cobranza.models import CicloCobranza
    from .services import push_usuarios
    User = get_user_model()
    responsables = set(CicloCobranza.objects.filter(
        mensualidad__alumno__representante=rep, estado__in=CicloCobranza.ESTADOS_ABIERTOS,
        responsable__isnull=False).values_list('responsable_id', flat=True))
    usuarios = (User.objects.filter(id__in=responsables, is_active=True) if responsables else
                User.objects.filter(is_active=True, perfil__esta_activo=True, perfil__rol__in=ROLES_AVISO))
    cuerpo = log.mensaje[:120] or ('📎 Envió un archivo' if log.adjunto else 'Nuevo mensaje')
    try:
        push_usuarios(usuarios, 'mensaje', f'{rep.nombre} {rep.apellido} respondió por WhatsApp', cuerpo,
                      f'/cobranza/inteligente/representantes/{rep.id}', tipo_log='aviso_respuesta_whatsapp')
    except Exception:
        logger.exception('No se pudo avisar por push la respuesta de %s', rep.cedula)


# ── Meta Cloud API ─────────────────────────────────────────────────────────────

def firma_meta_valida(cuerpo, cabecera):
    """X-Hub-Signature-256 = 'sha256=' + HMAC-SHA256(app secret, cuerpo crudo)."""
    secreto = _config('meta_app_secret', 'META_APP_SECRET')
    if not secreto or not cabecera:
        return False
    esperado = 'sha256=' + hmac.new(secreto.encode(), cuerpo, hashlib.sha256).hexdigest()
    return hmac.compare_digest(esperado, cabecera)


MEDIOS_META = ('image', 'audio', 'voice', 'video', 'document', 'sticker')


def _texto_y_medio_meta(msg):
    tipo = msg.get('type')
    if tipo == 'text':
        return msg.get('text', {}).get('body', ''), None
    if tipo == 'button':
        return msg.get('button', {}).get('text', ''), None
    if tipo == 'interactive':
        i = msg.get('interactive', {})
        return (i.get('button_reply') or i.get('list_reply') or {}).get('title', ''), None
    if tipo in MEDIOS_META:
        datos = msg.get(tipo, {})
        texto = datos.get('caption') or datos.get('filename') or ''
        return texto, {'proveedor': 'meta', 'id': datos.get('id'), 'mime': datos.get('mime_type', '')}
    return f'[{tipo or "mensaje"} recibido]', None


def procesar_meta(payload):
    """Recorre entry[].changes[].value.messages[]. Devuelve cuántos mensajes nuevos guardó."""
    nuevos = 0
    for entry in payload.get('entry', []):
        for change in entry.get('changes', []):
            for msg in change.get('value', {}).get('messages', []):
                texto, medio = _texto_y_medio_meta(msg)
                if registrar_entrante(msg.get('from', ''), texto, msg.get('id', ''), 'meta', medio):
                    nuevos += 1
    return nuevos


# ── Twilio ─────────────────────────────────────────────────────────────────────

def firma_twilio_valida(url, parametros, cabecera):
    """X-Twilio-Signature = base64(HMAC-SHA1(auth token, url + claves y valores ordenados))."""
    token = _config('twilio_auth_token', 'TWILIO_AUTH_TOKEN')
    if not token or not cabecera:
        return False
    datos = url + ''.join(f'{k}{parametros[k]}' for k in sorted(parametros))
    esperado = base64.b64encode(hmac.new(token.encode(), datos.encode(), hashlib.sha1).digest()).decode()
    return hmac.compare_digest(esperado, cabecera)


def procesar_twilio(parametros):
    numero = (parametros.get('From') or '').replace('whatsapp:', '')
    medio = None
    if parametros.get('NumMedia', '0') != '0' and parametros.get('MediaUrl0'):
        # Solo el primer archivo: WhatsApp manda uno por mensaje.
        medio = {'proveedor': 'twilio', 'url': parametros['MediaUrl0'], 'mime': parametros.get('MediaContentType0', '')}
    log = registrar_entrante(numero, parametros.get('Body', ''), parametros.get('MessageSid', ''), 'twilio', medio)
    return 1 if log else 0
