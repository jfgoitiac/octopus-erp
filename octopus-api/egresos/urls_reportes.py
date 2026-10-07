from django.urls import path

from .views_reportes import ReportesEgresosView, TableroEgresosView

urlpatterns = [
    path('tablero/', TableroEgresosView.as_view(), name='egresos-tablero'),
    path('reportes/<str:nombre>/', ReportesEgresosView.as_view(), name='egresos-reportes'),
]
