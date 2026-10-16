"""Bitácora, alertas, parámetros y reapertura de caja — carril B4 (Fase 2). Contrato §3, §5–§7."""
from decimal import Decimal, InvalidOperation

from django.db import IntegrityError, transaction
from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from cantina.models import (
    AlertaCantina,
    AperturaCajaCantina,
    CierreCajaCantina,
    EventoAuditoriaCantina,
    ParametroAuditoriaCantina,
    ParametroCantina,
    ReaperturaCajaCantina,
)
from cantina.permissions import EsAdminCantina
from config.pagination import StandardResultsPagination

from .bitacora import registrar_evento, snapshot, verificar_cadena
from .serializers_bitacora import (
    AlertaSerializer,
    EventoBitacoraSerializer,
    ParametrosAuditoriaSerializer,
    etiquetas_objetos,
    valores_parametros,
)
from .views_base import VistaAuditoria
from .views_cierres import ParametroInvalido, error, parsear_area, parsear_rango_fechas

TIPOS_EVENTO = dict(EventoAuditoriaCantina.TIPOS)
TIPOS_ALERTA = dict(AlertaCantina.TIPOS)
ESTADOS_ALERTA = dict(AlertaCantina.ESTADOS)
SEVERIDADES = [clave for clave, _ in AlertaCantina.SEVERIDADES]


def _entero(request, nombre):
    valor = request.query_params.get(nombre)
    if valor in (None, ''):
        return None
    try:
        return int(valor)
    except ValueError:
        raise ParametroInvalido(f"El parámetro '{nombre}' debe ser un número entero.")


def _valores_multiples(request, nombre):
    """`?tipo=a&tipo=b` y también `?tipo=a,b`."""
    valores = []
    for crudo in request.query_params.getlist(nombre):
        valores.extend(v.strip() for v in crudo.split(',') if v.strip())
    return valores


def _primer_error(errores):
    """Errores de un serializer DRF → un mensaje legible (patrón `{"error": "..."}`)."""
    for campo, mensajes in errores.items():
        mensaje = mensajes[0] if isinstance(mensajes, list) else mensajes
        return str(mensaje) if campo == 'non_field_errors' else f'{campo}: {mensaje}'
    return 'Datos inválidos.'


# ─────────────────────────────────────────────
# §5 Bitácora
# ─────────────────────────────────────────────
class BitacoraListView(VistaAuditoria):
    """
    GET ?fecha_inicio=&fecha_fin=&tipo=&tipo=&usuario=&objeto_tipo=&objeto_id=&area=
    Bitácora paginada, más reciente primero. `hash` no se expone.
    """

    def get(self, request):
        try:
            fi, ff = parsear_rango_fechas(request)
            area = parsear_area(request)
            usuario_id = _entero(request, 'usuario')
        except ParametroInvalido as exc:
            return error(str(exc))
        tipos = _valores_multiples(request, 'tipo')
        desconocidos = [t for t in tipos if t not in TIPOS_EVENTO]
        if desconocidos:
            return error(f"Tipo de evento desconocido: {', '.join(desconocidos)}.")
        objeto_tipo = (request.query_params.get('objeto_tipo') or '').strip()
        objeto_id = (request.query_params.get('objeto_id') or '').strip()
        if objeto_id and not objeto_tipo:
            return error("El parámetro 'objeto_id' requiere 'objeto_tipo'.")

        eventos = EventoAuditoriaCantina.objects.filter(creado_en__date__gte=fi, creado_en__date__lte=ff)
        if tipos:
            eventos = eventos.filter(tipo__in=tipos)
        if usuario_id is not None:
            eventos = eventos.filter(usuario_id=usuario_id)
        if objeto_tipo:
            eventos = eventos.filter(objeto_tipo=objeto_tipo)
        if objeto_id:
            eventos = eventos.filter(objeto_id=objeto_id)
        if area:
            eventos = eventos.filter(area=area)
        eventos = eventos.order_by('-creado_en', '-id')

        paginador = StandardResultsPagination()
        pagina = paginador.paginate_queryset(eventos, request, view=self)
        contexto = {'etiquetas': etiquetas_objetos(pagina)}
        return paginador.get_paginated_response(
            EventoBitacoraSerializer(pagina, many=True, context=contexto).data
        )


class VerificarBitacoraView(VistaAuditoria):
    """GET: valida la cadena de hash completa de la bitácora."""

    def get(self, request):
        return Response(verificar_cadena())


# ─────────────────────────────────────────────
# §6 Alertas
# ─────────────────────────────────────────────
class AlertasListView(VistaAuditoria):
    """
    GET ?estado=abierta|atendida&tipo=&fecha_inicio=&fecha_fin=&area=
    Bandeja de alertas paginada. Sin fechas no se filtra por fecha: una
    alerta abierta de días anteriores debe seguir a la vista del Director.
    """

    def get(self, request):
        try:
            area = parsear_area(request)
            fi = ff = None
            if request.query_params.get('fecha_inicio') or request.query_params.get('fecha_fin'):
                fi, ff = parsear_rango_fechas(request)
        except ParametroInvalido as exc:
            return error(str(exc))
        estado = request.query_params.get('estado') or None
        if estado is not None and estado not in ESTADOS_ALERTA:
            return error("El parámetro 'estado' debe ser 'abierta' o 'atendida'.")
        tipos = _valores_multiples(request, 'tipo')
        desconocidos = [t for t in tipos if t not in TIPOS_ALERTA]
        if desconocidos:
            return error(f"Tipo de alerta desconocido: {', '.join(desconocidos)}.")

        alertas = AlertaCantina.objects.select_related('atendida_por')
        if estado:
            alertas = alertas.filter(estado=estado)
        if tipos:
            alertas = alertas.filter(tipo__in=tipos)
        if fi is not None:
            alertas = alertas.filter(fecha__gte=fi, fecha__lte=ff)
        if area:
            alertas = alertas.filter(area=area)
        alertas = alertas.order_by('-fecha', '-creado_en', '-id')

        paginador = StandardResultsPagination()
        pagina = paginador.paginate_queryset(alertas, request, view=self)
        return paginador.get_paginated_response(AlertaSerializer(pagina, many=True).data)


class AlertasResumenView(VistaAuditoria):
    """GET: conteo de alertas abiertas por severidad (badge del menú)."""

    def get(self, request):
        conteos = dict(
            AlertaCantina.objects.filter(estado='abierta')
            .values('severidad').annotate(n=Count('id')).values_list('severidad', 'n')
        )
        por_severidad = {severidad: conteos.get(severidad, 0) for severidad in reversed(SEVERIDADES)}
        return Response({'abiertas': sum(conteos.values()), 'por_severidad': por_severidad})


class AtenderAlertaView(VistaAuditoria):
    """
    POST {nota}: marca la alerta como atendida. La nota es obligatoria;
    `409` si ya estaba atendida. Registra `alerta_atendida`.
    """
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def post(self, request, pk):
        nota = str(request.data.get('nota') or '').strip()
        if not nota:
            return error('La nota de atención es obligatoria.')
        with transaction.atomic():
            alerta = get_object_or_404(AlertaCantina.objects.select_for_update(), pk=pk)
            if alerta.estado == 'atendida':
                return error('La alerta ya fue atendida.', status.HTTP_409_CONFLICT)
            alerta.estado = 'atendida'
            alerta.atendida_por = request.user
            alerta.atendida_en = timezone.now()
            alerta.nota_atencion = nota
            alerta.save(update_fields=['estado', 'atendida_por', 'atendida_en', 'nota_atencion'])
            registrar_evento(
                'alerta_atendida', objeto=alerta, request=request, area=alerta.area,
                antes={'estado': 'abierta'}, despues={'estado': 'atendida'}, motivo=nota,
            )
        return Response(AlertaSerializer(alerta).data)


# ─────────────────────────────────────────────
# §7 Parámetros
# ─────────────────────────────────────────────
class ParametrosAuditoriaView(VistaAuditoria):
    """
    GET: umbrales del motor de alertas. PUT: los actualiza (envío parcial
    permitido) y registra `parametros_auditoria` con los valores previos y
    nuevos. Un PUT sin cambios no escribe nada.
    """
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def get(self, request):
        parametros = ParametroAuditoriaCantina.obtener()
        return Response(ParametrosAuditoriaSerializer(parametros).data)

    def put(self, request):
        ParametroAuditoriaCantina.obtener()
        with transaction.atomic():
            parametros = (
                ParametroAuditoriaCantina.objects.select_for_update()
                .select_related('actualizado_por').get(pk=1)
            )
            serializer = ParametrosAuditoriaSerializer(parametros, data=request.data, partial=True)
            if not serializer.is_valid():
                return error(_primer_error(serializer.errors))
            cambios = {
                campo: valor for campo, valor in serializer.validated_data.items()
                if getattr(parametros, campo) != valor
            }
            if cambios:
                antes = valores_parametros(parametros)
                serializer.save(actualizado_por=request.user)
                registrar_evento(
                    'parametros_auditoria', objeto=parametros, request=request,
                    antes=antes, despues=valores_parametros(parametros),
                )
        return Response(ParametrosAuditoriaSerializer(parametros).data)


# ─────────────────────────────────────────────
# §3 Reapertura de caja (D4)
# ─────────────────────────────────────────────
_MENSAJE_CAJA_ABIERTA = 'El cajero ya tiene una caja abierta; debe cerrarla antes de reabrir este cierre.'


class ReabrirCajaView(VistaAuditoria):
    """
    POST {motivo, monto_inicial?}: reabre la caja de un cierre creando una
    apertura NUEVA para el mismo cajero y área; el cierre original no se toca.
    `monto_inicial` es opcional (por defecto, el de la apertura original).

    Respeta las reglas de `AperturaCajaCantinaView`, serializadas igual
    contra el singleton `ParametroCantina`: `409` si el cajero ya tiene una
    caja abierta o si el área llegó al máximo de aperturas simultáneas.
    `201 {"reapertura_id", "apertura_nueva_id"}`.
    """
    # D4: la reapertura la autoriza director o administrador (no el cajero).
    permission_classes = [EsAdminCantina]
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def post(self, request, pk):
        motivo = str(request.data.get('motivo') or '').strip()
        if not motivo:
            return error('El motivo de la reapertura es obligatorio.')
        cierre = get_object_or_404(CierreCajaCantina.objects.select_related('apertura'), pk=pk)

        monto_crudo = request.data.get('monto_inicial')
        if monto_crudo in (None, ''):
            monto_inicial = cierre.apertura.monto_inicial if cierre.apertura else Decimal('0.00')
        else:
            try:
                monto_inicial = Decimal(str(monto_crudo)).quantize(Decimal('0.01'))
            except (InvalidOperation, ValueError):
                return error("El campo 'monto_inicial' debe ser un número.")
            if monto_inicial < 0:
                return error('El monto inicial no puede ser negativo.')

        try:
            with transaction.atomic():
                if ParametroCantina.objects.select_for_update().first() is None:
                    ParametroCantina.objects.create()
                    ParametroCantina.objects.select_for_update().first()

                if AperturaCajaCantina.objects.filter(cajero_id=cierre.cajero_id, estado='abierta').exists():
                    return error(_MENSAJE_CAJA_ABIERTA, status.HTTP_409_CONFLICT)
                maximo = AperturaCajaCantina.MAX_APERTURAS_SIMULTANEAS
                if AperturaCajaCantina.objects.filter(estado='abierta', area=cierre.area).count() >= maximo:
                    return error(
                        f'Ya hay {maximo} cajas abiertas en {cierre.get_area_display()}; '
                        'un cajero debe cerrar la suya antes de reabrir este cierre.',
                        status.HTTP_409_CONFLICT,
                    )

                apertura = AperturaCajaCantina.objects.create(
                    cajero_id=cierre.cajero_id, area=cierre.area, monto_inicial=monto_inicial,
                )
                reapertura = ReaperturaCajaCantina.objects.create(
                    cierre_original=cierre, apertura_nueva=apertura, motivo=motivo,
                    autorizado_por=request.user,
                )
                # La apertura nueva también deja su `apertura_caja`, como toda
                # apertura (B1), para que el turno tenga su historial completo.
                registrar_evento(
                    'apertura_caja', objeto=apertura, request=request, area=cierre.area,
                    despues=snapshot(apertura, ['monto_inicial', 'area']),
                    motivo=f'Reapertura del cierre #{cierre.id}',
                )
                registrar_evento(
                    'reapertura_caja', objeto=reapertura, request=request, area=cierre.area,
                    antes={'cierre_id': cierre.id, 'apertura_id': cierre.apertura_id},
                    despues={'apertura_nueva_id': apertura.id},
                    motivo=motivo,
                )
        except IntegrityError:
            # Carrera con una apertura simultánea del mismo cajero
            # (constraint unica_apertura_abierta_por_cajero).
            return error(_MENSAJE_CAJA_ABIERTA, status.HTTP_409_CONFLICT)

        return Response(
            {'reapertura_id': reapertura.id, 'apertura_nueva_id': apertura.id},
            status=status.HTTP_201_CREATED,
        )
