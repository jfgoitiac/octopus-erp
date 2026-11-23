from django.apps import AppConfig


class PortalConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'portal'
    verbose_name = 'Portal de Representantes'

    def ready(self):
        # Registra validaciones de despliegue sin generar warnings al importar settings.
        from . import checks  # noqa: F401
