from django.conf import settings
from django.core.checks import Tags, Warning, register


@register(Tags.security, deploy=True)
def portal_email_director_configurado(app_configs, **kwargs):
    """Avisa en el chequeo de despliegue si la alerta de mora no tiene destino."""
    if settings.PORTAL_EMAIL_DIRECTOR:
        return []
    return [
        Warning(
            'PORTAL_EMAIL_DIRECTOR no está configurado; la alerta de mora del día 15 no se enviará.',
            hint='Configure un correo real en PORTAL_EMAIL_DIRECTOR antes de desplegar.',
            id='portal.W001',
        )
    ]
