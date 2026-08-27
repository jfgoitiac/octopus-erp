from django.db import models

from .crypto_fields import EncryptedTextField

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
    email_host_password = EncryptedTextField(blank=True, default='')
    email_from        = models.CharField(max_length=200, blank=True, default='',
                                         help_text='Ej: Colegio <noreply@colegio.edu.ve>')
    director_email    = models.EmailField(blank=True, default='')

    # ── WhatsApp ────────────────────────────────────────────────────────────────
    whatsapp_activo    = models.BooleanField(default=False, verbose_name='WhatsApp activo')
    whatsapp_proveedor = models.CharField(max_length=10, choices=PROVEEDORES_WA, blank=True, default='')
    twilio_account_sid   = models.CharField(max_length=100, blank=True, default='')
    twilio_auth_token    = EncryptedTextField(blank=True, default='')
    twilio_whatsapp_from = models.CharField(max_length=30, blank=True, default='',
                                             help_text='Ej: +14155238886')
    meta_whatsapp_token    = EncryptedTextField(blank=True, default='')
    meta_whatsapp_phone_id = models.CharField(max_length=50, blank=True, default='')
    director_whatsapp = models.CharField(max_length=30, blank=True, default='',
                                          help_text='Número del director para alertas de mora día 15')

    # ── Cronograma de recordatorios de mora ────────────────────────────────────
    # Días desde el vencimiento de la mensualidad. El día 0 (factura generada)
    # es fijo; estos tres hitos son configurables sin necesidad de deploy.
    dias_recordatorio_1  = models.PositiveIntegerField(
        default=5, verbose_name='Días — primer recordatorio')
    dias_recordatorio_2  = models.PositiveIntegerField(
        default=10, verbose_name='Días — segundo aviso')
    dias_alerta_director = models.PositiveIntegerField(
        default=15, verbose_name='Días — alerta al director')

    class Meta:
        verbose_name = 'Configuración de Notificaciones'

    def __str__(self):
        return 'Configuración de Notificaciones'


class PerfilEmailRemitente(models.Model):
    """Credenciales SMTP por área — cada módulo envía con su propio remitente
    (ej. cobranza@clhma.com para pagos, controldeestudios@clhma.com para
    comprobantes de inscripción)."""

    AREAS = (
        ('cobranza', 'Cobranza'),
        ('control_estudios', 'Control de Estudios'),
    )

    area                 = models.CharField(max_length=20, choices=AREAS, unique=True)
    email_activo         = models.BooleanField(default=False, verbose_name='Email activo')
    email_host           = models.CharField(max_length=200, blank=True, default='smtp.hostinger.com')
    email_port           = models.PositiveIntegerField(default=465)
    email_use_tls        = models.BooleanField(default=True)
    email_host_user      = models.CharField(max_length=200, blank=True, default='')
    email_host_password  = models.CharField(max_length=500, blank=True, default='')
    email_from           = models.CharField(max_length=200, blank=True, default='',
                                            help_text='Ej: Cobranza <cobranza@colegio.edu.ve>')

    class Meta:
        verbose_name = 'Perfil de Email por Área'
        verbose_name_plural = 'Perfiles de Email por Área'

    def __str__(self):
        return f'Perfil email — {self.get_area_display()}'


def _tipos_push_default():
    return ['circular', 'nota', 'factura', 'mensaje']


class SuscripcionPush(models.Model):
    """Suscripción Web Push de un representante del portal. Un mismo
    representante puede tener varias (uno por dispositivo/navegador)."""

    usuario_portal = models.ForeignKey(
        'portal.RepresentanteUser', on_delete=models.CASCADE, related_name='suscripciones_push',
    )
    endpoint      = models.URLField(max_length=500, unique=True)
    p256dh        = models.TextField()
    auth          = models.TextField()
    activa        = models.BooleanField(default=True)
    tipos_activos = models.JSONField(default=_tipos_push_default)
    fecha_registro = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Suscripción Push'
        verbose_name_plural = 'Suscripciones Push'

    def __str__(self):
        return f'Push {self.usuario_portal} ({"activa" if self.activa else "inactiva"})'


class NotificacionLog(models.Model):
    CANALES = (('email', 'Email'), ('whatsapp', 'WhatsApp'), ('push', 'Push'))
    ESTADOS = (('enviado', 'Enviado'), ('fallido', 'Fallido'), ('pendiente', 'Pendiente'))
    TIPOS = (
        ('mora_dia_0',   'Aviso factura (Dia 0)'),
        ('mora_dia_5',   'Recordatorio (Dia 5)'),
        ('mora_dia_10',  'Segundo aviso (Dia 10)'),
        ('mora_dia_15',  'Alerta director (Dia 15)'),
        ('comprobante',  'Comprobante subido'),
        ('comprobante_inscripcion', 'Comprobante de inscripción'),
        ('bienvenida',   'Bienvenida portal'),
        ('reset_password', 'Recuperación de contraseña'),
        ('pago_exitoso', 'Pago confirmado'),
        ('prueba',       'Mensaje de prueba'),
        ('otro',         'Otro'),
    )

    canal                = models.CharField(max_length=10, choices=CANALES)
    tipo                 = models.CharField(max_length=30, choices=TIPOS, default='otro')
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
