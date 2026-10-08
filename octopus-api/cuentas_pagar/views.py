from django.core.exceptions import ObjectDoesNotExist
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from .filters import filtrar_cuentas, filtrar_plantillas
from .models import AvisoBandeja, ComprobantePagoCxP, ConfiguracionRecordatorios, CuentaPorPagar, PagoCuentaPagar, PlantillaRecurrente
from .permissions import PuedeGestionarCxP, PuedeVerCxP, PuedeEscribirCxP
from .serializers import AvisoBandejaSerializer, ComprobanteSerializer, ConfiguracionRecordatoriosSerializer, CuentaSerializer, PagoSerializer, PlantillaRecurrenteSerializer
from . import services
from cobranza.permissions import filtrar_por_sede

def ejecutar(funcion, *args, **kwargs):
    """Traduce los errores de dominio de los servicios a respuestas 400/404 con `detalle`."""
    try: return funcion(*args, **kwargs)
    except ObjectDoesNotExist: raise NotFound({'detalle':'Registro no encontrado.'})
    except KeyError as exc: raise ValidationError({'detalle':f'Falta el campo obligatorio: {exc.args[0]}.'})
    except ValueError as exc: raise ValidationError({'detalle':str(exc)})


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
        cuenta=self.get_object()
        pago,cuenta,egreso=ejecutar(services.registrar_pago,cuenta.id,request.data,request.user)
        return Response({'pago':PagoSerializer(pago).data,'saldo':str(cuenta.saldo),'estado':cuenta.estado,'egreso_id':cuenta.egreso_id,'egreso':egreso})
    @action(detail=True,methods=['post'])
    def aplazar(self,request,pk=None):
        cuenta=self.get_object()
        try: item=ejecutar(services.aplazar,cuenta.id,request.data.get('fecha_nueva'),request.data.get('motivo',''),request.user)
        except PermissionError as exc: raise PermissionDenied(str(exc))
        return Response({'id':item.id})
    @action(detail=True,methods=['post'],url_path='posponer-recordatorio')
    def posponer_recordatorio(self,request,pk=None):
        cuenta=self.get_object()
        if not request.data.get('hasta'): raise ValidationError({'detalle':'Falta el campo obligatorio: hasta.'})
        return Response(self.get_serializer(ejecutar(services.posponer,cuenta.id,request.data['hasta'],request.data.get('motivo',''),request.user)).data)
    @action(detail=True,methods=['post'],url_path='acuerdo-cuotas')
    def acuerdo_cuotas(self,request,pk=None):
        cuenta=self.get_object()
        return Response([{'id':x.id,'numero':x.numero} for x in ejecutar(services.crear_acuerdo_cuotas,cuenta.id,request.data.get('cuotas',[]),request.user)])
    @action(detail=True,methods=['post'],url_path='confirmar-monto')
    def confirmar_monto(self,request,pk=None):
        cuenta=self.get_object()
        return Response(self.get_serializer(ejecutar(services.confirmar_monto,cuenta.id,request.data.get('monto_documento'),request.data.get('tasa_aplicada'),request.user)).data)
    @action(detail=True,methods=['post'])
    def anular(self,request,pk=None):
        cuenta=self.get_object()
        return Response(self.get_serializer(ejecutar(services.anular,cuenta.id,request.data.get('motivo',''),request.user)).data)
    @action(detail=True,methods=['get'])
    def pagos(self,request,pk=None): return Response(PagoSerializer(self.get_object().pagos.all(),many=True).data)
    @action(detail=False,methods=['post'],url_path='pagos-multiples')
    def pagos_multiples(self,request):
        pagos=request.data.get('pagos',[])
        try: ids={int(p['cuenta']) for p in pagos}
        except (KeyError,TypeError,ValueError): raise ValidationError({'detalle':'Cada pago requiere una cuenta válida.'})
        # Solo cuentas dentro de las sedes autorizadas del usuario.
        if self.get_queryset().filter(pk__in=ids).count() != len(ids): raise NotFound({'detalle':'Registro no encontrado.'})
        return Response([PagoSerializer(x[0]).data for x in ejecutar(services.pago_multiple,pagos,request.user)])

class PagoViewSet(viewsets.GenericViewSet):
    serializer_class=PagoSerializer; permission_classes=[PuedeEscribirCxP]
    def get_queryset(self): return filtrar_por_sede(self.request.user, PagoCuentaPagar.objects.select_related('cuenta'), 'cuenta__sede')
    def get_permissions(self):
        if self.action in ('aprobar','rechazar'): return [PuedeGestionarCxP()]
        return super().get_permissions()
    @action(detail=True,methods=['post'])
    def aprobar(self,request,pk=None):
        pago=self.get_object()
        pago,cuenta,egreso=ejecutar(services.aprobar_pago,pago.id,request.user)
        return Response({'pago':PagoSerializer(pago).data,'saldo':str(cuenta.saldo),'estado':cuenta.estado,'egreso_id':cuenta.egreso_id,'egreso':egreso})
    @action(detail=True,methods=['post'])
    def rechazar(self,request,pk=None):
        pago=self.get_object()
        pago,cuenta=ejecutar(services.rechazar_pago,pago.id,request.data.get('motivo',''),request.user)
        return Response({'pago':PagoSerializer(pago).data,'cuenta_id':cuenta.id})
    @action(detail=True,methods=['post'])
    def anular(self,request,pk=None):
        pago=self.get_object()
        return Response({'cuenta_id':ejecutar(services.anular_pago,pago.id,request.data.get('motivo',''),request.user).id})
    @action(detail=True,methods=['post'])
    def adjuntos(self,request,pk=None):
        pago=self.get_object(); s=ComprobanteSerializer(data=request.data); s.is_valid(raise_exception=True); c=s.save(pago=pago,subido_por=request.user); return Response(ComprobanteSerializer(c).data,status=201)

class AvisoBandejaViewSet(mixins.ListModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Bandeja de avisos del usuario: lista con filtros `leido` y `cuenta`; PATCH marca leído."""
    serializer_class=AvisoBandejaSerializer; permission_classes=[PuedeVerCxP]
    http_method_names=['get','patch','head','options']
    def get_queryset(self):
        qs=AvisoBandeja.objects.filter(usuario=self.request.user).select_related('cuenta')
        leido=self.request.query_params.get('leido')
        if leido is not None and leido != '': qs=qs.filter(leido=leido.lower() in ('1','true','si','sí'))
        if self.request.query_params.get('cuenta'): qs=qs.filter(cuenta_id=self.request.query_params['cuenta'])
        return qs.order_by('-creado_en','-id')

class PlantillaRecurrenteViewSet(viewsets.ModelViewSet):
    serializer_class = PlantillaRecurrenteSerializer
    permission_classes = [PuedeGestionarCxP]
    def get_queryset(self):
        return filtrar_plantillas(filtrar_por_sede(self.request.user, PlantillaRecurrente.objects.select_related('proveedor','categoria','sede')), self.request.query_params)
    def perform_create(self, serializer): serializer.save(creado_por=self.request.user)

class ConfiguracionRecordatoriosViewSet(viewsets.ViewSet):
    permission_classes = [PuedeGestionarCxP]
    def _objeto(self): return ConfiguracionRecordatorios.objects.first() or ConfiguracionRecordatorios.objects.create()
    def list(self, request): return Response(ConfiguracionRecordatoriosSerializer(self._objeto()).data)
    def partial_update(self, request, pk=None):
        serializer = ConfiguracionRecordatoriosSerializer(self._objeto(), data=request.data, partial=True); serializer.is_valid(raise_exception=True); serializer.save(actualizado_por=request.user); return Response(serializer.data)
