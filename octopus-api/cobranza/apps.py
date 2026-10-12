from django.apps import AppConfig

class CobranzaConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'cobranza'

    def ready(self):
        import cobranza.signals
        # Conecta el árbol de botones de WhatsApp (v4 §1.6) al webhook de Meta.
        from . import flujo_botones  # noqa: F401
        # Programar la tarea si no existe ya en cola
        from .tasks import actualizar_tasa_bcv_automatica
        # Repetir cada 24 horas (86400 segundos)
        # actualizar_tasa_bcv_automatica(repeat=86400, repeat_until=None)