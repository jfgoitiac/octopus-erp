from django.urls import path

from .views import (
    CircularPortalListView,
    ConfirmarLecturaView,
    MarcarMensajeLeidoPortalView,
    MensajeDirectoPortalListCreateView,
)

# Endpoints del portal de representantes, montados en config/urls.py bajo
# 'api/portal/comunicacion/' -- para que portalClient.js (baseURL fija en
# /api/portal/) pueda consumirlos con rutas relativas, igual que el resto de
# los endpoints del portal.
urlpatterns = [
    path('circulares/', CircularPortalListView.as_view()),
    path('circulares/<int:pk>/confirmar/', ConfirmarLecturaView.as_view()),
    path('mensajes/', MensajeDirectoPortalListCreateView.as_view()),
    path('mensajes/<int:pk>/leer/', MarcarMensajeLeidoPortalView.as_view()),
]
