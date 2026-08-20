from django.urls import path
from .views import ReciboNominaPDFView, VincularEmpleadoRRHHView

urlpatterns = [
    # ... otras rutas existentes de nómina ...
    path('recibos/<int:pago_id>/pdf/', ReciboNominaPDFView.as_view(), name='recibo-nomina-pdf'),
    path('empleados/<int:empleado_id>/vincular-rrhh/', VincularEmpleadoRRHHView.as_view(), name='nomina-empleado-vincular-rrhh'),
]