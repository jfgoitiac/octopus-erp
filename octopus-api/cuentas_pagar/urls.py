from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import AvisoBandejaViewSet, ConfiguracionRecordatoriosViewSet, CuentaPorPagarViewSet, PagoViewSet, PlantillaRecurrenteViewSet
router=DefaultRouter(); router.register('plantillas', PlantillaRecurrenteViewSet, basename='plantilla-cxp'); router.register('configuracion', ConfiguracionRecordatoriosViewSet, basename='configuracion-cxp'); router.register('pagos',PagoViewSet,basename='pago-cxp'); router.register('bandeja',AvisoBandejaViewSet,basename='bandeja-cxp'); router.register('',CuentaPorPagarViewSet,basename='cuenta-por-pagar')
urlpatterns = [path('', include('cuentas_pagar.urls_reportes'))] + router.urls
