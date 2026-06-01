from django.urls import path
from .views import (
    SedesView, SedeDetailView, UsuariosSedeView,
    DashboardConsolidadoView, DashboardSedeView,
    AsignarSedeExistenteView,
)

urlpatterns = [
    path('sedes/',                                          SedesView.as_view()),
    path('sedes/<int:pk>/',                                 SedeDetailView.as_view()),
    path('sedes/<int:sede_id>/usuarios/',                   UsuariosSedeView.as_view()),
    path('sedes/<int:sede_id>/usuarios/<int:user_id>/',     UsuariosSedeView.as_view()),
    path('dashboard/',                                      DashboardConsolidadoView.as_view()),
    path('dashboard/<int:sede_id>/',                        DashboardSedeView.as_view()),
    path('asignar-sede-existente/',                         AsignarSedeExistenteView.as_view()),
]
