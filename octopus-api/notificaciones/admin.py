from django import forms
from django.contrib import admin
from .models import NotificacionLog, ConfiguracionNotificaciones, PerfilEmailRemitente, SuscripcionPush

# Campos que guardan credenciales/secretos (cifrados en reposo — ver
# notificaciones/crypto_fields.py) y que por lo tanto NO deben mostrarse en
# claro en el admin, igual que un campo de contraseña normal.
CAMPOS_SECRETOS_CONFIG = ('email_host_password', 'twilio_auth_token', 'meta_whatsapp_token')


class ConfiguracionNotificacionesForm(forms.ModelForm):
    class Meta:
        model = ConfiguracionNotificaciones
        fields = '__all__'
        widgets = {
            campo: forms.PasswordInput(render_value=False)
            for campo in CAMPOS_SECRETOS_CONFIG
        }


@admin.register(NotificacionLog)
class NotificacionLogAdmin(admin.ModelAdmin):
    list_display   = ['fecha_envio', 'canal', 'tipo', 'destinatario', 'estado', 'proveedor']
    list_filter    = ['canal', 'tipo', 'estado', 'proveedor']
    search_fields  = ['destinatario', 'representante_cedula', 'alumno_nombre']
    readonly_fields = ['fecha_envio']


@admin.register(ConfiguracionNotificaciones)
class ConfiguracionNotificacionesAdmin(admin.ModelAdmin):
    form = ConfiguracionNotificacionesForm
    fieldsets = (
        ('Email (legado — ver Perfiles de Email por Área)', {
            'fields': ('director_email',),
        }),
        ('WhatsApp', {
            'fields': ('whatsapp_activo', 'whatsapp_proveedor', 'director_whatsapp',
                       'twilio_account_sid', 'twilio_auth_token', 'twilio_whatsapp_from',
                       'meta_whatsapp_token', 'meta_whatsapp_phone_id'),
        }),
    )


@admin.register(SuscripcionPush)
class SuscripcionPushAdmin(admin.ModelAdmin):
    list_display   = ['usuario_portal', 'activa', 'tipos_activos', 'fecha_registro']
    list_filter    = ['activa']
    search_fields  = ['usuario_portal__representante__cedula', 'usuario_portal__representante__nombre']
    readonly_fields = ['endpoint', 'p256dh', 'auth', 'fecha_registro']


@admin.register(PerfilEmailRemitente)
class PerfilEmailRemitenteAdmin(admin.ModelAdmin):
    list_display = ['area', 'email_activo', 'email_host_user']
    fieldsets = (
        (None, {
            'fields': ('area', 'email_activo', 'email_host', 'email_port',
                       'email_use_tls', 'email_host_user', 'email_host_password', 'email_from'),
        }),
    )
