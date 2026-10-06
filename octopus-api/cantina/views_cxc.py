"""Vistas de cuentas por cobrar (CxC) a representantes — PROMPT_CANTINA_CXC.md §3.3."""
import logging
import uuid as uuid_lib
from datetime import datetime
from decimal import Decimal
from io import BytesIO

from django.db.models import Exists, OuterRef, Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from cobranza.exports import ExcelExporter
from secretaria.models import Representante

from . import services_cxc
from .models import (
    AREAS,
    AbonoCantina,
    AperturaCajaCantina,
    CargoCantina,
    CreditoRepresentanteCantina,
)
from .permissions import EsAdminCantina, EsCajeroOAdmin
from .serializers_cxc import (
    AREAS_VALIDAS,
    AbonoInputSerializer,
    AnularAbonoInputSerializer,
    CreditoInputSerializer,
    a_ves,
    agrupar_abonos,
    anotar_saldos,
    limite_default,
    nombre_usuario,
    prefetch_alumnos,
    serializar_cargo,
    serializar_linea_abono,
    serializar_representante_resumen,
    tasa_vigente_valor,
)

logger = logging.getLogger(__name__)

MAX_RESULTADOS_BUSCADOR = 20
LONGITUD_MINIMA_BUSQUEDA = 2


def _area_param(request):
    area = (request.query_params.get('area') or '').strip()
    if not area:
        return None
    if area not in AREAS_VALIDAS:
        raise ValidationError({'area': "Área inválida; use 'cantina' o 'libreria'."})
    return area


def _representante_anotado(pk, area=None):
    qs = anotar_saldos(Representante.objects.filter(pk=pk, activo=True), area).prefetch_related(prefetch_alumnos())
    rep = qs.first()
    if rep is None:
        from django.http import Http404
        raise Http404('Representante no encontrado.')
    return rep


# ─────────────────────────────────────────────
# Buscador
# ─────────────────────────────────────────────
class BuscarRepresentanteCxcView(APIView):
    """GET ?q=: cada palabra debe coincidir (icontains) con cédula/nombre/apellido
    del representante o nombre/apellido/cédula escolar de uno de sus alumnos activos."""
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request):
        q = (request.query_params.get('q') or '').strip()
        if len(q) < LONGITUD_MINIMA_BUSQUEDA:
            raise ValidationError({'q': f'Escriba al menos {LONGITUD_MINIMA_BUSQUEDA} caracteres.'})

        qs = Representante.objects.filter(activo=True)
        for palabra in q.split():
            qs = qs.filter(
                Q(cedula__icontains=palabra)
                | Q(nombre__icontains=palabra)
                | Q(apellido__icontains=palabra)
                | Q(alumnos__activo=True, alumnos__nombre__icontains=palabra)
                | Q(alumnos__activo=True, alumnos__apellido__icontains=palabra)
                | Q(alumnos__activo=True, alumnos__cedula_escolar__icontains=palabra)
            )
        # Se filtra por ids para que el distinct() no choque con las anotaciones.
        ids = list(qs.order_by('apellido', 'nombre').values_list('pk', flat=True).distinct()[:MAX_RESULTADOS_BUSCADOR * 5])
        ids = list(dict.fromkeys(ids))[:MAX_RESULTADOS_BUSCADOR]
        reps = anotar_saldos(Representante.objects.filter(pk__in=ids)).prefetch_related(prefetch_alumnos()).order_by('apellido', 'nombre')
        default = limite_default()
        return Response([serializar_representante_resumen(r, default) for r in reps])


# ─────────────────────────────────────────────
# Cuentas (lista paginada) y Excel
# ─────────────────────────────────────────────
class _PaginacionCuentas(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100


def _cuentas_queryset(request):
    area = _area_param(request)
    cargos_rep = CargoCantina.objects.filter(representante=OuterRef('pk')).exclude(estado='anulado')
    if area:
        cargos_rep = cargos_rep.filter(area=area)
    qs = Representante.objects.filter(activo=True).annotate(tiene_cargos=Exists(cargos_rep)).filter(tiene_cargos=True)
    qs = anotar_saldos(qs, area)
    if request.query_params.get('con_deuda') in ('1', 'true', 'True'):
        qs = qs.filter(saldo_total__gt=0)
    return qs.order_by('-saldo_total', 'apellido', 'nombre')


class CuentasCxcView(APIView):
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request):
        qs = _cuentas_queryset(request).prefetch_related(prefetch_alumnos())
        paginador = _PaginacionCuentas()
        pagina = paginador.paginate_queryset(qs, request, view=self)
        default = limite_default()
        tasa = tasa_vigente_valor()
        data = [serializar_representante_resumen(r, default, tasa, con_totales=True) for r in pagina]
        return paginador.get_paginated_response(data)


class CuentasCxcExcelView(APIView):
    permission_classes = [permissions.IsAuthenticated, EsAdminCantina]

    def get(self, request):
        qs = _cuentas_queryset(request)
        ahora = timezone.now()
        columns = [
            ('Cédula', 'cedula'),
            ('Representante', lambda r: f'{r.nombre} {r.apellido}'),
            ('Teléfono', 'telefono'),
            ('Deuda USD', 'saldo_total'),
            ('Deuda Cantina USD', 'saldo_cantina'),
            ('Deuda Librería USD', 'saldo_libreria'),
            ('Días de la deuda más antigua', lambda r: max((ahora - r.deuda_mas_antigua).days, 0) if r.deuda_mas_antigua else ''),
        ]
        return ExcelExporter.export(qs, columns, 'cuentas_por_cobrar_cantina')


# ─────────────────────────────────────────────
# Estado de cuenta y crédito
# ─────────────────────────────────────────────
class EstadoCuentaCxcView(APIView):
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request, representante_id):
        area = _area_param(request)
        rep = _representante_anotado(representante_id, area)
        tasa = tasa_vigente_valor()

        cargos = CargoCantina.objects.filter(representante=rep).select_related('alumno', 'venta').prefetch_related(
            'venta__detalles__producto',
        ).order_by('creado_en', 'id')
        abonos = AbonoCantina.objects.filter(representante=rep).select_related('cajero', 'banco_receptor')
        if area:
            cargos = cargos.filter(area=area)
            abonos = abonos.filter(area=area)

        resumen = serializar_representante_resumen(rep, limite_default())
        return Response({
            'representante': {
                'id': rep.id, 'cedula': rep.cedula, 'nombre': rep.nombre, 'apellido': rep.apellido,
                'telefono': rep.telefono, 'alumnos': resumen['alumnos'],
            },
            'saldo_usd': str(rep.saldo_total),
            'saldo_ves_tasa_vigente': a_ves(rep.saldo_total, tasa),
            'limite_usd': resumen['limite_usd'],
            'bloqueado': resumen['bloqueado'],
            'cargos': [serializar_cargo(c) for c in cargos],
            'abonos': agrupar_abonos(abonos),
        })


class CreditoRepresentanteView(APIView):
    """PATCH {limite_usd, bloqueado}: override del límite de crédito (limite_usd=null → usa el default)."""
    permission_classes = [permissions.IsAuthenticated, EsAdminCantina]

    def patch(self, request, representante_id):
        rep = get_object_or_404(Representante, pk=representante_id, activo=True)
        ser = CreditoInputSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        datos = ser.validated_data
        if not datos:
            raise ValidationError({'detail': "Indique 'limite_usd' y/o 'bloqueado'."})

        credito, _ = CreditoRepresentanteCantina.objects.get_or_create(representante=rep)
        if 'limite_usd' in datos:
            credito.limite_usd = datos['limite_usd']
        if 'bloqueado' in datos:
            credito.bloqueado = datos['bloqueado']
        credito.save()
        return Response({
            'representante_id': rep.id,
            'limite_usd': str(services_cxc.limite_credito(rep)),
            'limite_personalizado': credito.limite_usd is not None,
            'bloqueado': credito.bloqueado,
        })


# ─────────────────────────────────────────────
# Abonos
# ─────────────────────────────────────────────
def _parsear_fecha_pago(valor):
    if not valor:
        return None
    dt = parse_datetime(valor)
    if dt is None:
        d = parse_date(valor)
        if d is None:
            raise ValidationError({'fecha_pago': 'Formato inválido; use YYYY-MM-DD o ISO 8601.'})
        return d
    return dt


def _es_fecha_pasada(fecha):
    if fecha is None:
        return False
    if isinstance(fecha, datetime):
        if timezone.is_naive(fecha):
            fecha = timezone.make_aware(fecha)
        fecha = timezone.localtime(fecha).date()
    return fecha < timezone.localdate()


def _respuesta_operacion(abonos, representante):
    primero = abonos[0]
    saldo = services_cxc.saldo_representante(representante)
    return {
        'operacion_uuid': str(primero.operacion_uuid),
        'representante_id': representante.id,
        'area': primero.area,
        'fecha_pago': primero.fecha_pago,
        'es_retroactivo': primero.es_retroactivo,
        'motivo': primero.motivo,
        'lineas': [serializar_linea_abono(a) for a in abonos],
        'total_usd': str(sum((a.monto_usd for a in abonos), Decimal('0.00'))),
        'saldo_usd': str(saldo),
        'saldo_ves_tasa_vigente': a_ves(saldo, tasa_vigente_valor()),
    }


class RegistrarAbonoView(APIView):
    """POST: abono mixto. Sin `fecha_pago` pasada → abono de caja (exige apertura
    abierta del cajero, D9). Con fecha pasada → retroactivo (solo admin, D8)."""
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def post(self, request):
        ser = AbonoInputSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        datos = ser.validated_data
        representante = get_object_or_404(Representante, pk=datos['representante_id'], activo=True)

        fecha_pago = _parsear_fecha_pago(datos.get('fecha_pago'))
        retroactivo = _es_fecha_pasada(fecha_pago)

        if retroactivo:
            if not EsAdminCantina().has_permission(request, self):
                return Response(
                    {'detail': 'Solo el administrador o director puede registrar pagos retroactivos.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            apertura = None
        else:
            apertura = AperturaCajaCantina.objects.filter(cajero=request.user, estado='abierta').first()
            if apertura is None:
                raise ValidationError({'detail': 'Debe tener una caja abierta para registrar abonos.'})

        abonos = services_cxc.registrar_abono(
            representante=representante,
            lineas=datos['lineas'],
            cajero=request.user,
            apertura=apertura,
            fecha_pago=fecha_pago if retroactivo else None,
            motivo=datos.get('motivo') or '',
            area=datos.get('area'),
        )
        return Response(_respuesta_operacion(abonos, representante), status=status.HTTP_201_CREATED)


class AnularAbonoView(APIView):
    permission_classes = [permissions.IsAuthenticated, EsAdminCantina]

    def post(self, request, operacion_uuid):
        ser = AnularAbonoInputSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        services_cxc.anular_abono(operacion_uuid, request.user, motivo=ser.validated_data['motivo'])
        abono = AbonoCantina.objects.filter(operacion_uuid=operacion_uuid).first()
        saldo = services_cxc.saldo_representante(abono.representante)
        return Response({
            'operacion_uuid': str(operacion_uuid),
            'estatus': 'anulado',
            'saldo_usd': str(saldo),
        })


# ─────────────────────────────────────────────
# Recibo PDF
# ─────────────────────────────────────────────
def generar_pdf_recibo_abono(abonos):
    """Recibo de una operación de abono (todas sus líneas), mismo estilo que el
    ticket de venta (`cantina.utils.generar_pdf_ticket`)."""
    from .utils import _get_config_colegio

    primero = abonos[0]
    rep = primero.representante
    nombre_colegio, rif_colegio = _get_config_colegio()
    metodo_labels = dict(AbonoCantina._meta.get_field('metodo_pago').choices)
    area_label = dict(AREAS).get(primero.area, primero.area)
    anulado = primero.estatus == 'anulado'

    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    margin = 0.8 * inch
    azul, oro, gris, red = HexColor('#1e293b'), HexColor('#f59e0b'), HexColor('#64748b'), HexColor('#dc2626')

    c.setFillColor(azul)
    c.setFont('Helvetica-Bold', 16)
    c.drawString(margin, height - 1 * inch, nombre_colegio.upper())
    c.setFillColor(gris)
    c.setFont('Helvetica', 9)
    if rif_colegio:
        c.drawString(margin, height - 1.2 * inch, rif_colegio)
    c.setFillColor(azul)
    c.setFont('Helvetica-Bold', 12)
    c.drawRightString(width - margin, height - 1 * inch, f'RECIBO DE ABONO — {area_label.upper()}')
    c.setFont('Helvetica', 9)
    c.drawRightString(width - margin, height - 1.25 * inch, f'Operación {str(primero.operacion_uuid)[:8].upper()}')
    c.setStrokeColor(oro)
    c.setLineWidth(2)
    c.line(margin, height - 1.6 * inch, width - margin, height - 1.6 * inch)

    c.setFillColor(azul)
    c.setFont('Helvetica', 10)
    y = height - 2.0 * inch
    c.drawString(margin, y, f'Representante: {rep.nombre} {rep.apellido}  ({rep.cedula})')
    y -= 0.22 * inch
    c.drawString(margin, y, f'Cajero: {nombre_usuario(primero.cajero)}')
    c.setFont('Helvetica', 9)
    fecha = timezone.localtime(primero.fecha_pago)
    c.drawRightString(width - margin, height - 2.0 * inch, f"Fecha: {fecha.strftime('%d/%m/%Y')}")
    c.drawRightString(width - margin, height - 2.22 * inch, f"Hora: {fecha.strftime('%H:%M')}")
    if primero.es_retroactivo:
        y -= 0.22 * inch
        c.setFont('Helvetica-Oblique', 9)
        c.drawString(margin, y, f'Pago retroactivo — {primero.motivo[:90]}')

    y -= 0.5 * inch
    c.setFillColor(azul)
    c.rect(margin, y, width - 2 * margin, 0.28 * inch, fill=1, stroke=0)
    c.setFillColor(HexColor('#ffffff'))
    c.setFont('Helvetica-Bold', 9)
    c.drawString(margin + 0.1 * inch, y + 0.08 * inch, 'MÉTODO')
    c.drawString(margin + 2.3 * inch, y + 0.08 * inch, 'REFERENCIA')
    c.drawRightString(width - margin - 1.3 * inch, y + 0.08 * inch, 'USD')
    c.drawRightString(width - margin, y + 0.08 * inch, 'BS')

    total = Decimal('0.00')
    y -= 0.3 * inch
    for ab in abonos:
        c.setFillColor(azul)
        c.setFont('Helvetica', 9)
        c.drawString(margin + 0.1 * inch, y + 0.1 * inch, metodo_labels.get(ab.metodo_pago, ab.metodo_pago))
        c.drawString(margin + 2.3 * inch, y + 0.1 * inch, (ab.referencia or '—')[:30])
        c.drawRightString(width - margin - 1.3 * inch, y + 0.1 * inch, f'$ {ab.monto_usd:,.2f}')
        c.drawRightString(width - margin, y + 0.1 * inch, f'Bs. {ab.monto_ves:,.2f}')
        total += ab.monto_usd
        y -= 0.3 * inch

    c.setStrokeColor(oro)
    c.setLineWidth(1.5)
    c.line(margin, y + 0.3 * inch, width - margin, y + 0.3 * inch)
    c.setFillColor(azul)
    c.setFont('Helvetica-Bold', 11)
    c.drawString(margin + 0.1 * inch, y + 0.08 * inch, 'TOTAL ABONADO (USD):')
    c.drawRightString(width - margin, y + 0.08 * inch, f'$ {total:,.2f}')

    saldo = services_cxc.saldo_representante(rep)
    y -= 0.35 * inch
    c.setFont('Helvetica', 9)
    c.setFillColor(gris)
    c.drawString(margin, y, f'Saldo pendiente actual de la cuenta: $ {saldo:,.2f}')
    y -= 0.2 * inch
    c.setFont('Helvetica-Oblique', 8)
    c.drawString(margin, y, f'* Tasa BCV aplicada: Bs. {primero.tasa_aplicada} — El monto en Bs. es referencial.')

    if anulado:
        c.saveState()
        c.setFillColor(red)
        c.setFillAlpha(0.35)
        c.translate(width / 2, height / 2)
        c.rotate(45)
        c.setFont('Helvetica-Bold', 90)
        c.drawCentredString(0, 0, 'ANULADO')
        c.restoreState()

    c.setFont('Helvetica', 7)
    c.setFillColor(HexColor('#94a3b8'))
    c.drawCentredString(width / 2, 0.6 * inch, 'Recibo generado automáticamente')
    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer


class ReciboAbonoPDFView(APIView):
    permission_classes = [permissions.IsAuthenticated, EsCajeroOAdmin]

    def get(self, request, operacion_uuid):
        abonos = list(
            AbonoCantina.objects.filter(operacion_uuid=operacion_uuid)
            .select_related('representante', 'cajero', 'banco_receptor').order_by('id')
        )
        if not abonos:
            return Response({'detail': 'No existe un abono con ese identificador.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            pdf = generar_pdf_recibo_abono(abonos)
        except Exception:
            logger.exception('Error generando recibo de abono %s', operacion_uuid)
            return Response({'error': 'No se pudo generar el recibo PDF.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        return FileResponse(
            pdf, as_attachment=False,
            filename=f'Recibo_Abono_{str(operacion_uuid)[:8]}.pdf',
            content_type='application/pdf',
        )
