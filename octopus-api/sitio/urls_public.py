from django.urls import path

from .views import (
    ArticuloDetallePublicoView,
    ArticuloListaPublicaView,
    CategoriaListaPublicaView,
    ConfiguracionSitioPublicaView,
    MenuPublicoView,
    PaginaDetallePublicaView,
    PaginaHomePublicaView,
    PreviewPublicoView,
)

urlpatterns = [
    path('configuracion/', ConfiguracionSitioPublicaView.as_view(), name='sitio_publico_configuracion'),
    path('menus/<str:nombre>/', MenuPublicoView.as_view(), name='sitio_publico_menu'),
    path('paginas/home/', PaginaHomePublicaView.as_view(), name='sitio_publico_pagina_home'),
    path('paginas/<slug:slug>/', PaginaDetallePublicaView.as_view(), name='sitio_publico_pagina_detalle'),
    path('preview/<str:token>/', PreviewPublicoView.as_view(), name='sitio_publico_preview'),
    path('articulos/', ArticuloListaPublicaView.as_view(), name='sitio_publico_articulos'),
    path('articulos/<slug:slug>/', ArticuloDetallePublicoView.as_view(), name='sitio_publico_articulo_detalle'),
    path('categorias/', CategoriaListaPublicaView.as_view(), name='sitio_publico_categorias'),
]
