from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    # Módulos de la API Octopus
    path('authentication/', include('authentication.urls')),
    path('secretaria/', include('secretaria.urls')),
    path('cobranza/', include('cobranza.urls')),
]