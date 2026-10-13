"""
Webhook de la Meta Cloud API (PLAN_COBRANZA_INTELIGENTE_V4.md §2.2).

  GET  /api/notificaciones/whatsapp/webhook/  verificación (hub.mode / hub.verify_token / hub.challenge)
  POST /api/notificaciones/whatsapp/webhook/  eventos; SIN JWT, con firma X-Hub-Signature-256

El POST valida la firma HMAC-SHA256 con el App Secret (403 si no coincide),
responde 200 de inmediato y delega el trabajo a la tarea Celery
`procesar_webhook_meta`. El procesamiento es idempotente: Meta reintenta, y el
`wa_message_id` único evita duplicar mensajes.
"""
import hashlib
import hmac
import json
import logging
import os
import re
import unicodedata
from datetime import datetime, timezone as dt_timezone

import requests
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from . import config_whatsapp, conversaciones
from .models import ConversacionWhatsApp, MensajeWhatsApp

logger = logging.getLogger(__name__)

PALABRAS_BAJA = {'BAJA', 'STOP', 'NO MAS'}
TEXTO_CONFIRMACION_BAJA = (
    'Listo, no volverá a recibir recordatorios de cobranza por WhatsApp. '
    'Si necesita algo, escríbanos por aquí.')
_RANGO_ENTREGA = {'enviado': 0, 'entregado': 1, 'leido': 2}
_ESTADO_META = {'sent': 'enviado', 'delivered': 'entregado', 'read': 'leido', 'failed': 'fallido'}
_EXTENSION_POR_MIME = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
                       'application/pdf': '.pdf'}


# ── Firma y configuración ─────────────────────────────────────────────────────

def _app_secret():
    """App Secret general (compatibilidad); la firma por sede va en `_secretos_requeridos`."""
    return config_whatsapp.get_config_whatsapp(None).app_secret


def _phone_ids(payload):
    ids = []
    for entry in (payload.get('entry') or []) if isinstance(payload, dict) else []:
        for change in (entry.get('changes') or []) if isinstance(entry, dict) else []:
            value = change.get('value') if isinstance(change, dict) else None
            pid = ((value or {}).get('metadata') or {}).get('phone_number_id', '')
            if pid and pid not in ids:
                ids.append(pid)
    return ids


def _secretos_requeridos(cuerpo):
    """
    Secretos con los que debe firmarse el POST: el de la sede dueña de cada
    Phone Number ID del payload y el general para los números sin dueño (o si
    no hay ninguno). Meta firma con el secreto de UNA app, así que un payload
    legítimo cumple todos a la vez; uno armado con el secreto de una sede para
    colar eventos de otra no.
    """
    try:
        payload = json.loads(cuerpo or b'{}')
    except ValueError:
        payload = {}
    secretos, usa_general = [], False
    for pid in _phone_ids(payload):
        dueño = config_whatsapp.config_por_phone_id(pid)
        if dueño is not None and dueño.origen == config_whatsapp.ORIGEN_SEDE:
            secretos.append(dueño.app_secret)
        else:
            usa_general = True
    if usa_general or not secretos:
        secretos.append(_app_secret())
    return secretos


def firma_de_payload_valida(cuerpo, cabecera):
    secretos = _secretos_requeridos(cuerpo)
    return all(firma_valida(cuerpo, cabecera, s) for s in secretos)


def _verify_token():
    """Token de verificación general (compatibilidad)."""
    return config_whatsapp.get_config_whatsapp(None).verify_token


def firma_valida(cuerpo, cabecera, secreto):
    """`cabecera` = valor de X-Hub-Signature-256 ('sha256=<hex>'). Sin secreto, nunca es válida."""
    if not secreto or not cabecera or not cabecera.startswith('sha256='):
        return False
    esperado = hmac.new(secreto.encode('utf-8'), cuerpo, hashlib.sha256).hexdigest()
    return hmac.compare_digest(esperado, cabecera[len('sha256='):])


class WebhookMetaView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        recibido = request.query_params.get('hub.verify_token', '')
        if (request.query_params.get('hub.mode') == 'subscribe' and any(
                hmac.compare_digest(recibido, t) for t in config_whatsapp.verify_tokens())):
            return HttpResponse(request.query_params.get('hub.challenge', ''), content_type='text/plain')
        return HttpResponse('Forbidden', status=403, content_type='text/plain')

    def post(self, request):
        cuerpo = request.body
        if not firma_de_payload_valida(cuerpo, request.META.get('HTTP_X_HUB_SIGNATURE_256', '')):
            return HttpResponse('Firma inválida', status=403, content_type='text/plain')
        try:
            payload = json.loads(cuerpo or b'{}')
            if not isinstance(payload, dict):
                raise ValueError
        except ValueError:
            return Response({'detail': 'JSON inválido.'}, status=400)
        from .tasks import procesar_webhook_meta
        try:
            procesar_webhook_meta.delay(payload)
        except Exception:
            # Broker caído: procesar aquí para no perder el evento (Meta no reintenta un 200).
            logger.exception('No se pudo encolar procesar_webhook_meta; se procesa en línea.')
            procesar_payload(payload)
        return Response({'status': 'ok'})


# ── Procesamiento ─────────────────────────────────────────────────────────────

def procesar_payload(payload):
    """Procesa un POST de Meta ya validado. Devuelve contadores. Un mensaje malo no frena a los demás."""
    resumen = {'mensajes': 0, 'duplicados': 0, 'estados': 0, 'ignorados': 0}
    general = config_whatsapp.get_config_whatsapp(None)
    for entry in payload.get('entry') or []:
        for change in entry.get('changes') or []:
            value = change.get('value') or {}
            recibido_en = (value.get('metadata') or {}).get('phone_number_id', '')
            # Enrutado por Phone Number ID: sede dueña del número, el general, o (si el
            # general no tiene Phone ID, instalación vieja) todo va al general.
            dueño = config_whatsapp.config_por_phone_id(recibido_en) if recibido_en else None
            if dueño is None and general.phone_id and recibido_en and recibido_en != general.phone_id:
                resumen['ignorados'] += 1   # número que no es de ninguna sede ni el general
                continue
            entrada = dueño if (dueño is not None and dueño.origen == config_whatsapp.ORIGEN_SEDE) else None
            contactos = {c.get('wa_id'): (c.get('profile') or {}).get('name', '')
                         for c in value.get('contacts') or []}
            for m in value.get('messages') or []:
                try:
                    resultado = procesar_mensaje(m, contactos, entrada=entrada, phone_id=recibido_en)
                except Exception:
                    logger.exception('Error procesando el mensaje entrante %s', m.get('id'))
                    continue
                resumen[resultado] += 1
            for st in value.get('statuses') or []:
                try:
                    if procesar_status(st):
                        resumen['estados'] += 1
                except Exception:
                    logger.exception('Error procesando el estado %s', st.get('id'))
    return resumen


def _instante(timestamp):
    try:
        return datetime.fromtimestamp(int(timestamp), tz=dt_timezone.utc)
    except (TypeError, ValueError, OSError):
        return timezone.now()


def _texto_de_baja(texto):
    limpio = unicodedata.normalize('NFKD', texto or '').encode('ascii', 'ignore').decode().upper()
    limpio = re.sub(r'[^A-Z ]', ' ', limpio)
    return ' '.join(limpio.split()) in PALABRAS_BAJA


def _extraer(m):
    """(tipo, cuerpo, payload, reconocido) de un mensaje entrante de Meta."""
    tipo_meta = m.get('type', '')
    contexto = (m.get('context') or {}).get('id')
    base = {'tipo_meta': tipo_meta}
    if contexto:
        base['responde_a'] = contexto
    if tipo_meta == 'text':
        return 'texto', (m.get('text') or {}).get('body', ''), base, True
    if tipo_meta == 'image':
        i = m.get('image') or {}
        return 'imagen', i.get('caption', ''), {**base, 'media_id': i.get('id'),
                                                'mime_type': i.get('mime_type', '')}, True
    if tipo_meta == 'document':
        d = m.get('document') or {}
        return 'documento', d.get('caption') or d.get('filename', ''), {
            **base, 'media_id': d.get('id'), 'mime_type': d.get('mime_type', ''),
            'filename': d.get('filename', '')}, True
    if tipo_meta == 'button':
        b = m.get('button') or {}
        return 'boton', b.get('text', ''), {**base, 'boton_id': b.get('payload', ''),
                                            'titulo': b.get('text', '')}, True
    if tipo_meta == 'interactive':
        inter = m.get('interactive') or {}
        if inter.get('type') == 'list_reply':
            r = inter.get('list_reply') or {}
            return 'lista', r.get('title', ''), {**base, 'boton_id': r.get('id', ''),
                                                 'titulo': r.get('title', ''),
                                                 'descripcion': r.get('description', '')}, True
        r = inter.get('button_reply') or {}
        return 'boton', r.get('title', ''), {**base, 'boton_id': r.get('id', ''),
                                             'titulo': r.get('title', '')}, True
    # audio, video, sticker, ubicación, contactos…: se guarda un marcador y lo ve una persona.
    return 'texto', f'[Mensaje de tipo "{tipo_meta}" no soportado]', base, False


def procesar_mensaje(m, contactos=None, entrada=None, phone_id=''):
    """Devuelve 'mensajes', 'duplicados' o 'ignorados'. `entrada`: ConfigWhatsApp de
    la sede dueña del número por el que llegó (None = número general)."""
    wa_id = m.get('id')
    if not wa_id:
        return 'ignorados'
    if m.get('type') in ('reaction', 'system', 'ephemeral'):
        return 'ignorados'
    if MensajeWhatsApp.objects.filter(wa_message_id=wa_id).exists():
        return 'duplicados'
    telefono = conversaciones.normalizar_telefono(m.get('from'))
    if not telefono:
        logger.warning('Mensaje %s con número inválido: %r', wa_id, m.get('from'))
        return 'ignorados'
    ahora = timezone.now()
    conv = conversaciones.obtener_conversacion(
        telefono, (contactos or {}).get(m.get('from'), ''), ahora,
        sede_id=entrada.sede_id if entrada else None, phone_id=phone_id)
    tipo, cuerpo, payload, reconocido = _extraer(m)
    try:
        msg = conversaciones.registrar_entrante(
            conv, tipo, cuerpo, payload, wa_id, _instante(m.get('timestamp')))
    except IntegrityError:
        return 'duplicados'   # otro worker lo guardó entre la consulta y el insert

    if tipo in ('imagen', 'documento'):
        _guardar_media(msg)
    _reaccionar(conv, msg, reconocido)
    return 'mensajes'


def _reaccionar(conv, msg, reconocido):
    """Palabras de baja, manejadores de la fase C y, si nada lo cubre, `requiere_humano`."""
    ahora = timezone.now()
    if msg.tipo == 'texto' and reconocido and _texto_de_baja(msg.cuerpo):
        registrar_baja(conv, ahora)
        return
    for manejador in conversaciones.MANEJADORES_ENTRANTES:
        try:
            if manejador(conv, msg):
                return
        except Exception:
            logger.exception('Manejador de entrantes falló en el mensaje %s', msg.id)
    # Texto libre (o contenido no soportado) que no es botón ni palabra de baja:
    # lo ve una persona. En una conversación ya tomada no hace falta avisar.
    if msg.tipo == 'texto' and conv.estado == ConversacionWhatsApp.AUTOMATICO and not conv.requiere_humano:
        conversaciones._tocar(conv, ahora, requiere_humano=True)


def registrar_baja(conv, ahora=None):
    """BAJA / STOP / NO MAS: crea la BajaCobranza de WhatsApp y confirma al representante."""
    from cobranza.models import BajaCobranza
    ahora = ahora or timezone.now()
    if conv.representante_id is None:
        # Sin vincular no hay a quién darle de baja: que lo resuelva una persona.
        conversaciones._tocar(conv, ahora, requiere_humano=True)
        conversaciones._evento_sistema(
            conv, 'Pidió la baja de los recordatorios pero la conversación no está vinculada a un '
                  'representante: vincúlela y regístrela a mano.', None, ahora)
        return None
    baja, creada = BajaCobranza.objects.get_or_create(
        representante_id=conv.representante_id, canal='whatsapp')
    if creada:
        conversaciones._evento_sistema(conv, 'El representante pidió la baja de los recordatorios '
                                              'de cobranza por WhatsApp.', None, ahora)
    conversaciones.enviar_texto_sistema(conv, TEXTO_CONFIRMACION_BAJA, {'motivo': 'baja'}, ahora)
    return baja


def procesar_status(st):
    """Actualiza la entrega de un saliente. True si hubo cambio."""
    msg = MensajeWhatsApp.objects.filter(wa_message_id=st.get('id')).first()
    nuevo = _ESTADO_META.get(st.get('status'))
    if msg is None or nuevo is None:
        return False
    actual = msg.estado_entrega or 'enviado'
    if nuevo == 'fallido':
        if actual in ('entregado', 'leido') or msg.estado_entrega == 'fallido':
            return False
        msg.estado_entrega = 'fallido'
        msg.payload = {**msg.payload, 'errores': st.get('errors') or []}
        msg.save(update_fields=['estado_entrega', 'payload', 'actualizado_en'])
        _reintentar_en_motor(msg)
        return True
    if msg.estado_entrega == 'fallido':
        return False
    if msg.estado_entrega and _RANGO_ENTREGA[nuevo] <= _RANGO_ENTREGA[msg.estado_entrega]:
        return False
    msg.estado_entrega = nuevo
    msg.save(update_fields=['estado_entrega', 'actualizado_en'])
    return True


def _reintentar_en_motor(msg):
    """Un `failed` de Meta alimenta el reintento del recordatorio automático (solo WhatsApp puro)."""
    from datetime import timedelta
    from cobranza.models import EnvioCobranza
    from cobranza.motor import MAX_INTENTOS
    envio = msg.envio_cobranza
    if envio is None or envio.estado != EnvioCobranza.ENVIADO or envio.canal != 'whatsapp':
        return
    if envio.intentos >= MAX_INTENTOS:
        envio.estado = EnvioCobranza.FALLIDO
        envio.save(update_fields=['estado'])
    else:
        envio.estado = EnvioCobranza.REINTENTO
        envio.proximo_intento = timezone.now() + timedelta(hours=1)
        envio.save(update_fields=['estado', 'proximo_intento'])


# ── Media entrante ────────────────────────────────────────────────────────────

def descargar_media(media_id, mime_hint='', nombre_hint='', conv=None):
    """
    GET /{media_id} → URL temporal → descarga con el token. Devuelve un
    SimpleUploadedFile validado con las mismas reglas del portal (10 MB; JPG,
    PNG, WEBP o PDF; magic bytes). Lanza ValueError con el motivo si no sirve.
    """
    from pagos_comunes.comprobantes import COMPROBANTE_MAX_BYTES, validar_comprobante
    token, _ = conversaciones._credenciales(conv)
    auth = {'Authorization': f'Bearer {token}'}
    info = requests.get(f'{conversaciones.GRAPH_URL}/{media_id}', headers=auth, timeout=15)
    info.raise_for_status()
    datos = info.json()
    mime = (datos.get('mime_type') or mime_hint or '').split(';')[0].strip().lower()
    if int(datos.get('file_size') or 0) > COMPROBANTE_MAX_BYTES:
        raise ValueError('El archivo supera el tamaño máximo permitido (10 MB).')
    descarga = requests.get(datos['url'], headers=auth, timeout=30)
    descarga.raise_for_status()
    contenido = descarga.content
    if len(contenido) > COMPROBANTE_MAX_BYTES:
        raise ValueError('El archivo supera el tamaño máximo permitido (10 MB).')
    nombre = os.path.basename(nombre_hint or '') or f'whatsapp_{media_id}'
    ext = _EXTENSION_POR_MIME.get(mime, '')
    if ext and not nombre.lower().endswith(ext) and not (ext == '.jpg' and nombre.lower().endswith('.jpeg')):
        nombre += ext
    archivo = SimpleUploadedFile(nombre, contenido, content_type=mime)
    error = validar_comprobante(archivo)
    if error:
        raise ValueError(error)
    return archivo


def _guardar_media(msg):
    media_id = msg.payload.get('media_id')
    if not media_id:
        return
    try:
        archivo = descargar_media(media_id, msg.payload.get('mime_type', ''), msg.payload.get('filename', ''),
                                  conv=msg.conversacion)
    except Exception as e:
        logger.warning('No se pudo descargar la media %s: %s', media_id, e)
        msg.payload = {**msg.payload, 'media_error': str(e)[:200]}
        msg.save(update_fields=['payload', 'actualizado_en'])
        return
    msg.adjunto.save(archivo.name, archivo, save=False)
    if conversaciones.MARCAR_ADJUNTOS_PENDIENTES:
        msg.estado_adjunto = MensajeWhatsApp.ADJUNTO_PENDIENTE
    msg.save(update_fields=['adjunto', 'estado_adjunto', 'actualizado_en'])
