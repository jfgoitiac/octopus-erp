from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include
from authentication.cookie_views import CookieTokenObtainPairView, CookieTokenRefreshView

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
    path('api/academico/', include('academico.urls')),
    path('api/multisede/', include('multisede.urls')),
    path('api/notificaciones/', include('notificaciones.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)