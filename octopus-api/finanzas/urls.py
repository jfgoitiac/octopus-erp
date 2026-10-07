from rest_framework.routers import DefaultRouter
from .views import CategoriaGastoViewSet, PresupuestoCategoriaViewSet, ProveedorViewSet
router=DefaultRouter(); router.register('proveedores',ProveedorViewSet,basename='proveedor'); router.register('categorias',CategoriaGastoViewSet,basename='categoria'); router.register('presupuestos',PresupuestoCategoriaViewSet,basename='presupuesto')
urlpatterns=router.urls
