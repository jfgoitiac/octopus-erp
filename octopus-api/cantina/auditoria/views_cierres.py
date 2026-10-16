"""Cierres diarios y su revisión — carril B2 (Fase 1). Contrato §3."""
import mimetypes
from datetime import datetime

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Count, Prefetch, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from cantina.models import (
    AdjuntoRevision,
    CierreCajaCantina,
    EventoAuditoriaCantina,
    ReaperturaCajaCantina,
    RevisionCierre,
    VentaCantina,
)
from config.pagination import StandardResultsPagination

from .bitacora import registrar_evento
from .models import AREAS, validar_adjunto_revision
from .serializers_cierres import (
    AdjuntoRevisionSerializer,
    CierreDetalleSerializer,
    CierreFilaSerializer,
    EventoAuditoriaSerializer,
    asegurar_revisiones,
    queryset_cierres,
)
from .views_base import VistaAuditoria

ESTADOS_REVISION = {clave for clave, _ in RevisionCierre.ESTADOS}
AREAS_VALIDAS = {clave for clave, _ in AREAS}


class ParametroInvalido(ValueError):
    """Query param inválido; el mensaje va tal cual en el 400."""


def error(mensaje, codigo=status.HTTP_400_BAD_REQUEST):
    return Response({'error': mensaje}, status=codigo)


def parsear_area(request):
    area = request.query_params.get('area') or None
    if area is not None and area not in AREAS_VALIDAS:
        raise ParametroInvalido("El parámetro 'area' debe ser 'cantina' o 'libreria'.")
    return area


def parsear_rango_fechas(request):
    """`fecha_inicio`/`fecha_fin` en YYYY-MM-DD; cada una omitida → hoy (§0)."""
    hoy = timezone.localdate()
    try:
        fi = _fecha(request.query_params.get('fecha_inicio')) or hoy
        ff = _fecha(request.query_params.get('fecha_fin')) or hoy
    except ValueError:
        raise ParametroInvalido('Formato de fecha inválido. Use YYYY-MM-DD.')
    if fi > ff:
        raise ParametroInvalido('fecha_inicio no puede ser posterior a fecha_fin.')
    return fi, ff


def _fecha(valor):
    return datetime.strptime(valor, '%Y-%m-%d').date() if valor else None


def _entero(request, nombre):
    valor = request.query_params.get(nombre)
    if valor in (None, ''):
        return None
    try:
        return int(valor)
    except ValueError:
        raise ParametroInvalido(f"El parámetro '{nombre}' debe ser un número entero.")


def _obtener_cierre(pk):
    """Cierre del detalle (con prefetch de adjuntos y reaperturas). Si es un
    cierre antiguo sin revisión, la crea en 'pendiente'."""
    cierre_base = get_object_or_404(CierreCajaCantina, pk=pk)
    RevisionCierre.objects.get_or_create(cierre=cierre_base)
    return (
        queryset_cierres()
        .prefetch_related(
            Prefetch('revision__adjuntos', queryset=AdjuntoRevision.objects.select_related('subido_por')),
            Prefetch('reaperturas', queryset=ReaperturaCajaCantina.objects.select_related('autorizado_por')),
        )
        .get(pk=pk)
    )


def _resumen_ventas(cierre):
    """Conteos de ventas del turno del cierre, en una sola consulta."""
    if cierre.apertura_id:
        ventas = VentaCantina.objects.filter(apertura_id=cierre.apertura_id)
    else:
        # Cierres anteriores a la apertura por cajero: ventas del cajero en
        # ese día y área sin apertura asociada.
        ventas = VentaCantina.objects.filter(
            apertura__isnull=True, cajero_id=cierre.cajero_id, area=cierre.area,
            creado_en__date=cierre.fecha,
        )
    completadas = Q(estado='completada')
    return ventas.aggregate(
        cantidad=Count('id', filter=completadas),
        anuladas=Count('id', filter=Q(estado='anulada')),
        con_descuento=Count('id', filter=completadas & Q(descuento_usd__gt=0)),
        manuales=Count('id', filter=completadas & Q(es_manual=True)),
    )


def respuesta_detalle(pk):
    cierre = _obtener_cierre(pk)
    return CierreDetalleSerializer(cierre, context={'resumen_ventas': _resumen_ventas(cierre)}).data


class CierresListView(VistaAuditoria):
    """
    GET ?fecha_inicio=&fecha_fin=&cajero=&area=&apertura=&estado=&con_diferencia=true
    Listado paginado de cierres (más recientes primero).
    """

    def get(self, request):
        try:
            fi, ff = parsear_rango_fechas(request)
            area = parsear_area(request)
            cajero_id = _entero(request, 'cajero')
            apertura_id = _entero(request, 'apertura')
        except ParametroInvalido as exc:
            return error(str(exc))
        estado = request.query_params.get('estado') or None
        if estado is not None and estado not in ESTADOS_REVISION:
            return error("El parámetro 'estado' debe ser pendiente, revisado, aprobado u observado.")

        asegurar_revisiones()
        cierres = queryset_cierres().filter(fecha__gte=fi, fecha__lte=ff)
        if area:
            cierres = cierres.filter(area=area)
        if cajero_id is not None:
            cierres = cierres.filter(cajero_id=cajero_id)
        if apertura_id is not None:
            cierres = cierres.filter(apertura_id=apertura_id)
        if estado:
            cierres = cierres.filter(revision__estado=estado)
        if request.query_params.get('con_diferencia', '').lower() == 'true':
            cierres = cierres.exclude(diferencia__isnull=True).exclude(diferencia=0)
        cierres = cierres.order_by('-fecha', '-cerrado_en', '-id')

        paginador = StandardResultsPagination()
        pagina = paginador.paginate_queryset(cierres, request, view=self)
        return paginador.get_paginated_response(CierreFilaSerializer(pagina, many=True).data)


class CierreDetalleView(VistaAuditoria):
    """GET: detalle del cierre con desglose por método, revisión, adjuntos y reaperturas."""

    def get(self, request, pk):
        return Response(respuesta_detalle(pk))


class RevisarCierreView(VistaAuditoria):
    """
    POST {estado, comentario}: mueve la revisión del cierre. El comentario es
    obligatorio para 'observado'. Transición no permitida → 409. Devuelve el
    detalle completo. Registra `revision_cierre` en la misma transacción.
    """
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def post(self, request, pk):
        cierre = get_object_or_404(CierreCajaCantina, pk=pk)
        nuevo_estado = str(request.data.get('estado') or '').strip()
        comentario = str(request.data.get('comentario') or '').strip()
        if nuevo_estado not in ESTADOS_REVISION:
            return error("El campo 'estado' debe ser pendiente, revisado, aprobado u observado.")
        if nuevo_estado == 'observado' and not comentario:
            return error('El comentario es obligatorio para marcar el cierre como observado.')

        RevisionCierre.objects.get_or_create(cierre=cierre)
        with transaction.atomic():
            revision = RevisionCierre.objects.select_for_update().get(cierre=cierre)
            estado_anterior = revision.estado
            if not revision.puede_pasar_a(nuevo_estado):
                return error(
                    f"No se puede pasar la revisión de '{estado_anterior}' a '{nuevo_estado}'.",
                    status.HTTP_409_CONFLICT,
                )
            revision.estado = nuevo_estado
            revision.comentario_director = comentario
            revision.revisado_por = request.user
            revision.revisado_en = timezone.now()
            revision.save(update_fields=[
                'estado', 'comentario_director', 'revisado_por', 'revisado_en', 'actualizado_en',
            ])
            registrar_evento(
                'revision_cierre', objeto=cierre, request=request,
                antes={'estado': estado_anterior}, despues={'estado': nuevo_estado},
                motivo=comentario, area=cierre.area,
            )
        return Response(respuesta_detalle(pk))


class AdjuntosCierreView(VistaAuditoria):
    """
    POST multipart {archivo, descripcion?, reemplaza_a?}: adjunta un respaldo
    del Director a la revisión del cierre. Nada se borra: un reemplazo crea un
    adjunto nuevo que apunta al anterior. `201` con el adjunto.
    """
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        cierre = get_object_or_404(CierreCajaCantina, pk=pk)
        archivo = request.FILES.get('archivo')
        if archivo is None:
            return error("El campo 'archivo' es obligatorio.")
        try:
            validar_adjunto_revision(archivo)
        except ValidationError as exc:
            return error(' '.join(exc.messages))

        descripcion = str(request.data.get('descripcion') or '').strip()
        if len(descripcion) > 255:
            return error('La descripción no puede superar 255 caracteres.')
        reemplaza_id = None
        if request.data.get('reemplaza_a') not in (None, ''):
            try:
                reemplaza_id = int(request.data.get('reemplaza_a'))
            except (TypeError, ValueError):
                return error("El campo 'reemplaza_a' debe ser el id de un adjunto.")

        RevisionCierre.objects.get_or_create(cierre=cierre)
        with transaction.atomic():
            # El lock sobre la revisión serializa los reemplazos concurrentes
            # del mismo adjunto.
            revision = RevisionCierre.objects.select_for_update().get(cierre=cierre)
            reemplaza = None
            if reemplaza_id is not None:
                reemplaza = AdjuntoRevision.objects.filter(pk=reemplaza_id, revision=revision).first()
                if reemplaza is None:
                    return error('El adjunto a reemplazar no pertenece a este cierre.')
                if AdjuntoRevision.objects.filter(reemplaza_a=reemplaza).exists():
                    return error('Ese adjunto ya fue reemplazado; reemplace la versión más reciente.')

            nombre = archivo.name[:255]
            adjunto = AdjuntoRevision.objects.create(
                revision=revision,
                archivo=archivo,
                nombre_original=nombre,
                tipo_mime=(archivo.content_type or mimetypes.guess_type(nombre)[0] or '')[:100],
                tamano_bytes=archivo.size,
                descripcion=descripcion,
                reemplaza_a=reemplaza,
                subido_por=request.user,
            )
            registrar_evento(
                'adjunto_cierre', objeto=cierre, request=request,
                despues={'adjunto_id': adjunto.id, 'nombre': nombre},
                motivo=descripcion, area=cierre.area,
            )
        return Response(AdjuntoRevisionSerializer(adjunto).data, status=status.HTTP_201_CREATED)


class HistorialCierreView(VistaAuditoria):
    """
    GET: eventos de bitácora del cierre, de su apertura (turno) y de sus
    reaperturas (y las aperturas nuevas que crearon), en orden cronológico.
    Lista simple (sin paginar): un cierre tiene pocos eventos.
    """

    def get(self, request, pk):
        cierre = get_object_or_404(CierreCajaCantina, pk=pk)
        reaperturas = list(
            ReaperturaCajaCantina.objects.filter(cierre_original=cierre).values_list('id', 'apertura_nueva_id')
        )
        aperturas = [str(apertura_id) for _, apertura_id in reaperturas]
        if cierre.apertura_id:
            aperturas.append(str(cierre.apertura_id))

        filtro = Q(objeto_tipo='cierrecajacantina', objeto_id=str(cierre.id))
        if aperturas:
            filtro |= Q(objeto_tipo='aperturacajacantina', objeto_id__in=aperturas)
        if reaperturas:
            filtro |= Q(objeto_tipo='reaperturacajacantina', objeto_id__in=[str(r) for r, _ in reaperturas])

        eventos = EventoAuditoriaCantina.objects.filter(filtro).order_by('creado_en', 'id')
        return Response(EventoAuditoriaSerializer(eventos, many=True).data)
