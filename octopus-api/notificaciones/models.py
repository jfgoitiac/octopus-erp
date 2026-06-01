from django.db import models

PROVEEDORES_WA = [
    ('', 'No configurado'),
    ('twilio', 'Twilio'),
    ('meta', 'Meta Business API'),
]


class ConfiguracionNotificaciones(models.Model):
    """Singleton — siempre usar .objects.first() o get_or_create(pk=1)."""

    # ── Email SMTP ──────────────────────────────────────────────────────────────
    email_activo      = models.BooleanField(default=False, verbose_name='Email activo')
    email_host        = models.CharField(max_length=200, blank=True, default='smtp.gmail.com')
    email_port        = models.PositiveIntegerField(default=587)
    email_use_tls     = models.BooleanField(default=True)
    email_host_user   = models.CharField(max_length=200, blank=True, default='')
    email_host_password = models.CharField(max_length=500, blank=True, default='')
    email_from        = models.CharField(max_length=200, blank=True, default='',
                                         help_text='Ej: Colegio <noreply@colegio.edu.ve>')
    director_email    = models.EmailField(blank=True, default='')

    # ── WhatsApp ────────────────────────────────────────────────────────────────
    whatsapp_activo    = models.BooleanField(default=False, verbose_name='WhatsApp activo')
    whatsapp_proveedor = models.CharField(max_length=10, choices=PROVEEDORES_WA, blank=True, default='')
    twilio_account_sid   = models.CharField(max_length=100, blank=True, default='')
    twilio_auth_token    = models.CharField(max_length=100, blank=True, default='')
    twilio_whatsapp_from = models.CharField(max_length=30, blank=True, default='',
                                             help_text='Ej: +14155238886')
    meta_whatsapp_token    = models.CharField(max_length=500, blank=True, default='')
    meta_whatsapp_phone_id = models.CharField(max_length=50, blank=True, default='')
    director_whatsapp = models.CharField(max_length=30, blank=True, default='',
                                          help_text='Número del director para alertas de mora día 15')

    class Meta:
        verbose_name = 'Configuración de Notificaciones'

    def __str__(self):
        return 'Configuración de Notificaciones'


class NotificacionLog(models.Model):
    CANALES = (('email', 'Email'), ('whatsapp', 'WhatsApp'))
    ESTADOS = (('enviado', 'Enviado'), ('fallido', 'Fallido'), ('pendiente', 'Pendiente'))
    TIPOS = (
        ('mora_dia_0',   'Aviso factura (Dia 0)'),
        ('mora_dia_5',   'Recordatorio (Dia 5)'),
        ('mora_dia_10',  'Segundo aviso (Dia 10)'),
        ('mora_dia_15',  'Alerta director (Dia 15)'),
        ('comprobante',  'Comprobante subido'),
        ('bienvenida',   'Bienvenida portal'),
        ('pago_exitoso', 'Pago confirmado'),
        ('prueba',       'Mensaje de prueba'),
        ('otro',         'Otro'),
    )

    canal                = models.CharField(max_length=10, choices=CANALES)
    tipo                 = models.CharField(max_length=20, choices=TIPOS, default='otro')
    destinatario         = models.CharField(max_length=200)
    asunto               = models.CharField(max_length=255, blank=True)
    mensaje              = models.TextField(blank=True)
    estado               = models.CharField(max_length=10, choices=ESTADOS, default='pendiente')
    error_detalle        = models.TextField(blank=True)
    fecha_envio          = models.DateTimeField(auto_now_add=True)
    representante_cedula = models.CharField(max_length=20, blank=True)
    alumno_nombre        = models.CharField(max_length=200, blank=True)
    proveedor            = models.CharField(max_length=20, blank=True)

    class Meta:
        ordering = ['-fecha_envio']
        verbose_name = 'Log de Notificacion'
        verbose_name_plural = 'Logs de Notificaciones'

    def __str__(self):
        return f'[{self.canal}] {self.tipo} - {self.destinatario} ({self.estado})'
