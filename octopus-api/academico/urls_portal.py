from django.urls import path

from .views_portal import RendimientoAlumnoPortalView

# Endpoints del portal de representantes, montados en config/urls.py bajo
# 'api/portal/academico/' -- mismo patrón que comunicacion.urls_portal.
urlpatterns = [
    path('rendimiento/alumno/<int:alumno_id>/', RendimientoAlumnoPortalView.as_view()),
]
