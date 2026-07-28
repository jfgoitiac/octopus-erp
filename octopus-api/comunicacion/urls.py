from django.urls import path

from .views import (
    CircularDetailView,
    CircularLecturasView,
    CircularListCreateView,
    MarcarMensajeLeidoView,
    MensajeDirectoListCreateView,
)

# Endpoints del panel admin, montados en config/urls.py bajo 'api/comunicacion/'.
urlpatterns = [
    path('circulares/', CircularListCreateView.as_view()),
    path('circulares/<int:pk>/', CircularDetailView.as_view()),
    path('circulares/<int:pk>/lecturas/', CircularLecturasView.as_view()),
    path('mensajes/', MensajeDirectoListCreateView.as_view()),
    path('mensajes/<int:pk>/leer/', MarcarMensajeLeidoView.as_view()),
]
