"""Rutas de CxC, montadas en cantina/urls.py bajo cxc/."""
from django.urls import path

from .views_cxc import (
    AnularAbonoView,
    BuscarRepresentanteCxcView,
    CreditoRepresentanteView,
    CuentasCxcExcelView,
    CuentasCxcView,
    EstadoCuentaCxcView,
    ReciboAbonoPDFView,
    RegistrarAbonoView,
)

app_name = 'cantina_cxc'

urlpatterns = [
    path('buscar/', BuscarRepresentanteCxcView.as_view(), name='cxc-buscar'),
    path('cuentas/', CuentasCxcView.as_view(), name='cxc-cuentas'),
    path('cuentas/excel/', CuentasCxcExcelView.as_view(), name='cxc-cuentas-excel'),
    path('representantes/<int:representante_id>/estado-cuenta/', EstadoCuentaCxcView.as_view(), name='cxc-estado-cuenta'),
    path('representantes/<int:representante_id>/credito/', CreditoRepresentanteView.as_view(), name='cxc-credito'),
    path('abonos/', RegistrarAbonoView.as_view(), name='cxc-abonos'),
    path('abonos/<uuid:operacion_uuid>/anular/', AnularAbonoView.as_view(), name='cxc-abono-anular'),
    path('abonos/<uuid:operacion_uuid>/recibo/', ReciboAbonoPDFView.as_view(), name='cxc-abono-recibo'),
]
