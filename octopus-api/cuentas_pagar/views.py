from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from .filters import filtrar_cuentas
from .models import ComprobantePagoCxP, CuentaPorPagar, PagoCuentaPagar
from .permissions import PuedeGestionarCxP, PuedeVerCxP, PuedeEscribirCxP
from .serializers import ComprobanteSerializer, CuentaSerializer, PagoSerializer
from . import services
from cobranza.permissions import filtrar_por_sede

class CuentaPorPagarViewSet(viewsets.ModelViewSet):
    serializer_class=CuentaSerializer; permission_classes=[PuedeVerCxP]
    def get_queryset(self):
        qs=filtrar_cuentas(filtrar_por_sede(self.request.user, CuentaPorPagar.objects.all().select_related('sede','proveedor','categoria')),self.request.query_params)
        # Multisede se verifica explícitamente en detalle; la configuración de
        # pertenencia del usuario varía entre instalaciones.
        return qs
    def get_permissions(self):
        if self.action in ('create','pagar','adjuntos','pagos_multiples'): return [PuedeEscribirCxP()]
        if self.action in ('partial_update','update','destroy','anular','confirmar_monto','duplicar'): return [PuedeGestionarCxP()]
        return [PuedeVerCxP()]
    def create(self,request,*args,**kwargs):
        s=self.get_serializer(data=request.data); s.is_valid(raise_exception=True)
        try: cuenta=services.crear(s.validated_data,request.user)
        except ValueError as exc: raise ValidationError({'detalle':str(exc)})
        return Response(self.get_serializer(cuenta).data,status=status.HTTP_201_CREATED)
    @action(detail=True,methods=['post'])
    def pagar(self,request,pk=None):
        try: pago,cuenta,egreso=services.registrar_pago(pk,request.data,request.user)
        except ValueError as exc: raise ValidationError({'detalle':str(exc)})
        return Response({'pago':PagoSerializer(pago).data,'saldo':str(cuenta.saldo),'estado':cuenta.estado,'egreso_id':cuenta.egreso_id,'egreso':egreso})
    @action(detail=True,methods=['post'])
    def aplazar(self,request,pk=None):
        try: item=services.aplazar(pk,request.data['fecha_nueva'],request.data.get('motivo',''),request.user)
        except PermissionError as exc: raise PermissionDenied(str(exc))
        except (KeyError,ValueError) as exc: raise ValidationError({'detalle':str(exc)})
        return Response({'id':item.id})
    @action(detail=True,methods=['post'],url_path='posponer-recordatorio')
    def posponer_recordatorio(self,request,pk=None):
        return Response(self.get_serializer(services.posponer(pk,request.data['hasta'],request.data.get('motivo',''),request.user)).data)
    @action(detail=True,methods=['post'],url_path='acuerdo-cuotas')
    def acuerdo_cuotas(self,request,pk=None):
        return Response([{'id':x.id,'numero':x.numero} for x in services.crear_acuerdo_cuotas(pk,request.data.get('cuotas',[]),request.user)])
    @action(detail=True,methods=['post'],url_path='confirmar-monto')
    def confirmar_monto(self,request,pk=None): return Response(self.get_serializer(services.confirmar_monto(pk,request.data['monto_documento'],request.data['tasa_aplicada'],request.user)).data)
    @action(detail=True,methods=['post'])
    def anular(self,request,pk=None): return Response(self.get_serializer(services.anular(pk,request.data.get('motivo',''),request.user)).data)
    @action(detail=True,methods=['get'])
    def pagos(self,request,pk=None): return Response(PagoSerializer(PagoCuentaPagar.objects.filter(cuenta_id=pk),many=True).data)
    @action(detail=False,methods=['post'],url_path='pagos-multiples')
    def pagos_multiples(self,request):
        return Response([PagoSerializer(x[0]).data for x in services.pago_multiple(request.data.get('pagos',[]),request.user)])

class PagoViewSet(viewsets.GenericViewSet):
    permission_classes=[PuedeEscribirCxP]
    @action(detail=True,methods=['post'])
    def anular(self,request,pk=None): return Response({'cuenta_id':services.anular_pago(pk,request.data.get('motivo',''),request.user).id})
    @action(detail=True,methods=['post'])
    def adjuntos(self,request,pk=None):
        pago=PagoCuentaPagar.objects.get(pk=pk); s=ComprobanteSerializer(data=request.data); s.is_valid(raise_exception=True); c=s.save(pago=pago,subido_por=request.user); return Response(ComprobanteSerializer(c).data,status=201)
