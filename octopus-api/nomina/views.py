from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework import status, viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction, IntegrityError
from django.db.models import Q
from django.utils.dateparse import parse_date
from decimal import Decimal, InvalidOperation
import json
from cobranza.models import ParametroGlobal, TasaCambio
from .models import RegistroNomina, Empleado, ConceptoNomina, ParametroLegalNomina
from .serializers import (
    EmpleadoSerializer, ConceptoNominaSerializer, ParametroLegalNominaSerializer, RegistroNominaSerializer,
)
from .utils import GeneradorReciboNomina
from authentication.views import IsSystemAdminOrDirector


class ParametroLegalNominaViewSet(viewsets.ModelViewSet):
    queryset = ParametroLegalNomina.objects.all()
    serializer_class = ParametroLegalNominaSerializer
    permission_classes = [IsSystemAdminOrDirector]


class ConceptoNominaViewSet(viewsets.ModelViewSet):
    """
    Parametrización de conceptos de nómina (Fase B). El frontend consume esto
    de forma read-only vía GET para alimentar calcAVEC (ver constants/avec.js)
    cuando `codigo` coincide con uno de los conceptos escalares soportados —
    el resto (postgrado, convenio AVEC) sigue viviendo en código.
    """
    queryset = ConceptoNomina.objects.all()
    serializer_class = ConceptoNominaSerializer
    permission_classes = [IsSystemAdminOrDirector]

    def get_queryset(self):
        queryset = super().get_queryset()
        activo = self.request.query_params.get('activo')
        convenio = self.request.query_params.get('convenio')
        if activo is not None:
            queryset = queryset.filter(activo=activo.lower() in ('1', 'true'))
        if convenio is not None:
            queryset = queryset.filter(convenio=convenio)
        return queryset


class RegistroNominaViewSet(viewsets.ModelViewSet):
    """
    Los recibos de nómina ya emitidos no se editan ni se borran por API una vez
    creados (son comprobantes de pago con auditoría) — update/partial_update/
    destroy están deshabilitados. Si se generó con datos incorrectos, corregir
    en el admin de Django (bajo supervisión) o regenerar el período.
    """
    queryset = RegistroNomina.objects.select_related('empleado').all()
    serializer_class = RegistroNominaSerializer
    permission_classes = [IsSystemAdminOrDirector]
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        queryset = super().get_queryset()
        empleado = self.request.query_params.get('empleado')
        empleado_rrhh = self.request.query_params.get('empleado_rrhh')
        mes = self.request.query_params.get('mes')
        anio = self.request.query_params.get('anio')
        if empleado:
            queryset = queryset.filter(empleado_id=empleado)
        if empleado_rrhh:
            queryset = queryset.filter(empleado__empleado_rrhh_id=empleado_rrhh)
        if mes:
            queryset = queryset.filter(mes_correspondiente=mes)
        if anio:
            queryset = queryset.filter(anio_correspondiente=anio)
        return queryset.order_by('-anio_correspondiente', '-mes_correspondiente', '-fecha_proceso')

    @action(detail=True, methods=['post'])
    def cerrar(self, request, pk=None):
        """Marca el registro como cerrado: deja de recalcularse automáticamente
        si cambian los datos maestros del empleado (sueldo, pensionado)."""
        registro = self.get_object()
        registro.estado = 'cerrado'
        registro.save(update_fields=['estado'])
        return Response(RegistroNominaSerializer(registro).data)

    @action(detail=True, methods=['post'])
    def reabrir(self, request, pk=None):
        """Revierte cerrar(): vuelve a quedar sujeto a recálculo automático.
        Acción explícita de un administrador — no se reabre solo."""
        registro = self.get_object()
        registro.estado = 'abierto'
        registro.save(update_fields=['estado'])
        return Response(RegistroNominaSerializer(registro).data)

    @action(detail=False, methods=['get'])
    def configuracion_generacion(self, request):
        tasa = TasaCambio.objects.order_by('-fecha').first()
        cesta = {}
        parametro = ParametroGlobal.objects.filter(clave='NOMINA_CONFIG_JSON').first()
        if parametro and parametro.valor:
            try:
                cesta = json.loads(parametro.valor)
            except (TypeError, ValueError):
                cesta = {}
        return Response({
            'tasa_cambio': tasa.valor_bs if tasa else None,
            'cesta_ticket': cesta,
        })

    @action(detail=False, methods=['post'])
    def generar_lote(self, request):
        try:
            mes = int(request.data.get('mes'))
            anio = int(request.data.get('anio'))
            tasa = Decimal(str(request.data.get('tasa_cambio')))
            cesta = Decimal(str(request.data.get('monto_cestaticket')))
        except (TypeError, ValueError, InvalidOperation):
            return Response({'detail': 'Mes, año, tasa de cambio y cesta ticket son obligatorios y numéricos.'}, status=400)
        if not 1 <= mes <= 12 or tasa < 0 or cesta < 0:
            return Response({'detail': 'Los valores del período y montos no son válidos.'}, status=400)

        empleados = Empleado.objects.filter(
            Q(empleado_rrhh__isnull=True) | Q(empleado_rrhh__activo=True)
        ).distinct()
        existentes = set(RegistroNomina.objects.filter(
            empleado__in=empleados, mes_correspondiente=mes, anio_correspondiente=anio
        ).values_list('empleado_id', flat=True))
        if existentes:
            return Response({'detail': 'Ya existen registros para uno o más empleados de este período.', 'empleados': list(existentes)}, status=409)

        try:
            with transaction.atomic():
                for empleado in empleados:
                    RegistroNomina.objects.create(
                        empleado=empleado,
                        mes_correspondiente=mes,
                        anio_correspondiente=anio,
                        monto_cestaticket=cesta,
                        tasa_pago_bono=tasa,
                    )
                registros = list(RegistroNomina.objects.filter(
                    empleado__in=empleados, mes_correspondiente=mes, anio_correspondiente=anio
                ).select_related('empleado'))
            return Response(RegistroNominaSerializer(registros, many=True).data, status=status.HTTP_201_CREATED)
        except IntegrityError:
            return Response({'detail': 'El período fue generado simultáneamente. Vuelve a consultar el historial.'}, status=409)
        except DjangoValidationError as e:
            return Response({'detail': '; '.join(e.messages) if hasattr(e, 'messages') else str(e)}, status=400)

class ReciboNominaPDFView(APIView):
    # IDOR fix: antes solo exigía IsAuthenticated, permitiendo a cualquier
    # usuario logueado (docente, cajero, etc.) descargar el recibo de sueldo
    # de cualquier empleado iterando pago_id. Restringido a roles de RRHH/dirección,
    # igual que EmpleadoViewSet en rrhh/views.py.
    permission_classes = [IsSystemAdminOrDirector]

    def get(self, request, pago_id):
        try:
            # Buscamos el registro de nómina por ID (pago_id según el requerimiento del endpoint)
            registro = RegistroNomina.objects.select_related('empleado').get(id=pago_id)
            pdf_buffer = GeneradorReciboNomina.generar_pdf(registro)
            
            filename = f"Recibo_Nomina_{registro.empleado.cedula}_{registro.mes_correspondiente}_{registro.anio_correspondiente}.pdf"
            
            return FileResponse(
                pdf_buffer,
                as_attachment=False,
                filename=filename,
                content_type='application/pdf'
            )
        except RegistroNomina.DoesNotExist:
            return Response({"error": "El recibo de nómina solicitado no existe."}, status=status.HTTP_404_NOT_FOUND)


class VincularEmpleadoRRHHView(APIView):
    """
    Vincula manualmente un nomina.Empleado con su contraparte en rrhh.Empleado.

    Los dos modelos Empleado (rrhh y nomina) son independientes por diseño
    histórico (ver NOTAS_TECNICAS.md). No existe auto-matcheo automático por
    cédula para evitar cruces incorrectos si hay datos sucios; el vínculo es
    siempre una acción explícita de un administrador.

    POST /api/nomina/empleados/<id>/vincular-rrhh/
    body: {"rrhh_empleado_id": <id de rrhh.Empleado>}
    Para desvincular, enviar {"rrhh_empleado_id": null}.
    """
    permission_classes = [IsSystemAdminOrDirector]

    def post(self, request, empleado_id):
        # Import local para evitar dependencia circular / acoplamiento fuerte
        # entre apps a nivel de módulo.
        from rrhh.models import Empleado as EmpleadoRRHH

        empleado_nomina = get_object_or_404(Empleado, id=empleado_id)
        rrhh_empleado_id = request.data.get('rrhh_empleado_id')

        if rrhh_empleado_id in (None, ''):
            empleado_nomina.empleado_rrhh = None
            empleado_nomina.save(update_fields=['empleado_rrhh'])
            return Response(EmpleadoSerializer(empleado_nomina).data, status=status.HTTP_200_OK)

        empleado_rrhh = get_object_or_404(EmpleadoRRHH, id=rrhh_empleado_id)
        empleado_nomina.empleado_rrhh = empleado_rrhh
        empleado_nomina.save(update_fields=['empleado_rrhh'])
        return Response(EmpleadoSerializer(empleado_nomina).data, status=status.HTTP_200_OK)