from django.urls import path

from .views import DocenteCambiarContrasenaView

# NOTA: login/refresh del docente se unificaron con el resto del staff —
# ver POST /api/token/ y /api/token/refresh/ (config/urls.py, sobre
# CookieTokenObtainPairView / CookieTokenRefreshView).

urlpatterns = [
    # Cambio de contraseña del docente: POST /api/portal-docente/cambiar-contrasena/
    path('cambiar-contrasena/', DocenteCambiarContrasenaView.as_view()),
]
