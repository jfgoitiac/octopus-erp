from django.urls import path, include
from .views import (
    ReciboNominaPDFView, VincularEmpleadoRRHHView,
    RegistroNominaViewSet, ParametroLegalNominaViewSet,
)
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register(r'registros', RegistroNominaViewSet, basename='registro-nomina')
router.register(r'parametros-legales', ParametroLegalNominaViewSet, basename='parametro-legal-nomina')

urlpatterns = [
    path('', include(router.urls)),
    # ... otras rutas existentes de nómina ...
    path('recibos/<int:pago_id>/pdf/', ReciboNominaPDFView.as_view(), name='recibo-nomina-pdf'),
    path('empleados/<int:empleado_id>/vincular-rrhh/', VincularEmpleadoRRHHView.as_view(), name='nomina-empleado-vincular-rrhh'),
]