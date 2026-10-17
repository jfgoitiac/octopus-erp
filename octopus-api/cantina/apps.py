from django.apps import AppConfig


class CantinaConfig(AppConfig):
    name = 'cantina'

    def ready(self):
        # Crea la RevisionCierre 'pendiente' de cada cierre nuevo (Auditoría).
        from .auditoria import signals  # noqa: F401
