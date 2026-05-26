from django.contrib.auth.models import AbstractUser
from django.db import models
from django.conf import settings


class Usuario(AbstractUser):
    def __str__(self):
        return self.username


class LogAuditoria(models.Model):
    usuario    = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    accion     = models.CharField(max_length=255)
    modulo     = models.CharField(max_length=100)
    fecha_hora = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    # CORRECCIÓN: JSONField permite búsquedas estructuradas y filtros por campo
    detalles   = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f"{self.usuario} - {self.accion} ({self.fecha_hora})"
# Agrega esta función al final de usuarios/models.py

def crear_log(usuario, accion, modulo, detalles, ip=None):
    """
    Helper para crear logs de auditoría con detalles estructurados.
    Acepta string o dict — convierte strings automáticamente.
    """
    if isinstance(detalles, str):
        detalles = {"mensaje": detalles}

    LogAuditoria.objects.create(
        usuario=usuario,
        accion=accion,
        modulo=modulo,
        detalles=detalles,
        ip_address=ip
    )    