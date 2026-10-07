from rest_framework.routers import DefaultRouter
from .views import CuentaPorPagarViewSet, PagoViewSet
router=DefaultRouter(); router.register('',CuentaPorPagarViewSet,basename='cuenta-por-pagar'); router.register('pagos',PagoViewSet,basename='pago-cxp')
urlpatterns=router.urls
