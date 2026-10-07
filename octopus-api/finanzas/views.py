from rest_framework import viewsets
from rest_framework.exceptions import NotFound
from cobranza.permissions import filtrar_por_sede
from egresos.permissions import EsAdministradorODirector
from .models import CategoriaGasto, PresupuestoCategoria, Proveedor
from .serializers import CategoriaGastoSerializer, PresupuestoCategoriaSerializer, ProveedorSerializer

class BaseFinanzas(viewsets.ModelViewSet):
    permission_classes=(EsAdministradorODirector,)

class ProveedorViewSet(BaseFinanzas):
    serializer_class=ProveedorSerializer
    def get_queryset(self):
        q=self.request.query_params.get('q',''); activo=self.request.query_params.get('activo')
        qs=Proveedor.objects.all()
        if q: qs=qs.filter(razon_social__icontains=q) | qs.filter(rif__icontains=q)
        if activo is not None: qs=qs.filter(activo=activo.lower()=='true')
        return qs
    def perform_create(self, serializer): serializer.save(creado_por=self.request.user)

class CategoriaGastoViewSet(BaseFinanzas):
    serializer_class=CategoriaGastoSerializer; queryset=CategoriaGasto.objects.select_related('padre').prefetch_related('hijas')

class PresupuestoCategoriaViewSet(BaseFinanzas):
    serializer_class=PresupuestoCategoriaSerializer
    def get_queryset(self):
        qs=filtrar_por_sede(self.request.user, PresupuestoCategoria.objects.select_related('sede','categoria'),'sede')
        for campo in ('sede','anio','mes','categoria','moneda'):
            if self.request.query_params.get(campo): qs=qs.filter(**{campo:self.request.query_params[campo]})
        return qs
    def perform_create(self, serializer): serializer.save(creado_por=self.request.user)
