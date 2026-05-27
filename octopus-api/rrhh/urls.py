from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import EmpleadoViewSet, TipoCargoViewSet

router = DefaultRouter()
router.register(r'empleados', EmpleadoViewSet)
router.register(r'tipos-cargo', TipoCargoViewSet)

urlpatterns = [
    path('', include(router.urls)),
]