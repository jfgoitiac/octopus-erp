from django.contrib import admin
from .models import NotificacionLog, ConfiguracionNotificaciones


@admin.register(NotificacionLog)
class NotificacionLogAdmin(admin.ModelAdmin):
    list_display   = ['fecha_envio', 'canal', 'tipo', 'destinatario', 'estado', 'proveedor']
    list_filter    = ['canal', 'tipo', 'estado', 'proveedor']
    search_fields  = ['destinatario', 'representante_cedula', 'alumno_nombre']
    readonly_fields = ['fecha_envio']


@admin.register(ConfiguracionNotificaciones)
class ConfiguracionNotificacionesAdmin(admin.ModelAdmin):
    fieldsets = (
        ('Email SMTP', {
            'fields': ('email_activo', 'email_host', 'email_port', 'email_use_tls',
                       'email_host_user', 'email_host_password', 'email_from', 'director_email'),
        }),
        ('WhatsApp', {
            'fields': ('whatsapp_activo', 'whatsapp_proveedor', 'director_whatsapp',
                       'twilio_account_sid', 'twilio_auth_token', 'twilio_whatsapp_from',
                       'meta_whatsapp_token', 'meta_whatsapp_phone_id'),
        }),
    )
