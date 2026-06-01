from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserManagementViewSet, LoginView, ActivarPortalMasivoView

router = DefaultRouter()
# CORRECCIÓN: agregar basename explícito
router.register(r'users', UserManagementViewSet, basename='user')

urlpatterns = [
    path('', include(router.urls)),
    path('login/', LoginView.as_view(), name='token_obtain_pair'),
    path('activar-portal-masivo/', ActivarPortalMasivoView.as_view(), name='activar_portal_masivo'),
]