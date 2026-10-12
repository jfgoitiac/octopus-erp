"""
Conversaciones de WhatsApp de Cobranza Inteligente v4 (PLAN_COBRANZA_INTELIGENTE_V4.md §1.3 / §2.3).

Una conversación por número de WhatsApp. Este módulo:
  - vincula el número a un representante SOLO si coincide con uno (nunca adivina);
  - registra mensajes entrantes, salientes y notas internas;
  - aplica la ventana de 24 h de Meta (texto libre solo dentro de ella);
  - maneja el takeover (`humano`) y su devolución al automático;
  - envía texto libre, documentos y plantillas por la Cloud API de Meta.

El webhook (webhook_meta.py) y las vistas (views_conversaciones.py) usan estas
funciones; el motor de cobranza las usa para registrar sus salientes.
"""
import logging
import re
from datetime import timedelta
from decimal import Decimal

import requests
from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import F, Q
from django.utils import timezone

from . import services
from .models import ConversacionWhatsApp, MensajeWhatsApp

logger = logging.getLogger(__name__)

GRAPH_URL = 'https://graph.facebook.com/v19.0'
VENTANA_HORAS = 24
DIAS_DEVOLUCION_AUTOMATICA = 3
MAX_CUERPO = 4096

# Fase C activa esto: con True, los adjuntos entrantes quedan `pendiente` y el
# motor omite los envíos al representante hasta convertirlos o descartarlos.
# Falso en la Fase B para no pausar a nadie sin una pantalla que lo resuelva.
MARCAR_ADJUNTOS_PENDIENTES = False

# Fase C: funciones `f(conversacion, mensaje) -> bool` (True = manejó el mensaje)
# que se consultan con cada entrante antes de marcar `requiere_humano`.
MANEJADORES_ENTRANTES = []


def registrar_manejador(funcion):
    if funcion not in MANEJADORES_ENTRANTES:
        MANEJADORES_ENTRANTES.append(funcion)
    return funcion


class ErrorConversacion(Exception):
    """Error de validación mostrable al usuario (400)."""


class VentanaCerrada(ErrorConversacion):
    """Se intentó escribir texto libre fuera de la ventana de 24 h."""


class ErrorEnvio(Exception):
    """Meta rechazó o no se pudo hacer el envío (502)."""


# ── Teléfonos y vinculación ───────────────────────────────────────────────────

def normalizar_telefono(telefono):
    """E.164 con '+', o None si no es un teléfono válido."""
    return services._normalizar_telefono(telefono)


def representantes_por_telefono(telefono_e164):
    """Ids de representantes activos cuyo teléfono normalizado coincide."""
    from secretaria.models import Representante
    coincidencias = []
    for rep_id, tel in Representante.objects.filter(activo=True).exclude(
            telefono='').values_list('id', 'telefono'):
        if normalizar_telefono(tel) == telefono_e164:
            coincidencias.append(rep_id)
    return coincidencias


def representante_unico_por_telefono(telefono_e164):
    """El representante dueño del número, o None si hay varios o ninguno."""
    from secretaria.models import Representante
    ids = representantes_por_telefono(telefono_e164)
    return Representante.objects.filter(pk=ids[0]).first() if len(ids) == 1 else None


def sede_de_representante(rep):
    """Sede de sus alumnos activos si es una sola; si hay varias, None."""
    if rep is None:
        return None
    sedes = set(rep.alumnos.filter(activo=True).values_list('sede_id', flat=True))
    return sedes.pop() if len(sedes) == 1 else None


def obtener_conversacion(telefono, nombre_contacto='', ahora=None):
    """
    La conversación del número (se crea si no existe). Intenta vincular al
    representante mientras no lo esté. `telefono` ya normalizado (E.164).
    """
    ahora = ahora or timezone.now()
    conv, creada = ConversacionWhatsApp.objects.get_or_create(
        telefono=telefono, defaults={'nombre_contacto': (nombre_contacto or '')[:150],
                                     'actualizado_en': ahora})
    cambios = {}
    if nombre_contacto and conv.nombre_contacto != nombre_contacto[:150]:
        cambios['nombre_contacto'] = nombre_contacto[:150]
    if conv.representante_id is None:
        rep = representante_unico_por_telefono(telefono)
        if rep is not None:
            cambios['representante'] = rep
            cambios['sede_id'] = sede_de_representante(rep)
    if cambios:
        for k, v in cambios.items():
            setattr(conv, k, v)
        conv.save(update_fields=list(cambios))
    return conv


def conversacion_de_representante(rep, crear=False):
    """
    La conversación de un representante: la vinculada a él (la más reciente) o,
    con `crear`, la de su teléfono (creándola). None si no hay ni teléfono válido.
    """
    conv = rep.conversaciones_whatsapp.order_by('-actualizado_en').first()
    if conv is not None or not crear:
        return conv
    tel = normalizar_telefono(rep.telefono)
    if not tel:
        return None
    conv = obtener_conversacion(tel)
    if conv.representante_id is None and not representantes_por_telefono(tel)[1:]:
        conv.representante, conv.sede_id = rep, sede_de_representante(rep)
        conv.save(update_fields=['representante', 'sede'])
    return conv


# ── Ventana de 24 h ───────────────────────────────────────────────────────────

def ventana(conv, ahora=None):
    """{'abierta', 'expira_en', 'segundos_restantes'} de la ventana de 24 h de Meta."""
    ahora = ahora or timezone.now()
    if not conv.ultimo_entrante_en:
        return {'abierta': False, 'expira_en': None, 'segundos_restantes': 0}
    expira = conv.ultimo_entrante_en + timedelta(hours=VENTANA_HORAS)
    restante = int((expira - ahora).total_seconds())
    return {'abierta': restante > 0, 'expira_en': expira, 'segundos_restantes': max(restante, 0)}


# ── Registro de mensajes ──────────────────────────────────────────────────────

def _tocar(conv, ahora, **campos):
    """UPDATE atómico de la conversación (sin pisar contadores concurrentes) + actualizado_en."""
    campos['actualizado_en'] = ahora
    ConversacionWhatsApp.objects.filter(pk=conv.pk).update(**campos)
    for k, v in campos.items():
        if not isinstance(v, F):
            setattr(conv, k, v)


def registrar_entrante(conv, tipo, cuerpo, payload=None, wa_message_id=None, creado_en=None):
    """
    Guarda un mensaje entrante y sube el contador de no leídos. Lanza
    IntegrityError si `wa_message_id` ya existe (idempotencia del webhook).
    """
    creado_en = creado_en or timezone.now()
    with transaction.atomic():
        msg = MensajeWhatsApp.objects.create(
            conversacion=conv, direccion=MensajeWhatsApp.ENTRANTE, tipo=tipo, cuerpo=cuerpo or '',
            payload=payload or {}, wa_message_id=wa_message_id, creado_en=creado_en)
        ConversacionWhatsApp.objects.filter(pk=conv.pk).update(
            no_leidos=F('no_leidos') + 1, actualizado_en=timezone.now(),
            ultimo_entrante_en=creado_en)
    conv.refresh_from_db()
    return msg


def registrar_saliente(conv, tipo, cuerpo, payload=None, usuario=None, wa_message_id=None,
                       envio=None, estado_entrega='enviado', humano=False, ahora=None, adjunto=None):
    """
    Guarda un mensaje saliente. `humano`: lo escribió una persona (alimenta la
    devolución automática y las tarjetas de Hoy). Los del sistema (motor, bot)
    solo marcan `ultimo_saliente_en`.
    """
    ahora = ahora or timezone.now()
    msg = MensajeWhatsApp.objects.create(
        conversacion=conv, direccion=MensajeWhatsApp.SALIENTE, tipo=tipo, cuerpo=cuerpo or '',
        payload=payload or {}, wa_message_id=wa_message_id, estado_entrega=estado_entrega,
        enviado_por=usuario, envio_cobranza=envio, creado_en=ahora, adjunto=adjunto)
    campos = {'ultimo_saliente_en': ahora}
    if humano:
        campos['ultimo_humano_en'] = ahora
    _tocar(conv, ahora, **campos)
    return msg


def agregar_nota(conv, cuerpo, usuario, ahora=None, tipo='texto', payload=None):
    """Nota interna (el representante no la ve). No cuenta como actividad humana."""
    ahora = ahora or timezone.now()
    cuerpo = (cuerpo or '').strip()
    if not cuerpo:
        raise ErrorConversacion('La nota no puede estar vacía.')
    msg = MensajeWhatsApp.objects.create(
        conversacion=conv, direccion=MensajeWhatsApp.NOTA, tipo=tipo, cuerpo=cuerpo[:MAX_CUERPO],
        payload=payload or {}, enviado_por=usuario, creado_en=ahora)
    _tocar(conv, ahora)
    return msg


def _evento_sistema(conv, texto, usuario=None, ahora=None):
    return agregar_nota(conv, texto, usuario, ahora, tipo='sistema')


# ── Takeover ──────────────────────────────────────────────────────────────────

def _nombre_usuario(u):
    return (getattr(u, 'nombre_completo', '') or getattr(u, 'username', '') or '') if u else ''


def tomar(conv, usuario, ahora=None):
    """El cobrador toma la conversación: el motor omite sus envíos y el bot no responde."""
    ahora = ahora or timezone.now()
    _tocar(conv, ahora, estado=ConversacionWhatsApp.HUMANO, tomada_por=usuario, tomada_en=ahora,
           requiere_humano=False, esperando='')
    _evento_sistema(conv, f'Conversación tomada por {_nombre_usuario(usuario) or "el cobrador"}.',
                    usuario, ahora)
    return conv


def devolver(conv, usuario=None, ahora=None, motivo=''):
    """Devuelve la conversación al automático."""
    ahora = ahora or timezone.now()
    _tocar(conv, ahora, estado=ConversacionWhatsApp.AUTOMATICO, tomada_por=None, tomada_en=None,
           requiere_humano=False)
    _evento_sistema(conv, motivo or 'Conversación devuelta al automático.', usuario, ahora)
    return conv


def devolver_inactivas(ahora=None):
    """
    Tarea diaria: las conversaciones `humano` sin mensajes del cobrador en 3 días
    vuelven solas al automático. Devuelve cuántas devolvió.
    """
    ahora = ahora or timezone.now()
    limite = ahora - timedelta(days=DIAS_DEVOLUCION_AUTOMATICA)
    devueltas = 0
    for conv in ConversacionWhatsApp.objects.filter(estado=ConversacionWhatsApp.HUMANO):
        ultima = max((f for f in (conv.tomada_en, conv.ultimo_humano_en) if f),
                     default=conv.actualizado_en)
        if ultima <= limite:
            devolver(conv, None, ahora,
                     f'Devuelta al automático: {DIAS_DEVOLUCION_AUTOMATICA} días sin mensajes del cobrador.')
            devueltas += 1
    return devueltas


def vincular(conv, representante, ahora=None):
    """Asocia a mano la conversación a un representante (y su sede)."""
    ahora = ahora or timezone.now()
    _tocar(conv, ahora, representante=representante, sede_id=sede_de_representante(representante))
    return conv


def marcar_leida(conv, ahora=None):
    _tocar(conv, ahora or timezone.now(), no_leidos=0)
    return conv


# ── Envío por Meta Cloud API ──────────────────────────────────────────────────

def _credenciales():
    cfg = services._notif_cfg()
    token = (cfg.meta_whatsapp_token if cfg else '') or getattr(settings, 'META_WHATSAPP_TOKEN', '')
    phone_id = (cfg.meta_whatsapp_phone_id if cfg else '') or getattr(settings, 'META_WHATSAPP_PHONE_ID', '')
    if not (token and phone_id):
        raise ErrorEnvio('WhatsApp (Meta) no está configurado: faltan el token o el ID del número.')
    return token, phone_id


def _wa_id_de(resp):
    try:
        valor = resp.json()['messages'][0]['id']
        return valor if isinstance(valor, str) else None
    except Exception:
        return None


def _post_meta(telefono, cuerpo_meta):
    """POST /messages; devuelve el wa_message_id (o None si Meta no lo informó)."""
    token, phone_id = _credenciales()
    payload = {'messaging_product': 'whatsapp', 'to': telefono.lstrip('+'), **cuerpo_meta}
    try:
        resp = requests.post(
            f'{GRAPH_URL}/{phone_id}/messages',
            headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
            json=payload, timeout=10)
        resp.raise_for_status()
    except Exception as e:
        logger.error('Meta rechazó el envío a %s: %s', telefono, e)
        raise ErrorEnvio('No se pudo enviar el mensaje por WhatsApp. Revise la configuración o inténtelo de nuevo.')
    return _wa_id_de(resp)


def enviar_texto_sistema(conv, cuerpo, payload=None, ahora=None):
    """Respuesta automática (bot). Solo válida dentro de la ventana de 24 h; no lanza error."""
    ahora = ahora or timezone.now()
    try:
        if not ventana(conv, ahora)['abierta']:
            return None
        wa_id = _post_meta(conv.telefono, {'type': 'text', 'text': {'body': cuerpo}})
    except ErrorEnvio:
        return None
    return registrar_saliente(conv, 'texto', cuerpo, {**(payload or {}), 'origen': 'bot'},
                              wa_message_id=wa_id, ahora=ahora)


def enviar_texto(conv, cuerpo, usuario, ahora=None):
    """
    Texto libre del cobrador. Solo con la ventana de 24 h abierta (si no,
    VentanaCerrada: debe usar una plantilla). Escribir en una conversación
    automática la toma (así el motor deja de escribirle a la familia).
    """
    ahora = ahora or timezone.now()
    cuerpo = (cuerpo or '').strip()
    if not cuerpo:
        raise ErrorConversacion('El mensaje no puede estar vacío.')
    if len(cuerpo) > MAX_CUERPO:
        raise ErrorConversacion(f'El mensaje supera {MAX_CUERPO} caracteres.')
    if not ventana(conv, ahora)['abierta']:
        raise VentanaCerrada(
            'Pasaron más de 24 horas desde el último mensaje del representante: '
            'solo puede enviar una plantilla aprobada.')
    wa_id = _post_meta(conv.telefono, {'type': 'text', 'text': {'body': cuerpo}})
    msg = registrar_saliente(conv, 'texto', cuerpo, usuario=usuario, wa_message_id=wa_id,
                             humano=True, ahora=ahora)
    if conv.estado == ConversacionWhatsApp.AUTOMATICO:
        tomar(conv, usuario, ahora)
    elif conv.requiere_humano:
        _tocar(conv, ahora, requiere_humano=False)
    return msg


def enviar_documento(conv, archivo, caption, usuario, ahora=None):
    """Imagen o PDF del cobrador (p. ej. el estado de cuenta). Misma regla de ventana que el texto."""
    from pagos_comunes.comprobantes import validar_comprobante
    ahora = ahora or timezone.now()
    if not ventana(conv, ahora)['abierta']:
        raise VentanaCerrada(
            'Pasaron más de 24 horas desde el último mensaje del representante: '
            'solo puede enviar una plantilla aprobada.')
    error = validar_comprobante(archivo)
    if error:
        raise ErrorConversacion(error)
    token, phone_id = _credenciales()
    es_imagen = archivo.content_type.startswith('image/')
    try:
        archivo.seek(0)
        subida = requests.post(
            f'{GRAPH_URL}/{phone_id}/media', headers={'Authorization': f'Bearer {token}'},
            data={'messaging_product': 'whatsapp', 'type': archivo.content_type},
            files={'file': (archivo.name, archivo.read(), archivo.content_type)}, timeout=30)
        subida.raise_for_status()
        media_id = subida.json()['id']
    except Exception as e:
        logger.error('Meta rechazó la subida de media: %s', e)
        raise ErrorEnvio('No se pudo subir el archivo a WhatsApp.')
    caption = (caption or '').strip()[:1024]
    if es_imagen:
        cuerpo_meta = {'type': 'image', 'image': {'id': media_id, 'caption': caption}}
    else:
        cuerpo_meta = {'type': 'document',
                       'document': {'id': media_id, 'filename': archivo.name, 'caption': caption}}
    wa_id = _post_meta(conv.telefono, cuerpo_meta)
    archivo.seek(0)
    msg = registrar_saliente(
        conv, 'imagen' if es_imagen else 'documento', caption, {'nombre_archivo': archivo.name},
        usuario=usuario, wa_message_id=wa_id, humano=True, ahora=ahora, adjunto=archivo)
    if conv.estado == ConversacionWhatsApp.AUTOMATICO:
        tomar(conv, usuario, ahora)
    return msg


def enviar_plantilla(conv, nombre, idioma, parametros, usuario, cuerpo='', ahora=None):
    """Plantilla aprobada por Meta: permitida dentro y fuera de la ventana de 24 h."""
    ahora = ahora or timezone.now()
    nombre = (nombre or '').strip()
    if not nombre:
        raise ErrorConversacion('Indique la plantilla a enviar.')
    parametros = [str(p) for p in (parametros or [])]
    plantilla = {'name': nombre, 'language': {'code': idioma or 'es'}}
    if parametros:
        plantilla['components'] = [{'type': 'body', 'parameters': [
            {'type': 'text', 'text': p} for p in parametros]}]
    wa_id = _post_meta(conv.telefono, {'type': 'template', 'template': plantilla})
    return registrar_saliente(
        conv, 'plantilla', (cuerpo or '').strip() or f'[Plantilla: {nombre}]',
        {'plantilla': nombre, 'idioma': idioma or 'es', 'parametros': parametros},
        usuario=usuario, wa_message_id=wa_id, humano=True, ahora=ahora)


# ── Salientes de otros flujos (motor, cobro manual) ───────────────────────────

def registrar_saliente_cobro(rep, telefono, texto, origen, usuario=None, envio=None, wa_message_id=None,
                             tipo='texto'):
    """
    Anota en la conversación del número un mensaje de cobro ya enviado por el
    motor o por Morosos. Nunca rompe el envío: ante cualquier error lo registra en el log.
    """
    try:
        tel = normalizar_telefono(telefono)
        if not tel:
            return None
        conv = obtener_conversacion(tel)
        return registrar_saliente(
            conv, tipo, texto, {'origen': origen}, usuario=usuario, wa_message_id=wa_message_id,
            envio=envio)
    except Exception:
        logger.exception('No se pudo registrar el cobro de %s en la conversación', getattr(rep, 'id', rep))
        return None


# ── Consultas de apoyo ────────────────────────────────────────────────────────

def q_visibles(sedes):
    """Conversaciones de las sedes accesibles (más las sin vincular / sin sede)."""
    q = Q(sede__isnull=True)
    reales = [s for s in sedes if s is not None]
    if reales:
        q |= Q(sede_id__in=reales)
    return q


def total_no_leidos(sedes):
    from django.db.models import Sum
    return ConversacionWhatsApp.objects.filter(q_visibles(sedes)).aggregate(
        t=Sum('no_leidos'))['t'] or 0


# ── Variables de las respuestas rápidas ───────────────────────────────────────

def variables_conversacion(conv):
    """Valores de {nombre}, {saldo_usd}, {saldo_bs}, {alumnos}, {link_portal}, {datos_bancarios}."""
    from cobranza.models import CicloCobranza
    from .cobro_whatsapp import _datos_bancarios_texto
    rep = conv.representante
    cfg = services._config_colegio()
    vars_ = {'nombre': rep.nombre if rep else (conv.nombre_contacto or ''), 'saldo_usd': '',
             'saldo_bs': '', 'alumnos': '', 'link_portal': cfg['portal_url'],
             'datos_bancarios': _datos_bancarios_texto()}
    if rep is not None:
        ciclos = list(CicloCobranza.objects.filter(
            mensualidad__alumno__representante=rep, estado__in=CicloCobranza.ESTADOS_ABIERTOS
        ).select_related('mensualidad__alumno'))
        total = sum((c.mensualidad.monto_usd - c.mensualidad.monto_pagado for c in ciclos), Decimal('0.00'))
        nombres = sorted({f'{c.mensualidad.alumno.nombre} {c.mensualidad.alumno.apellido}' for c in ciclos})
        vars_['saldo_usd'] = f'{total:.2f}'
        vars_['saldo_bs'] = services.montos_ref(total)['monto_bs']
        vars_['alumnos'] = (', '.join(nombres[:-1]) + ' y ' + nombres[-1]) if len(nombres) > 1 else ''.join(nombres)
    return vars_


def aplicar_variables(cuerpo, variables):
    """Reemplaza {variable}; las desconocidas se dejan tal cual."""
    return re.sub(r'\{(\w+)\}', lambda m: variables.get(m.group(1), m.group(0)), cuerpo)


def renderizar_respuesta(cuerpo, conv):
    return aplicar_variables(cuerpo, variables_conversacion(conv))
