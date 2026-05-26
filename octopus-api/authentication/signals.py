from django.db.models.signals import post_save
from django.dispatch import receiver
from django.conf import settings
from .models import PerfilUsuario

@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_perfil_usuario(sender, instance, created, **kwargs):
    if created:
        PerfilUsuario.objects.create(user=instance)

@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def save_perfil_usuario(sender, instance, **kwargs):
    if hasattr(instance, 'perfil'):
        instance.perfil.save()