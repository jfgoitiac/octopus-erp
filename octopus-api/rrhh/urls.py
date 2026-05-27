from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import EmpleadoViewSet, TipoCargoViewSet, BancoNominaViewSet

router = DefaultRouter()
router.register(r'empleados', EmpleadoViewSet)
router.register(r'tipos-cargo', TipoCargoViewSet)
router.register(r'bancos-nomina', BancoNominaViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
