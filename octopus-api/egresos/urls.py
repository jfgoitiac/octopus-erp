from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import ArticulosView, ConfiguracionView, EgresoViewSet
router=DefaultRouter();router.register('',EgresoViewSet,basename='egreso')
urlpatterns=[path('articulos/',ArticulosView.as_view()),path('configuracion/',ConfiguracionView.as_view())]+router.urls
