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
    debe_cambiar_password = models.BooleanField(
        default=False,
        verbose_name='Debe cambiar contraseña',
        help_text='True cuando la contraseña actual fue asignada por un '
                   'administrador (activación o restablecimiento) y aún no '
                   'ha sido cambiada por el propio representante.'
    )
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
        db_index=True,
        verbose_name='Referencia / N° de transacción',
        help_text='Número de confirmación, referencia de pago móvil o N° de transferencia'
    )
    metodo_pago = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        verbose_name='Método de pago',
    )
    banco_receptor = models.ForeignKey(
        'cobranza.BancoInstitucional',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='comprobantes',
        verbose_name='Banco receptor',
        help_text='Opcional: el portal nunca bloquea el envío por falta de banco.',
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
        db_index=True,
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

    # ── Datos verificados por el revisor del colegio ─────────────────────────
    # El representante solo sube el archivo; referencia, banco y método (arriba)
    # y todo lo de abajo los llena quien revisa, al aprobar. Quedan null en los
    # comprobantes pendientes, en los rechazados y en los aprobados antes de
    # este flujo (o por la conciliación bancaria, que no los envía).
    MONEDAS = [('USD', 'Dólares'), ('VES', 'Bolívares')]

    fecha_pago = models.DateField(
        null=True, blank=True, verbose_name='Fecha del pago (según el banco)',
    )
    monto_recibido = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True,
        verbose_name='Monto recibido', help_text='En la moneda indicada en `moneda`.',
    )
    moneda = models.CharField(max_length=3, choices=MONEDAS, blank=True, default='')
    tasa_aplicada = models.DecimalField(
        max_digits=12, decimal_places=4, null=True, blank=True,
        verbose_name='Tasa BCV de la fecha del pago',
    )
    monto_usd_aplicado = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        verbose_name='Abono aplicado a la mensualidad (USD)',
        help_text='Puede ser menor que lo recibido si hubo excedente.',
    )
    revisado_por = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='comprobantes_revisados', verbose_name='Revisado por',
    )
    fecha_revision = models.DateTimeField(null=True, blank=True)
    motivo_rechazo = models.ForeignKey(
        'portal.MotivoRechazo', on_delete=models.PROTECT, null=True, blank=True,
        related_name='comprobantes', verbose_name='Motivo de rechazo',
    )
    pago = models.ForeignKey(
        'cobranza.Pago', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='comprobantes_portal', verbose_name='Pago generado al aprobar',
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
                fields=['referencia_bancaria', 'metodo_pago', 'banco_receptor'],
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


class MotivoRechazo(models.Model):
    """
    Catálogo de motivos de rechazo de comprobantes. `texto` es lo que lee el
    representante; `nombre` es la etiqueta corta del selector del revisor.
    Un motivo ya usado no se borra (PROTECT): se desactiva.
    """
    nombre = models.CharField(max_length=100)
    texto = models.TextField()
    activo = models.BooleanField(default=True)
    orden = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = 'Motivo de rechazo'
        verbose_name_plural = 'Motivos de rechazo'
        ordering = ['orden', 'id']

    def __str__(self):
        return self.nombre


class AvisoPortal(models.Model):
    """
    Aviso persistente para la bandeja del portal del representante. El push
    se pierde si el teléfono no está suscrito; esta fila queda siempre.
    """
    TIPOS = [
        ('comprobante_aprobado', 'Comprobante aprobado'),
        ('comprobante_rechazado', 'Comprobante rechazado'),
        ('otro', 'Otro'),
    ]

    usuario_portal = models.ForeignKey(
        RepresentanteUser, on_delete=models.CASCADE, related_name='avisos',
    )
    tipo = models.CharField(max_length=30, choices=TIPOS, default='otro')
    titulo = models.CharField(max_length=255)
    cuerpo = models.TextField(blank=True, default='')
    url = models.CharField(max_length=300, blank=True, default='/portal')
    leido_en = models.DateTimeField(null=True, blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Aviso del portal'
        verbose_name_plural = 'Avisos del portal'
        ordering = ['-creado_en', '-id']
        indexes = [
            models.Index(fields=['usuario_portal', 'leido_en'], name='aviso_portal_usuario_leido'),
        ]

    def __str__(self):
        return f'{self.get_tipo_display()} — {self.usuario_portal_id}'
