from django.db.models import Sum
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from .filters import egresos_visibles
from .models import ArticuloFrecuente, ComprobanteEgreso, ConfiguracionEgresos, Egreso
from .permissions import EsAdministradorODirector
from .serializers import (ArticuloFrecuenteSerializer, ComprobanteSerializer, ConfiguracionEgresosSerializer,
                          EgresoSerializer)
from .services import anular, calcular_totales, duplicar, guardar_contado

class EgresoViewSet(viewsets.ModelViewSet):
    serializer_class=EgresoSerializer; permission_classes=(EsAdministradorODirector,)
    # Los egresos no se borran: se anulan con motivo (ver acción `anular`).
    http_method_names=['get','post','put','patch','head','options']
    def get_queryset(self):
        qs=egresos_visibles(self.request.user,Egreso.objects.select_related('proveedor','categoria','sede').prefetch_related('renglones','pagos_cuenta_por_pagar'))
        for campo in ('sede','estado','origen','proveedor','categoria','moneda'):
            if self.request.query_params.get(campo): qs=qs.filter(**{campo:self.request.query_params[campo]})
        if self.request.query_params.get('desde'): qs=qs.filter(fecha_emision__gte=self.request.query_params['desde'])
        if self.request.query_params.get('hasta'): qs=qs.filter(fecha_emision__lte=self.request.query_params['hasta'])
        return qs
    def perform_update(self, serializer):
        if serializer.instance.estado != 'borrador': raise ValidationError('Solo se editan borradores.')
        serializer.save()
    @action(detail=True,methods=['post'])
    def guardar(self,request,pk=None):
        e=self.get_object()
        try: return Response(self.get_serializer(guardar_contado(e, request.data, request.user)).data)
        except ValueError as exc: raise ValidationError({'detalle':str(exc)})
    @action(detail=True,methods=['post'])
    def anular(self,request,pk=None):
        try: return Response(self.get_serializer(anular(self.get_object(),request.data.get('motivo'),request.user)).data)
        except ValueError as exc: raise ValidationError({'motivo':str(exc)})
    @action(detail=True,methods=['post'])
    def duplicar(self,request,pk=None):
        try: return Response(self.get_serializer(duplicar(self.get_object(),request.user),status=status.HTTP_201_CREATED).data)
        except ValueError as exc: raise ValidationError({'detalle':str(exc)})
    @action(detail=True,methods=['post'],url_path='calcular-totales')
    def calcular_totales(self,request,pk=None):
        # el id solo da contexto/autorización de sede; el cuerpo no se persiste
        self.get_object()
        try: return Response({k:str(v) for k,v in calcular_totales(request.data).items()})
        except (ValueError, KeyError) as exc: raise ValidationError({'detalle':str(exc)})
    @action(detail=True,methods=['get','post'],url_path='comprobantes', parser_classes=[MultiPartParser])
    def comprobantes(self,request,pk=None):
        e=self.get_object()
        if request.method=='GET': return Response(ComprobanteSerializer(e.comprobantes.all(),many=True).data)
        if e.comprobantes.filter(activo=True).count() >= 5: raise ValidationError({'archivo':'Máximo cinco comprobantes activos.'})
        s=ComprobanteSerializer(data=request.data); s.is_valid(raise_exception=True); s.save(egreso=e,subido_por=request.user); return Response(s.data,status=201)
    @action(detail=True,methods=['delete'],url_path=r'comprobantes/(?P<comprobante_id>[^/.]+)')
    def borrar_comprobante(self,request,pk=None,comprobante_id=None):
        c=self.get_object().comprobantes.filter(pk=comprobante_id).first()
        if not c: from rest_framework.exceptions import NotFound; raise NotFound()
        c.activo=False;c.eliminado_por=request.user;c.eliminado_en=timezone.now();c.save(); return Response(status=204)

class ArticulosView(APIView):
    permission_classes=(EsAdministradorODirector,)
    def get(self,request):
        qs=ArticuloFrecuente.objects.filter(activo=True)
        for campo in ('proveedor','categoria'):
            if request.query_params.get(campo): qs=qs.filter(**{campo:request.query_params[campo]})
        if request.query_params.get('q'): qs=qs.filter(nombre__icontains=request.query_params['q'])
        return Response(ArticuloFrecuenteSerializer(qs,many=True).data)

class ConfiguracionView(APIView):
    permission_classes=(EsAdministradorODirector,)
    def get_object(self): return ConfiguracionEgresos.objects.get_or_create(pk=1)[0]
    def get(self,request): return Response(ConfiguracionEgresosSerializer(self.get_object()).data)
    def patch(self,request):
        s=ConfiguracionEgresosSerializer(self.get_object(),data=request.data,partial=True);s.is_valid(raise_exception=True);s.save(actualizado_por=request.user);return Response(s.data)
