from django.urls import path
from .views import ProbarNotificacionView, ConfiguracionNotificacionesView, LogNotificacionesView

urlpatterns = [
    path('probar/',        ProbarNotificacionView.as_view()),
    path('configuracion/', ConfiguracionNotificacionesView.as_view()),
    path('logs/',          LogNotificacionesView.as_view()),
]
