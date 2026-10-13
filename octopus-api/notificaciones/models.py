from django.conf import settings
from django.db import models
from django.utils import timezone

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
    # Webhook de Meta (Cobranza Inteligente v4, conversaciones): ver WHATSAPP_META_WEBHOOK.md
    meta_app_secret = EncryptedTextField(
        blank=True, default='',
        help_text='App Secret de la app de Meta: firma X-Hub-Signature-256 del webhook.')
    meta_webhook_verify_token = models.CharField(
        max_length=100, blank=True, default='',
        help_text='Token que se escribe en Meta al registrar el webhook (verificación GET).')
    meta_waba_id = models.CharField(max_length=50, blank=True, default='',
                                    help_text='ID de la cuenta de WhatsApp Business (WABA).')

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


class ConfiguracionWhatsAppSede(models.Model):
    """Credenciales de WhatsApp (Meta Cloud API) propias de una sede.

    Si la sede no tiene fila, o la fila no está `activo`, hereda la
    configuración general (`ConfiguracionNotificaciones` pk=1). Toda lectura
    pasa por `notificaciones.config_whatsapp.get_config_whatsapp(sede)`; nadie
    debe leer estos campos directamente para enviar. Ver
    docs/CONTRATO_WHATSAPP_POR_SEDE.md."""

    sede = models.OneToOneField(
        'multisede.Sede', on_delete=models.CASCADE, related_name='config_whatsapp')
    activo = models.BooleanField(
        default=False, help_text='Apagado = la sede usa la configuración general.')
    numero_visible = models.CharField(
        max_length=30, blank=True, default='',
        help_text='Número que ven las familias (informativo), ej. +58 412 1234567.')
    meta_whatsapp_phone_id = models.CharField(
        max_length=50, blank=True, default='',
        help_text='Phone Number ID de Meta: identifica el número y enruta el webhook.')
    meta_whatsapp_token = EncryptedTextField(blank=True, default='')
    meta_waba_id = models.CharField(max_length=50, blank=True, default='')
    meta_app_secret = EncryptedTextField(
        blank=True, default='',
        help_text='Vacío = se usa el App Secret general (misma app de Meta).')
    meta_webhook_verify_token = models.CharField(
        max_length=100, blank=True, default='',
        help_text='Vacío = se usa el token de verificación general.')
    actualizada_en = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Configuración de WhatsApp por sede'
        verbose_name_plural = 'Configuraciones de WhatsApp por sede'
        constraints = [
            models.UniqueConstraint(
                fields=['meta_whatsapp_phone_id'], name='uniq_wa_sede_phone_id',
                condition=~models.Q(meta_whatsapp_phone_id='')),
        ]

    def __str__(self):
        return f'WhatsApp de {self.sede} ({"activo" if self.activo else "hereda"})'


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


def _tipos_push_usuario_default():
    return ['mensaje', 'comprobante']


class SuscripcionPushUsuario(models.Model):
    """Suscripción Web Push de un usuario del panel (administrativo o docente).
    Equivalente a SuscripcionPush, que es exclusiva de representantes. Un
    usuario puede tener varias (una por dispositivo/navegador)."""

    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='suscripciones_push',
    )
    endpoint      = models.URLField(max_length=500, unique=True)
    p256dh        = models.TextField()
    auth          = models.TextField()
    activa        = models.BooleanField(default=True)
    tipos_activos = models.JSONField(default=_tipos_push_usuario_default)
    fecha_registro = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Suscripción Push (usuario del panel)'
        verbose_name_plural = 'Suscripciones Push (usuarios del panel)'

    def __str__(self):
        return f'Push {self.usuario} ({"activa" if self.activa else "inactiva"})'


class NotificacionLog(models.Model):
    CANALES = (('email', 'Email'), ('whatsapp', 'WhatsApp'), ('push', 'Push'))
    ESTADOS = (('enviado', 'Enviado'), ('fallido', 'Fallido'), ('pendiente', 'Pendiente'))
    MODOS = (('', ''), ('manual', 'Enlace manual (wa.me)'), ('automatico', 'API automática'))
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
        ('cobro_whatsapp', 'Cobro por WhatsApp'),
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
    # Solo aplica a canal='whatsapp': si el envío fue un enlace wa.me abierto
    # manualmente por la secretaria (Modo A) o una llamada de API con
    # plantilla aprobada (Modo B). Vacío para el resto de canales/tipos.
    modo                 = models.CharField(max_length=10, choices=MODOS, blank=True, default='')

    class Meta:
        ordering = ['-fecha_envio']
        verbose_name = 'Log de Notificacion'
        verbose_name_plural = 'Logs de Notificaciones'

    def __str__(self):
        return f'[{self.canal}] {self.tipo} - {self.destinatario} ({self.estado})'


class PlantillaWhatsApp(models.Model):
    """Plantilla de mensaje de cobranza por WhatsApp, en texto plano con
    tokens `{{grupo.campo}}` (ver notificaciones/cobro_whatsapp.py para el
    renderizado). Los campos de Modo B (`nombre_plantilla_meta` etc.) solo
    se usan si se activa el envío automático vía API con plantilla aprobada
    por Meta; el envío manual (Modo A, enlace wa.me) no los necesita."""

    TIPOS = (
        ('recordatorio',  'Recordatorio amable'),
        ('segundo_aviso', 'Segundo aviso'),
        ('aviso_final',   'Aviso final'),
        ('personalizada', 'Personalizada'),
    )

    nombre         = models.CharField(max_length=100)
    tipo           = models.CharField(max_length=20, choices=TIPOS, default='personalizada')
    cuerpo         = models.TextField(
        help_text='Texto plano con tokens {{grupo.campo}}. Máximo recomendado ~1000 caracteres.')
    predeterminada = models.BooleanField(default=False)
    activa         = models.BooleanField(default=True)

    # ── Modo B (opcional) ──────────────────────────────────────────────────
    nombre_plantilla_meta = models.CharField(max_length=100, blank=True, default='')
    idioma_meta           = models.CharField(max_length=10, blank=True, default='es')
    orden_parametros_meta = models.JSONField(default=list, blank=True)

    creada_en      = models.DateTimeField(auto_now_add=True)
    actualizada_en = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-predeterminada', 'nombre']
        verbose_name = 'Plantilla de WhatsApp'
        verbose_name_plural = 'Plantillas de WhatsApp'

    def __str__(self):
        return f'{self.nombre}{" (predeterminada)" if self.predeterminada else ""}'

    def save(self, *args, **kwargs):
        if self.predeterminada:
            PlantillaWhatsApp.objects.exclude(pk=self.pk).update(predeterminada=False)
        super().save(*args, **kwargs)


# ── Conversaciones de WhatsApp (Cobranza Inteligente v4, Fase B) ──────────────

class ConversacionWhatsApp(models.Model):
    """Una conversación por número de WhatsApp (no por alumno). Se vincula al
    representante solo si el teléfono normalizado coincide con UNO; si coincide
    con varios o con ninguno queda sin vincular hasta que el cobrador decida."""

    AUTOMATICO = 'automatico'
    HUMANO = 'humano'
    ESTADOS = ((AUTOMATICO, 'Automático'), (HUMANO, 'Atendida por el cobrador'))
    ESPERANDO = (('', ''), ('comprobante', 'Comprobante'), ('fecha_acuerdo', 'Fecha de acuerdo'))

    telefono = models.CharField(max_length=20, unique=True, help_text='E.164 con +, ej. +584121234567')
    nombre_contacto = models.CharField(max_length=150, blank=True, default='',
                                       help_text='Nombre del perfil de WhatsApp (viene del webhook).')
    representante = models.ForeignKey(
        'secretaria.Representante', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='conversaciones_whatsapp')
    sede = models.ForeignKey(
        'multisede.Sede', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    estado = models.CharField(max_length=10, choices=ESTADOS, default=AUTOMATICO, db_index=True)
    requiere_humano = models.BooleanField(default=False)
    tomada_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    tomada_en = models.DateTimeField(null=True, blank=True)
    ultimo_entrante_en = models.DateTimeField(null=True, blank=True)
    ultimo_saliente_en = models.DateTimeField(null=True, blank=True)
    # Último mensaje escrito por una persona (no por el sistema): base de la
    # devolución automática a los 3 días y de las tarjetas de Hoy.
    ultimo_humano_en = models.DateTimeField(null=True, blank=True)
    no_leidos = models.PositiveIntegerField(default=0)
    # Phone Number ID por el que escribió la familia la última vez: la respuesta
    # sale por ese mismo número (la ventana de 24 h es por número).
    phone_id_entrante = models.CharField(max_length=50, blank=True, default='')
    esperando = models.CharField(max_length=20, blank=True, default='', choices=ESPERANDO)
    actualizado_en = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ['-actualizado_en', '-id']
        verbose_name = 'Conversación de WhatsApp'
        verbose_name_plural = 'Conversaciones de WhatsApp'

    def __str__(self):
        return f'{self.telefono} ({self.estado})'


class MensajeWhatsApp(models.Model):
    ENTRANTE = 'entrante'
    SALIENTE = 'saliente'
    NOTA = 'nota'
    DIRECCIONES = ((ENTRANTE, 'Entrante'), (SALIENTE, 'Saliente'), (NOTA, 'Nota interna'))
    TIPOS = (
        ('texto', 'Texto'), ('imagen', 'Imagen'), ('documento', 'Documento'), ('boton', 'Botón'),
        ('lista', 'Lista'), ('plantilla', 'Plantilla'), ('sistema', 'Sistema'),
    )
    ENTREGAS = (('enviado', 'Enviado'), ('entregado', 'Entregado'), ('leido', 'Leído'),
                ('fallido', 'Fallido'))
    ADJUNTO_PENDIENTE = 'pendiente'
    ADJUNTO_CONVERTIDO = 'convertido'
    ADJUNTO_DESCARTADO = 'descartado'
    ESTADOS_ADJUNTO = (('', ''), (ADJUNTO_PENDIENTE, 'Pendiente'), (ADJUNTO_CONVERTIDO, 'Convertido'),
                       (ADJUNTO_DESCARTADO, 'Descartado'))

    conversacion = models.ForeignKey(
        ConversacionWhatsApp, on_delete=models.CASCADE, related_name='mensajes')
    direccion = models.CharField(max_length=10, choices=DIRECCIONES)
    tipo = models.CharField(max_length=10, choices=TIPOS, default='texto')
    cuerpo = models.TextField(blank=True, default='')
    payload = models.JSONField(default=dict, blank=True)
    wa_message_id = models.CharField(max_length=128, unique=True, null=True, blank=True)
    estado_entrega = models.CharField(max_length=10, choices=ENTREGAS, blank=True, default='')
    adjunto = models.FileField(upload_to='whatsapp_adjuntos/%Y/%m/', null=True, blank=True)
    estado_adjunto = models.CharField(max_length=10, choices=ESTADOS_ADJUNTO, blank=True, default='',
                                      db_index=True)
    enviado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    envio_cobranza = models.ForeignKey(
        'cobranza.EnvioCobranza', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    creado_en = models.DateTimeField(default=timezone.now, db_index=True)
    # Cambia también con las actualizaciones de entrega: base del hilo incremental (?desde=).
    actualizado_en = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        ordering = ['creado_en', 'id']
        verbose_name = 'Mensaje de WhatsApp'
        verbose_name_plural = 'Mensajes de WhatsApp'

    def __str__(self):
        return f'{self.direccion} {self.tipo} #{self.pk}'


class RespuestaRapida(models.Model):
    """Texto reutilizable con variables ({nombre}, {saldo_usd}, {saldo_bs},
    {alumnos}, {link_portal}, {datos_bancarios})."""

    sede = models.ForeignKey(
        'multisede.Sede', on_delete=models.CASCADE, null=True, blank=True, related_name='+',
        help_text='Vacío = disponible para todas las sedes.')
    titulo = models.CharField(max_length=100)
    cuerpo = models.TextField()
    activa = models.BooleanField(default=True)
    orden = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['orden', 'titulo', 'id']
        verbose_name = 'Respuesta rápida'
        verbose_name_plural = 'Respuestas rápidas'

    def __str__(self):
        return self.titulo
