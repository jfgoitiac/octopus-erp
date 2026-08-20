from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include
from authentication.cookie_views import CookieTokenObtainPairView, CookieTokenRefreshView
from pagos_comunes.media_views import ComprobanteProtegidoView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/token/', CookieTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', CookieTokenRefreshView.as_view(), name='token_refresh'),
    path('api/authentication/', include('authentication.urls')),
    path('api/usuarios/', include('usuarios.urls')),
    path('api/secretaria/', include('secretaria.urls')),
    path('api/cobranza/', include('cobranza.urls')),
    path('api/nomina/', include('nomina.urls')),
    path('api/rrhh/', include('rrhh.urls')),
    path('api/portal/', include('portal.urls')),
    path('api/portal/comunicacion/', include('comunicacion.urls_portal')),
    path('api/academico/', include('academico.urls')),
    path('api/portal/academico/', include('academico.urls_portal')),
    path('api/portal-docente/', include('academico.urls_portal_docente')),
    path('api/comunicacion/', include('comunicacion.urls')),
    path('api/multisede/', include('multisede.urls')),
    path('api/notificaciones/', include('notificaciones.urls')),
    path('api/portal/notificaciones/', include('notificaciones.urls_portal')),
    path('api/cantina/', include('cantina.urls')),
    # Sitio institucional (CMS) — admin (protegido, IsDirectorOrSistemas) y
    # público (AllowAny, solo contenido publicado). Ver SITIO_CONTRATO_API.md.
    path('api/sitio/admin/', include('sitio.urls_admin')),
    path('api/sitio/', include('sitio.urls_public')),
    path('media-protegido/comprobantes/<str:filename>/', ComprobanteProtegidoView.as_view()),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)