from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError


def validar_tamano_adjunto(archivo):
    limite_mb = 5
    if archivo.size > limite_mb * 1024 * 1024:
        raise ValidationError(f'El adjunto no puede superar {limite_mb}MB.')


class PerfilUsuario(models.Model):
    # Definición de roles institucionales
    ROLES = (
        ('directivo_red', 'Directivo de Red'),
        ('director',      'Director Institucional'),
        ('sistemas',      'Departamento de Sistemas'),
        ('administrador', 'Administrador General'),
        ('cajero',        'Cajero / Staff Administrativo'),
        ('secretaria',    'Secretaria'),
        ('cobranza',      'Cobranza'),
        ('docente',       'Docente'),
        # Rol sin privilegios administrativos: usuarios del portal de representantes.
        # AdminJWTAuthentication rechaza este rol en todos los endpoints del panel.
        ('representante', 'Representante (Portal)'),
    )

    user = models.OneToOneField(settings.AUTH_USER_MODEL, related_name='perfil', on_delete=models.CASCADE)
    rol = models.CharField(max_length=20, choices=ROLES, default='cajero')
    esta_activo = models.BooleanField(default=True)
    foto = models.ImageField(upload_to='perfiles/', null=True, blank=True, validators=[validar_tamano_adjunto])

    def __str__(self):
        return f"{self.user.username} ({self.rol})"

    class Meta:
        verbose_name = 'Perfil de Usuario'
        verbose_name_plural = 'Perfiles de Usuario'
