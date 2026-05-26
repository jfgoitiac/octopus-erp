from django.db import models
from django.conf import settings

class PerfilUsuario(models.Model):
    # Definición de roles institucionales
    ROLES = (
        ('director', 'Director Institucional'),
        ('sistemas', 'Departamento de Sistemas'),
        ('administrador', 'Administrador General'),
        ('cajero', 'Cajero / Staff Administrativo'),
    )
    
    user = models.OneToOneField(settings.AUTH_USER_MODEL, related_name='perfil', on_delete=models.CASCADE)
    rol = models.CharField(max_length=20, choices=ROLES, default='cajero')
    esta_activo = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.user.username} - {self.rol}"