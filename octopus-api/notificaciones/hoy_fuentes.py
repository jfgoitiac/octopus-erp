"""
Tarjetas de la pestaña Hoy que salen de las conversaciones de WhatsApp
(PLAN_COBRANZA_INTELIGENTE_V4.md §1.2). Se registran con `hoy.registrar_fuente`
al arrancar la app (ver apps.py):

  conversacion_espera:<id>   requiere_humano, o el representante escribió y nadie
                             respondió en más de 2 h
  conversacion_tomada:<id>   tomada por el cobrador sin mensajes suyos en más de 24 h
  comprobante_whatsapp:<id>  imagen o PDF recibido por WhatsApp sin asignar (Fase C)
"""
from datetime import timedelta

from django.db.models import F, Q

from cobranza.hoy import _accion, _tarjeta, registrar_fuente

from .conversaciones import q_visibles
from .models import ConversacionWhatsApp, MensajeWhatsApp

HORAS_SIN_RESPUESTA = 2
HORAS_TOMADA_SIN_ACTIVIDAD = 24
DIAS_VISIBLE_ESPERA = 14   # una conversación vieja sin respuesta no genera tarjetas eternas


def _rep(conv):
    r = conv.representante
    if r is None:
        return None
    return {'id': r.id, 'nombre': f'{r.nombre} {r.apellido}', 'cedula': r.cedula, 'telefono': r.telefono}


def _nombre(conv):
    r = conv.representante
    return f'{r.nombre} {r.apellido}' if r else (conv.nombre_contacto or conv.telefono)


@registrar_fuente
def tarjetas_conversaciones_esperando(ctx):
    """Conversación esperando respuesta humana."""
    ahora = ctx.ahora
    sin_responder = (
        Q(ultimo_entrante_en__lte=ahora - timedelta(hours=HORAS_SIN_RESPUESTA),
          ultimo_entrante_en__gte=ahora - timedelta(days=DIAS_VISIBLE_ESPERA))
        & (Q(ultimo_humano_en__isnull=True) | Q(ultimo_humano_en__lt=F('ultimo_entrante_en')))
    )
    convs = (ConversacionWhatsApp.objects.filter(q_visibles(ctx.sedes))
             .filter(Q(requiere_humano=True) | sin_responder)
             .select_related('representante').order_by('-ultimo_entrante_en'))
    tarjetas = []
    for c in convs:
        por_que = []
        if c.requiere_humano:
            por_que.append({'texto': 'La familia pidió hablar con una persona o escribió algo que el '
                                     'sistema no entiende', 'puntos': 0})
        if c.ultimo_entrante_en and (c.ultimo_humano_en is None or c.ultimo_humano_en < c.ultimo_entrante_en) \
                and c.ultimo_entrante_en <= ahora - timedelta(hours=HORAS_SIN_RESPUESTA):
            horas = int((ahora - c.ultimo_entrante_en).total_seconds() // 3600)
            por_que.append({'texto': f'Escribió hace {horas} h y nadie le ha respondido', 'puntos': 0})
        if not por_que:
            continue
        tarjetas.append(_tarjeta(
            clave=f'conversacion_espera:{c.id}', tipo='conversacion_espera',
            prioridad=70 + (10 if c.requiere_humano else 0),
            titulo=f'{_nombre(c)}: espera una respuesta',
            por_que=por_que, representante=_rep(c),
            desde=c.ultimo_entrante_en or c.actualizado_en,
            acciones=[_accion('abrir_chat', 'Abrir chat', conversacion=c.id)],
            sede=c.sede_id, urgente=c.requiere_humano,
            detalle={'conversacion': c.id, 'telefono': c.telefono, 'requiere_humano': c.requiere_humano,
                     'no_leidos': c.no_leidos, 'estado': c.estado,
                     'ultimo_entrante_en': c.ultimo_entrante_en}))
    return tarjetas


@registrar_fuente
def tarjetas_conversaciones_tomadas(ctx):
    """Conversación tomada sin actividad del cobrador en más de 24 h."""
    limite = ctx.ahora - timedelta(hours=HORAS_TOMADA_SIN_ACTIVIDAD)
    convs = (ConversacionWhatsApp.objects.filter(q_visibles(ctx.sedes), estado=ConversacionWhatsApp.HUMANO)
             .select_related('representante'))
    tarjetas = []
    for c in convs:
        ultima = max((f for f in (c.tomada_en, c.ultimo_humano_en) if f), default=c.actualizado_en)
        if ultima > limite:
            continue
        horas = int((ctx.ahora - ultima).total_seconds() // 3600)
        tarjetas.append(_tarjeta(
            clave=f'conversacion_tomada:{c.id}', tipo='conversacion_tomada', prioridad=55,
            titulo=f'{_nombre(c)}: conversación tomada sin actividad',
            por_que=[{'texto': f'Está tomada y no hay mensajes del cobrador hace {horas} h; '
                               'mientras tanto no recibe recordatorios automáticos', 'puntos': 0}],
            representante=_rep(c), desde=ultima + timedelta(hours=HORAS_TOMADA_SIN_ACTIVIDAD),
            acciones=[_accion('abrir_chat', 'Responder', conversacion=c.id),
                      _accion('devolver_automatico', 'Devolver al automático', conversacion=c.id)],
            sede=c.sede_id,
            detalle={'conversacion': c.id, 'telefono': c.telefono, 'tomada_en': c.tomada_en,
                     'horas_sin_actividad': horas}))
    return tarjetas



@registrar_fuente
def tarjetas_comprobantes_por_asignar(ctx):
    """Comprobante recibido por WhatsApp sin asignar (el motor no le escribe al representante mientras tanto)."""
    mensajes = (MensajeWhatsApp.objects
                .filter(q_visibles(ctx.sedes, 'conversacion__'), direccion=MensajeWhatsApp.ENTRANTE,
                        estado_adjunto=MensajeWhatsApp.ADJUNTO_PENDIENTE)
                .select_related('conversacion__representante').order_by('creado_en'))
    from .views_conversaciones import serializar_adjunto
    tarjetas = []
    for m in mensajes:
        c = m.conversacion
        horas = max(0, int((ctx.ahora - m.creado_en).total_seconds() // 3600))
        vinculado = c.representante_id is not None
        acciones = [_accion('abrir_chat', 'Abrir chat', conversacion=c.id)]
        if vinculado:
            acciones.insert(0, _accion('convertir_comprobante', 'Asignar a mensualidad',
                                       mensaje=m.id, conversacion=c.id))
        acciones.append(_accion('descartar_comprobante', 'Descartar', mensaje=m.id, conversacion=c.id))
        por_que = [{'texto': f'Envió un comprobante por WhatsApp hace {horas} h y falta asignarlo a una '
                             'mensualidad; mientras tanto no recibe recordatorios', 'puntos': 0}]
        if not vinculado:
            por_que.append({'texto': 'La conversación no está vinculada a un representante: vincúlela '
                                     'antes de asignar el comprobante', 'puntos': 0})
        adjunto = serializar_adjunto(m)
        tarjetas.append(_tarjeta(
            clave=f'comprobante_whatsapp:{m.id}', tipo='comprobante_whatsapp', prioridad=75,
            titulo=f'{_nombre(c)}: comprobante recibido por WhatsApp sin asignar',
            por_que=por_que, representante=_rep(c), desde=m.creado_en, acciones=acciones,
            sede=c.sede_id, urgente=horas >= 24,
            detalle={'conversacion': c.id, 'mensaje': m.id, 'telefono': c.telefono,
                     'vinculado': vinculado, 'horas_sin_asignar': horas,
                     'adjunto': adjunto}))
        tarjetas[-1]['adjunto'] = adjunto
    return tarjetas
