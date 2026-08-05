from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import DocenteTokenView, DocenteCambiarContrasenaView


class DocenteTokenRefreshView(TokenRefreshView):
    """
    Refresh del portal docente sin clases de autenticación: si el cliente
    adjunta un access token (expirado) en el header, la clase de
    autenticación por defecto lo rechazaría con 401 antes de poder procesar
    el refresh token del body. Mismo patrón que PortalTokenRefreshView
    (portal/urls.py) para representantes.
    """
    authentication_classes = []


urlpatterns = [
    # Autenticación: POST /api/portal-docente/login/
    path('login/', DocenteTokenView.as_view()),

    # Refresh de token del portal docente: POST /api/portal-docente/token/refresh/
    path('token/refresh/', DocenteTokenRefreshView.as_view()),

    # Cambio de contraseña del docente: POST /api/portal-docente/cambiar-contrasena/
    path('cambiar-contrasena/', DocenteCambiarContrasenaView.as_view()),
]
