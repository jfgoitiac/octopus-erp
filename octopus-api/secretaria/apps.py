from django.apps import AppConfig


class SecretariaConfig(AppConfig):
    name = 'secretaria'

    def ready(self):
        import secretaria.signals
