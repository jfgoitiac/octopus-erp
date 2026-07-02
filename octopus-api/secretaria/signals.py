from django.core.cache import cache
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import ConfiguracionSistema

CACHE_KEY_CONFIG_COLEGIO_PUBLICA = 'portal_config_colegio_publica'


@receiver(post_save, sender=ConfiguracionSistema)
def invalidar_cache_config_publica(sender, instance, **kwargs):
    """Invalida el cache de ConfiguracionColegioPublicaView (portal) al
    guardar la configuración del sistema desde el panel admin."""
    cache.delete(CACHE_KEY_CONFIG_COLEGIO_PUBLICA)
