from django.conf import settings
from django.db import models


# ─────────────────────────────────────────────
# SEDE
# ─────────────────────────────────────────────
class Sede(models.Model):
    nombre    = models.CharField(max_length=200, unique=True)
    rif       = models.CharField(max_length=20, blank=True)
    direccion = models.TextField(blank=True)
    telefono  = models.CharField(max_length=20, blank=True)
    correo    = models.EmailField(blank=True)
    municipio = models.CharField(max_length=100, blank=True)
    estado    = models.CharField(max_length=100, blank=True)
    activa    = models.BooleanField(default=True)
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    # Vincula con la configuración escolar de esta sede
    configuracion = models.OneToOneField(
        'secretaria.ConfiguracionSistema',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='sede'
    )

    class Meta:
        ordering = ['nombre']
        verbose_name = 'Sede'
        verbose_name_plural = 'Sedes'

    def __str__(self):
        return self.nombre


# ─────────────────────────────────────────────
# PERMISO DE SEDE
# ─────────────────────────────────────────────
class PermisoSede(models.Model):
    ROLES = (
        ('directivo_red', 'Directivo de Red (todas las sedes)'),
        ('director',      'Director de Sede'),
        ('sistemas',      'Sistemas'),
        ('administrador', 'Administrador'),
        ('cajero',        'Cajero'),
        ('secretaria',    'Secretaria'),
        ('cobranza',      'Cobranza'),
    )

    user   = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='permisos_sede'
    )
    sede   = models.ForeignKey(
        Sede,
        on_delete=models.CASCADE,
        related_name='permisos'
    )
    rol    = models.CharField(max_length=20, choices=ROLES)
    activo = models.BooleanField(default=True)
    fecha_asignacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'sede')
        ordering = ['sede__nombre', 'rol']
        verbose_name = 'Permiso de Sede'
        verbose_name_plural = 'Permisos de Sede'

    def __str__(self):
        return f"{self.user.username} → {self.sede.nombre} ({self.rol})"
