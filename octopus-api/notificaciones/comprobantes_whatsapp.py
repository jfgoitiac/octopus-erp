"""
Comprobantes recibidos por WhatsApp (PLAN_COBRANZA_INTELIGENTE_V4.md §1.4, Fase C).

El webhook guarda el adjunto con `estado_adjunto='pendiente'` y el motor deja de
escribirle al representante. El cobrador lo resuelve de una de dos formas:

  convertir_en_comprobantes  elige la(s) mensualidad(es) y se crea un `ComprobantePago`
                             del portal por cada una (mismo modelo y mismo flujo de
                             revisión y aprobación que los que sube el representante:
                             `AdminComprobantesView`). NO se duplica ese flujo.
  descartar                  lo marca descartado con un motivo.

En ambos casos el mensaje deja de estar pendiente y el motor vuelve a poder escribir.
"""
import hashlib
import logging

from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone

from . import conversaciones
from .conversaciones import ErrorConversacion
from .models import MensajeWhatsApp

logger = logging.getLogger(__name__)

METODOS_VALIDOS = ('transferencia', 'pago_movil', 'punto_de_venta', 'zelle', 'efectivo', 'otro')
MAX_MOTIVO = 300


class AdjuntoNoResoluble(ErrorConversacion):
    """El adjunto no está pendiente o la solicitud no es válida (400)."""


def _exigir_pendiente(msg):
    if msg.direccion != MensajeWhatsApp.ENTRANTE or not msg.adjunto:
        raise AdjuntoNoResoluble('El mensaje no tiene un adjunto recibido por WhatsApp.')
    if msg.estado_adjunto != MensajeWhatsApp.ADJUNTO_PENDIENTE:
        raise AdjuntoNoResoluble(
            f'Este adjunto ya fue {msg.get_estado_adjunto_display().lower() or "procesado"}.')


def mensualidades_pendientes(rep):
    """Mensualidades impagas de los alumnos activos del representante (para elegir al convertir)."""
    from cobranza.models import Mensualidad
    from portal.models import ComprobantePago
    filas = []
    qs = (Mensualidad.objects.filter(alumno__representante=rep, alumno__activo=True, pagado=False)
          .select_related('alumno').order_by('anio', 'mes', 'alumno__apellido'))
    con_pendiente = set(ComprobantePago.objects.filter(
        mensualidad__in=qs, estatus='pendiente').values_list('mensualidad_id', flat=True))
    for m in qs:
        filas.append({
            'id': m.id, 'alumno': f'{m.alumno.nombre} {m.alumno.apellido}', 'alumno_id': m.alumno_id,
            'mes': m.mes, 'anio': m.anio, 'periodo': f'{m.get_mes_display()} {m.anio}',
            'monto_usd': str(m.monto_usd), 'saldo_usd': str(m.monto_usd - m.monto_pagado),
            'tiene_comprobante_pendiente': m.id in con_pendiente,
        })
    return filas


def convertir_en_comprobantes(msg, mensualidad_ids, usuario, referencia='', metodo_pago='transferencia',
                              banco_receptor_id=None, ahora=None):
    """
    Crea un ComprobantePago (estatus 'pendiente', al flujo de revisión del portal)
    por cada mensualidad elegida, con el archivo recibido. Marca el adjunto como
    `convertido`. Valida que las mensualidades sean del representante vinculado,
    estén impagas y no tengan ya un comprobante pendiente, y aplica la misma regla
    antifraude del portal contra el mismo archivo (hash) ya enviado o aprobado.
    Devuelve la lista de ComprobantePago creados.
    """
    from cobranza.models import BancoInstitucional, Mensualidad
    from portal.models import ComprobantePago
    ahora = ahora or timezone.now()
    _exigir_pendiente(msg)
    conv = msg.conversacion
    if conv.representante_id is None:
        raise AdjuntoNoResoluble('Vincule la conversación a un representante antes de asignar el comprobante.')
    if not isinstance(mensualidad_ids, (list, tuple)) or not mensualidad_ids:
        raise AdjuntoNoResoluble('Elija al menos una mensualidad.')
    try:
        ids = sorted({int(i) for i in mensualidad_ids})
    except (TypeError, ValueError):
        raise AdjuntoNoResoluble('Las mensualidades deben ser una lista de ids.')
    metodo_pago = (metodo_pago or 'transferencia').strip().lower()
    if metodo_pago not in METODOS_VALIDOS:
        raise AdjuntoNoResoluble(f'Método de pago inválido. Use uno de: {", ".join(METODOS_VALIDOS)}.')
    referencia = ' '.join((referencia or '').upper().split()) or None
    banco = None
    if banco_receptor_id:
        banco = BancoInstitucional.objects.filter(pk=banco_receptor_id, activo=True).first()
        if banco is None:
            raise AdjuntoNoResoluble('Banco receptor no encontrado.')

    mensualidades = list(Mensualidad.objects.select_related('alumno').filter(
        id__in=ids, alumno__representante_id=conv.representante_id, alumno__activo=True, pagado=False))
    if len(mensualidades) != len(ids):
        raise AdjuntoNoResoluble('Alguna mensualidad no existe, ya está pagada o no es de este representante.')
    for m in mensualidades:
        if ComprobantePago.objects.filter(mensualidad=m, estatus='pendiente').exists():
            raise AdjuntoNoResoluble(
                f'{m.alumno.nombre} {m.alumno.apellido} ({m.get_mes_display()} {m.anio}) ya tiene un '
                'comprobante en revisión.')

    msg.adjunto.open('rb')
    try:
        contenido = msg.adjunto.read()
    finally:
        msg.adjunto.close()
    hash_sha256 = hashlib.sha256(contenido).hexdigest()
    repetido = ComprobantePago.objects.filter(
        hash_archivo=hash_sha256, estatus__in=['pendiente', 'aprobado']).first()
    if repetido:
        raise AdjuntoNoResoluble(
            f'Este archivo ya fue presentado como comprobante #{repetido.id} '
            f'({repetido.mensualidad.get_mes_display()} {repetido.mensualidad.anio}). '
            'Si es un comprobante distinto, descarte este adjunto.')
    if referencia:
        duplicado = ComprobantePago.objects.filter(
            referencia_bancaria=referencia, metodo_pago=metodo_pago,
            estatus__in=['pendiente', 'aprobado'], banco_receptor=banco).first()
        if duplicado:
            raise AdjuntoNoResoluble(
                f"La referencia '{referencia}' ya fue enviada en el comprobante #{duplicado.id}.")

    nombre = msg.adjunto.name.rsplit('/', 1)[-1]
    creados = []
    with transaction.atomic():
        for m in mensualidades:
            creados.append(ComprobantePago.objects.create(
                mensualidad=m, archivo=ContentFile(contenido, name=nombre),
                referencia_bancaria=referencia, metodo_pago=metodo_pago, banco_receptor=banco,
                hash_archivo=hash_sha256, subido_por_ip=None,
                observaciones=f'Recibido por WhatsApp ({conv.telefono}); asignado por '
                              f'{conversaciones._nombre_usuario(usuario) or "cobranza"}.'))
        msg.estado_adjunto = MensajeWhatsApp.ADJUNTO_CONVERTIDO
        msg.payload = {**msg.payload, 'comprobantes': [c.id for c in creados],
                       'resuelto_por': getattr(usuario, 'id', None), 'resuelto_en': ahora.isoformat()}
        msg.save(update_fields=['estado_adjunto', 'payload', 'actualizado_en'])
        periodos = ', '.join(f'{m.alumno.nombre} {m.get_mes_display()} {m.anio}' for m in mensualidades)
        conversaciones._evento_sistema(
            conv, f'Comprobante asignado a: {periodos}. Quedó en revisión de pagos.', usuario, ahora)
    return creados


def descartar(msg, motivo, usuario, ahora=None):
    """Marca el adjunto como descartado (con motivo obligatorio)."""
    ahora = ahora or timezone.now()
    _exigir_pendiente(msg)
    motivo = (motivo or '').strip()
    if not motivo:
        raise AdjuntoNoResoluble('Indique el motivo del descarte.')
    motivo = motivo[:MAX_MOTIVO]
    with transaction.atomic():
        msg.estado_adjunto = MensajeWhatsApp.ADJUNTO_DESCARTADO
        msg.payload = {**msg.payload, 'motivo_descarte': motivo,
                       'resuelto_por': getattr(usuario, 'id', None), 'resuelto_en': ahora.isoformat()}
        msg.save(update_fields=['estado_adjunto', 'payload', 'actualizado_en'])
        conversaciones._evento_sistema(msg.conversacion, f'Adjunto descartado: {motivo}', usuario, ahora)
    return msg
