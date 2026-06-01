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


class ComprobantePago(models.Model):
    """
    Comprobante de transferencia o depósito subido por el representante
    para justificar el pago de una mensualidad pendiente.
    El personal administrativo luego aprueba o rechaza el comprobante.
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

    def __str__(self):
        return (
            f"Comprobante #{self.id} — "
            f"{self.mensualidad.alumno.nombre} "
            f"{self.mensualidad.get_mes_display()} {self.mensualidad.anio} "
            f"[{self.estatus}]"
        )
