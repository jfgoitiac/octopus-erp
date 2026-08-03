from django.urls import path

from .views import SuscripcionPushView, TiposPushView

# Endpoints del portal de representantes, montados en config/urls.py bajo
# 'api/portal/notificaciones/' -- mismo criterio que comunicacion/urls_portal.py.
urlpatterns = [
    path('push/suscribir/', SuscripcionPushView.as_view()),
    path('push/desuscribir/', SuscripcionPushView.as_view()),
    path('push/tipos/', TiposPushView.as_view()),
]
