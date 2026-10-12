from django.apps import AppConfig


class NotificacionesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'notificaciones'
    verbose_name = 'Notificaciones'

    def ready(self):
        # Registra las tarjetas de conversaciones en la pestaña Hoy de Cobranza Inteligente.
        from . import hoy_fuentes  # noqa: F401
