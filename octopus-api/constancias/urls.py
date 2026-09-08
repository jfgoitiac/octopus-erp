from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ConstanciaEmitidaDetailView,
    ConstanciaEmitidaListView,
    EmitirView,
    FirmanteFirmaProtegidaView,
    FirmanteSelloProtegidaView,
    FirmanteView,
    PdfConstanciaView,
    PlaceholdersView,
    PlantillaConstanciaViewSet,
    PrevisualizarView,
)

router = DefaultRouter()
router.register(r'plantillas', PlantillaConstanciaViewSet, basename='plantilla-constancia')

urlpatterns = [
    path('', include(router.urls)),
    path('placeholders/', PlaceholdersView.as_view()),
    path('previsualizar/', PrevisualizarView.as_view()),
    path('emitir/', EmitirView.as_view()),
    path('emitidas/', ConstanciaEmitidaListView.as_view()),
    path('emitidas/<int:pk>/', ConstanciaEmitidaDetailView.as_view()),
    path('emitidas/<int:pk>/pdf/', PdfConstanciaView.as_view()),
    path('firmante/', FirmanteView.as_view()),
    path('firmante/firma/', FirmanteFirmaProtegidaView.as_view()),
    path('firmante/sello/', FirmanteSelloProtegidaView.as_view()),
]
