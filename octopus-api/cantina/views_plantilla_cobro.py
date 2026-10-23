"""Vistas de la plantilla de cobro de CxC (PDF y envío por WhatsApp) — ver plantilla_cobro.py."""
import logging

from django.conf import settings
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_date
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from cobranza.recibo_cobranza import fmt_bs
from notificaciones.services import (
    _config_colegio, _normalizar_telefono, _notif_cfg, _proveedor_whatsapp, enviar_whatsapp_documento,
)
from secretaria.models import Representante

from .models import ClienteCantina
from .permissions import EsCajeroOAdmin
from .plantilla_cobro import (
    PlantillaCobroError,
    datos_plantilla,
    generar_pdf_plantilla_cobro,
    nombre_archivo,
)
from .serializers_cxc import AREAS_VALIDAS, tasa_vigente_valor

logger = logging.getLogger(__name__)


def _texto(datos, nombre):
    return str(datos.get(nombre) or '').strip()


def _fecha_param(datos, nombre):
    crudo = _texto(datos, nombre)
    if not crudo:
        return None
    fecha = None
    try:
        fecha = parse_date(crudo)
    except ValueError:
        pass
    if fecha is None:
        raise ValidationError({nombre: 'Fecha inválida; use el formato AAAA-MM-DD.'})
    return fecha


def _id_param(datos, nombre):
    crudo = _texto(datos, nombre)
    if not crudo:
        return None
    if not crudo.isdigit():
        raise ValidationError({nombre: 'Identificador inválido.'})
    return int(crudo)


def _construir_datos(datos):
    """
    Valida los parámetros (query string del GET o cuerpo del POST) y devuelve
    (titular, datos_plantilla, error). Lanza ValidationError (400) si los
    parámetros son inválidos; `error` es una Response 400 por reglas de negocio
    (sin tasa, sin cargos pendientes).
    """
    representante_id = _id_param(datos, 'representante')
    cliente_id = _id_param(datos, 'cliente')
    if (representante_id is None) == (cliente_id is None):
        raise ValidationError({'detail': 'Indique exactamente uno: representante o cliente.'})

    area = _texto(datos, 'area') or None
    if area and area not in AREAS_VALIDAS:
        raise ValidationError({'area': "Área inválida; use 'cantina' o 'libreria'."})
    fecha_inicio = _fecha_param(datos, 'fecha_inicio')
    fecha_fin = _fecha_param(datos, 'fecha_fin')
    if fecha_inicio and fecha_fin and fecha_inicio > fecha_fin:
        raise ValidationError({'fecha_fin': 'La fecha final no puede ser anterior a la inicial.'})

    titular = (
        get_object_or_404(Representante, pk=representante_id) if representante_id is not None
        else get_object_or_404(ClienteCantina, pk=cliente_id)
    )
    tasa = tasa_vigente_valor()
    if tasa is None:
        return titular, None, Response(
            {'detail': 'No hay una tasa de cambio configurada para Cantina.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        datos_pc = datos_plantilla(titular, tasa, area=area, fecha_inicio=fecha_inicio, fecha_fin=fecha_fin)
    except PlantillaCobroError as exc:
        return titular, None, Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return titular, datos_pc, None


class PlantillaCobroView(APIView):
    """
    GET ?representante=<id> | ?cliente=<id> [&area=cantina|libreria]
        [&fecha_inicio=AAAA-MM-DD] [&fecha_fin=AAAA-MM-DD]
    PDF con el estado de cuenta a cobrar, en bolívares a la tasa vigente de Cantina.
    """
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request):
        titular, datos, error = _construir_datos(request.query_params)
        if error is not None:
            return error
        try:
            pdf = generar_pdf_plantilla_cobro(datos)
        except Exception:
            logger.exception('Error generando la plantilla de cobro de %s', titular)
            return Response({'detail': 'No se pudo generar la plantilla de cobro.'},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        return FileResponse(
            pdf, as_attachment=False, filename=nombre_archivo(datos), content_type='application/pdf',
        )


def _whatsapp_meta_configurado():
    """El envío de documentos solo funciona con Meta Cloud API y credenciales."""
    if _proveedor_whatsapp() != 'meta':
        return False
    cfg = _notif_cfg()
    token = (cfg.meta_whatsapp_token if cfg else '') or getattr(settings, 'META_WHATSAPP_TOKEN', '')
    phone_id = (cfg.meta_whatsapp_phone_id if cfg else '') or getattr(settings, 'META_WHATSAPP_PHONE_ID', '')
    return bool(token and phone_id)


class PlantillaCobroWhatsAppView(APIView):
    """
    POST {representante|cliente, area?, fecha_inicio?, fecha_fin?, telefono?}
    Envía por WhatsApp (Meta Cloud API) el PDF de la plantilla de cobro al
    titular. Sin `telefono` usa el del titular. El envío queda registrado en
    el historial de notificaciones (tipo cobro_whatsapp).
    """
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def post(self, request):
        titular, datos, error = _construir_datos(request.data)
        if error is not None:
            return error

        indicado = _texto(request.data, 'telefono')
        telefono = _normalizar_telefono(indicado or datos['titular']['telefono'])
        if not telefono:
            mensaje = (
                'El teléfono indicado no es válido.' if indicado
                else 'El titular no tiene un teléfono válido registrado; indique uno para enviar.'
            )
            return Response({'detail': mensaje}, status=status.HTTP_400_BAD_REQUEST)

        if not _whatsapp_meta_configurado():
            return Response(
                {'detail': 'WhatsApp no está configurado para enviar documentos. '
                           'Configure WhatsApp (Meta) en Notificaciones.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            pdf = generar_pdf_plantilla_cobro(datos).getvalue()
        except Exception:
            logger.exception('Error generando la plantilla de cobro de %s', titular)
            return Response({'detail': 'No se pudo generar la plantilla de cobro.'},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        nombre = datos['titular']['nombre']
        total_bs = fmt_bs(datos['total_bs'])
        caption = (
            f"*{_config_colegio()['nombre_colegio']}*\n\n"
            f"Hola {nombre}, le enviamos su estado de cuenta por cobrar. "
            f"Total a pagar: Bs {total_bs}."
        )
        enviado = enviar_whatsapp_documento(
            telefono, pdf, nombre_archivo(datos), caption, tipo='cobro_whatsapp',
            representante_cedula=datos['titular']['documento'],
            parametros_plantilla=[nombre, total_bs],
        )
        if not enviado:
            return Response(
                {'detail': 'WhatsApp no pudo entregar el mensaje. Revise el historial de notificaciones.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({'telefono': telefono, 'total_bs': str(datos['total_bs']),
                         'detail': 'Plantilla de cobro enviada por WhatsApp.'})
