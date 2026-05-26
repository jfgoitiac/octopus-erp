from django.urls import path
from .views import ReciboNominaPDFView

urlpatterns = [
    # ... otras rutas existentes de nómina ...
    path('recibos/<int:pago_id>/pdf/', ReciboNominaPDFView.as_view(), name='recibo-nomina-pdf'),
]