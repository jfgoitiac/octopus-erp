from django.urls import path
from .views_reportes import CalendarioCxPView, EstadoProveedorCxPView, ProyeccionCxPView, ReporteCxPView, TableroCxPView

urlpatterns = [
    path('tablero/', TableroCxPView.as_view()), path('calendario/', CalendarioCxPView.as_view()),
    path('proyeccion/', ProyeccionCxPView.as_view()), path('proveedores/<int:proveedor_id>/estado/', EstadoProveedorCxPView.as_view()),
    path('reportes/<str:nombre>/', ReporteCxPView.as_view()),
]
