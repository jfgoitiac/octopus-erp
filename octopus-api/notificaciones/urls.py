from django.urls import path
from .webhook_meta import WebhookMetaView
from .views import (
    ProbarNotificacionView, ConfiguracionNotificacionesView, LogNotificacionesView,
    PerfilEmailRemitenteView,
    PlantillasWhatsAppView, PlantillaWhatsAppDetailView, VariablesPlantillaWhatsAppView,
    SuscripcionPushUsuarioView, WhatsAppSedesView, WhatsAppSedeDetailView,
    PrevisualizarCobroWhatsAppView, RegistrarEnvioManualCobroWhatsAppView, EnviarCobroWhatsAppView,
)

urlpatterns = [
    # Webhook de Meta (sin JWT; firma X-Hub-Signature-256). Ver WHATSAPP_META_WEBHOOK.md
    path('whatsapp/webhook/',           WebhookMetaView.as_view()),
    path('probar/',                     ProbarNotificacionView.as_view()),
    path('configuracion/',              ConfiguracionNotificacionesView.as_view()),
    path('whatsapp-sedes/',             WhatsAppSedesView.as_view()),
    path('whatsapp-sedes/<int:sede_id>/', WhatsAppSedeDetailView.as_view()),
    path('perfiles-email/<str:area>/',  PerfilEmailRemitenteView.as_view()),
    path('push/usuario/',               SuscripcionPushUsuarioView.as_view()),
    path('logs/',                       LogNotificacionesView.as_view()),

    # Cobros por WhatsApp — 'variables/' debe ir antes que '<int:pk>/' para
    # que no lo capture el patrón con pk.
    path('plantillas-whatsapp/variables/',          VariablesPlantillaWhatsAppView.as_view()),
    path('plantillas-whatsapp/',                    PlantillasWhatsAppView.as_view()),
    path('plantillas-whatsapp/<int:pk>/',           PlantillaWhatsAppDetailView.as_view()),
    path('cobro-whatsapp/previsualizar/',           PrevisualizarCobroWhatsAppView.as_view()),
    path('cobro-whatsapp/registrar-envio-manual/',  RegistrarEnvioManualCobroWhatsAppView.as_view()),
    path('cobro-whatsapp/enviar/',                  EnviarCobroWhatsAppView.as_view()),
]
