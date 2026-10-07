from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import ArticulosView, ConfiguracionView, EgresoViewSet
router=DefaultRouter();router.register('',EgresoViewSet,basename='egreso')
urlpatterns = [
    path('articulos/', ArticulosView.as_view()),
    path('configuracion/', ConfiguracionView.as_view()),
    path('', include('egresos.urls_reportes')),
] + router.urls
