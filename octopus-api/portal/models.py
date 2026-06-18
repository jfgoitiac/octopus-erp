from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


class RepresentanteUser(models.Model):
    """
    Vincula un Representante del módulo secretaria con un usuario Django,
    permitiendo autenticación independiente en el portal de representantes.
    """
    representante = models.OneToOneField(
        'secretaria.Representante',
        on_delete=models.CASCADE,
        related_name='portal_user',
        verbose_name='Representante'
    )
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='representante_portal',
        verbose_name='Usuario Django'
    )
    esta_activo = models.BooleanField(default=True, verbose_name='Está activo')
    fecha_creacion = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Usuario del Portal'
        verbose_name_plural = 'Usuarios del Portal'

    def __str__(self):
        return f"{self.representante.cedula} — {self.representante.nombre} {self.representante.apellido}"


def asignar_rol_portal(user):
    """
    Marca el perfil del usuario como 'representante' (sin acceso al panel admin).
    Solo se aplica sobre el rol por defecto 'cajero' que asigna el signal
    create_perfil_usuario, para no degradar a personal administrativo real
    que también sea representante.
    """
    perfil = getattr(user, 'perfil', None)
    if perfil is not None and perfil.rol == 'cajero':
        perfil.rol = 'representante'
        perfil.save(update_fields=['rol'])


class ComprobantePago(models.Model):
    """
    Comprobante de transferencia o depósito subido por el representante
    para justificar el pago de una mensualidad pendiente.
    El personal administrativo luego aprueba o rechaza el comprobante.

    ANTIFRAUDE:
    - referencia_bancaria: número de transacción/referencia que el representante
      ingresa manualmente. Se valida unicidad para impedir que la misma
      referencia sea usada en múltiples mensualidades.
    - hash_archivo: SHA-256 del contenido del archivo subido. Detecta cuando
      el mismo archivo (mismos bytes) es presentado más de una vez.
    """
    ESTATUS_CHOICES = [
        ('pendiente',  'Pendiente de revisión'),
        ('aprobado',   'Aprobado'),
        ('rechazado',  'Rechazado'),
    ]

    mensualidad = models.ForeignKey(
        'cobranza.Mensualidad',
        on_delete=models.CASCADE,
        related_name='comprobantes',
        verbose_name='Mensualidad'
    )
    archivo = models.FileField(
        upload_to='comprobantes/',
        verbose_name='Archivo del comprobante'
    )
    referencia_bancaria = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        verbose_name='Referencia / N° de transacción',
        help_text='Número de confirmación, referencia de pago móvil o N° de transferencia'
    )
    hash_archivo = models.CharField(
        max_length=64,
        blank=True,
        null=True,
        verbose_name='Hash SHA-256 del archivo',
        help_text='Huella digital del archivo para detectar duplicados exactos'
    )
    fecha_subida = models.DateTimeField(auto_now_add=True, verbose_name='Fecha de subida')
    estatus = models.CharField(
        max_length=15,
        choices=ESTATUS_CHOICES,
        default='pendiente',
        verbose_name='Estatus'
    )
    observaciones = models.TextField(
        blank=True,
        null=True,
        verbose_name='Observaciones del revisor'
    )
    subido_por_ip = models.CharField(
        max_length=45,
        blank=True,
        null=True,
        verbose_name='IP de quien subió el comprobante'
    )

    class Meta:
        verbose_name = 'Comprobante de Pago'
        verbose_name_plural = 'Comprobantes de Pago'
        ordering = ['-fecha_subida']
        constraints = [
            # Impide que la misma referencia aparezca en dos comprobantes activos
            # (pendiente o aprobado). Los rechazados quedan fuera del constraint
            # para no bloquear reintentos legítimos con corrección de datos.
            models.UniqueConstraint(
                fields=['referencia_bancaria'],
                condition=models.Q(estatus__in=['pendiente', 'aprobado']),
                name='unique_referencia_comprobante_activo',
            ),
        ]

    def __str__(self):
        return (
            f"Comprobante #{self.id} — "
            f"{self.mensualidad.alumno.nombre} "
            f"{self.mensualidad.get_mes_display()} {self.mensualidad.anio} "
            f"[{self.estatus}]"
        )
