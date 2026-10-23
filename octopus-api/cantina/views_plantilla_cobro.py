"""Vista de la plantilla de cobro de CxC (PDF) — ver plantilla_cobro.py."""
import logging

from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_date
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

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


def _fecha_param(request, nombre):
    crudo = (request.query_params.get(nombre) or '').strip()
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


def _id_param(request, nombre):
    crudo = (request.query_params.get(nombre) or '').strip()
    if not crudo:
        return None
    if not crudo.isdigit():
        raise ValidationError({nombre: 'Identificador inválido.'})
    return int(crudo)


class PlantillaCobroView(APIView):
    """
    GET ?representante=<id> | ?cliente=<id> [&area=cantina|libreria]
        [&fecha_inicio=AAAA-MM-DD] [&fecha_fin=AAAA-MM-DD]
    PDF con el estado de cuenta a cobrar, en bolívares a la tasa vigente de Cantina.
    """
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request):
        representante_id = _id_param(request, 'representante')
        cliente_id = _id_param(request, 'cliente')
        if (representante_id is None) == (cliente_id is None):
            raise ValidationError({'detail': 'Indique exactamente uno: representante o cliente.'})

        area = (request.query_params.get('area') or '').strip() or None
        if area and area not in AREAS_VALIDAS:
            raise ValidationError({'area': "Área inválida; use 'cantina' o 'libreria'."})
        fecha_inicio = _fecha_param(request, 'fecha_inicio')
        fecha_fin = _fecha_param(request, 'fecha_fin')
        if fecha_inicio and fecha_fin and fecha_inicio > fecha_fin:
            raise ValidationError({'fecha_fin': 'La fecha final no puede ser anterior a la inicial.'})

        titular = (
            get_object_or_404(Representante, pk=representante_id) if representante_id is not None
            else get_object_or_404(ClienteCantina, pk=cliente_id)
        )
        tasa = tasa_vigente_valor()
        if tasa is None:
            return Response(
                {'detail': 'No hay una tasa de cambio configurada para Cantina.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            datos = datos_plantilla(titular, tasa, area=area, fecha_inicio=fecha_inicio, fecha_fin=fecha_fin)
        except PlantillaCobroError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        try:
            pdf = generar_pdf_plantilla_cobro(datos)
        except Exception:
            logger.exception('Error generando la plantilla de cobro de %s', titular)
            return Response({'detail': 'No se pudo generar la plantilla de cobro.'},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        return FileResponse(
            pdf, as_attachment=False, filename=nombre_archivo(datos), content_type='application/pdf',
        )
