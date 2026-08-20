from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserManagementViewSet, LoginView, LogoutView, ActivarPortalMasivoView

router = DefaultRouter()
# CORRECCIÓN: agregar basename explícito
router.register(r'users', UserManagementViewSet, basename='user')

urlpatterns = [
    path('', include(router.urls)),
    path('login/', LoginView.as_view(), name='token_obtain_pair'),
    path('logout/', LogoutView.as_view(), name='admin_logout'),
    path('activar-portal-masivo/', ActivarPortalMasivoView.as_view(), name='activar_portal_masivo'),
]