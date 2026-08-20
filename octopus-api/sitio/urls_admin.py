from django.urls import path

from .views import (
    ArticuloDetailAdminView,
    ArticuloListCreateAdminView,
    ArticuloPublicarAdminView,
    CategoriaDetailAdminView,
    CategoriaListCreateAdminView,
    ConfiguracionSitioAdminView,
    MediaDetailAdminView,
    MediaListCreateAdminView,
    MenuItemsReplaceAdminView,
    MenuListAdminView,
    MetricasAdminView,
    PaginaConSeccionesAdminView,
    PaginaDespublicarAdminView,
    PaginaDetailAdminView,
    PaginaDuplicarAdminView,
    PaginaEnviarPapeleraAdminView,
    PaginaListCreateAdminView,
    PaginaPapeleraAdminView,
    PaginaPreviewAdminView,
    PaginaPublicarAdminView,
    PaginaRestaurarAdminView,
    PatronBloqueDetailAdminView,
    PatronBloqueListCreateAdminView,
    PlantillaPaginaDesdeAdminView,
    PlantillaPaginaDetailAdminView,
    PlantillaPaginaListCreateAdminView,
    PreviewPlantillaAdminView,
    SeccionDetailAdminView,
    SeccionListCreateAdminView,
    SeccionReordenarAdminView,
)

urlpatterns = [
    # Configuración (singleton)
    path('configuracion/', ConfiguracionSitioAdminView.as_view(), name='sitio_admin_configuracion'),

    # Páginas
    path('paginas/', PaginaListCreateAdminView.as_view(), name='sitio_admin_paginas'),
    path('paginas/con-secciones/', PaginaConSeccionesAdminView.as_view(), name='sitio_admin_pagina_con_secciones'),
    path('paginas/papelera/', PaginaPapeleraAdminView.as_view(), name='sitio_admin_paginas_papelera'),
    path('paginas/<int:pk>/', PaginaDetailAdminView.as_view(), name='sitio_admin_pagina_detalle'),
    path('paginas/<int:pk>/publicar/', PaginaPublicarAdminView.as_view(), name='sitio_admin_pagina_publicar'),
    path('paginas/<int:pk>/despublicar/', PaginaDespublicarAdminView.as_view(), name='sitio_admin_pagina_despublicar'),
    path('paginas/<int:pk>/papelera/', PaginaEnviarPapeleraAdminView.as_view(), name='sitio_admin_pagina_papelera'),
    path('paginas/<int:pk>/restaurar/', PaginaRestaurarAdminView.as_view(), name='sitio_admin_pagina_restaurar'),
    path('paginas/<int:pk>/duplicar/', PaginaDuplicarAdminView.as_view(), name='sitio_admin_pagina_duplicar'),
    path(
        'paginas/<int:pk>/guardar-como-plantilla/',
        PlantillaPaginaDesdeAdminView.as_view(),
        name='sitio_admin_pagina_guardar_como_plantilla',
    ),
    path('paginas/<int:pk>/preview/', PaginaPreviewAdminView.as_view(), name='sitio_admin_pagina_preview'),
    path('preview-plantilla/', PreviewPlantillaAdminView.as_view(), name='sitio_admin_preview_plantilla'),

    # Patrones de bloque y plantillas de página del usuario (Fase 2)
    path('patrones/', PatronBloqueListCreateAdminView.as_view(), name='sitio_admin_patrones'),
    path('patrones/<int:pk>/', PatronBloqueDetailAdminView.as_view(), name='sitio_admin_patron_detalle'),
    path('plantillas-usuario/', PlantillaPaginaListCreateAdminView.as_view(), name='sitio_admin_plantillas_usuario'),
    path(
        'plantillas-usuario/<int:pk>/',
        PlantillaPaginaDetailAdminView.as_view(),
        name='sitio_admin_plantilla_usuario_detalle',
    ),

    # Secciones (anidadas bajo página + detalle propio)
    path('paginas/<int:pagina_id>/secciones/', SeccionListCreateAdminView.as_view(), name='sitio_admin_secciones'),
    path(
        'paginas/<int:pagina_id>/secciones/reordenar/',
        SeccionReordenarAdminView.as_view(),
        name='sitio_admin_secciones_reordenar',
    ),
    path('secciones/<int:pk>/', SeccionDetailAdminView.as_view(), name='sitio_admin_seccion_detalle'),

    # Artículos
    path('articulos/', ArticuloListCreateAdminView.as_view(), name='sitio_admin_articulos'),
    path('articulos/<int:pk>/', ArticuloDetailAdminView.as_view(), name='sitio_admin_articulo_detalle'),
    path('articulos/<int:pk>/publicar/', ArticuloPublicarAdminView.as_view(), name='sitio_admin_articulo_publicar'),

    # Categorías
    path('categorias/', CategoriaListCreateAdminView.as_view(), name='sitio_admin_categorias'),
    path('categorias/<int:pk>/', CategoriaDetailAdminView.as_view(), name='sitio_admin_categoria_detalle'),

    # Media
    path('media/', MediaListCreateAdminView.as_view(), name='sitio_admin_media'),
    path('media/<int:pk>/', MediaDetailAdminView.as_view(), name='sitio_admin_media_detalle'),

    # Menús
    path('menus/', MenuListAdminView.as_view(), name='sitio_admin_menus'),
    path('menus/<int:pk>/items/', MenuItemsReplaceAdminView.as_view(), name='sitio_admin_menu_items'),

    # Métricas
    path('metricas/', MetricasAdminView.as_view(), name='sitio_admin_metricas'),
]
