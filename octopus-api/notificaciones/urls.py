from django.urls import path
from .views import (
    ProbarNotificacionView, ConfiguracionNotificacionesView, LogNotificacionesView,
    PerfilEmailRemitenteView,
    PlantillasWhatsAppView, PlantillaWhatsAppDetailView, VariablesPlantillaWhatsAppView,
    SuscripcionPushUsuarioView,
    PlantillasAvisoView, PlantillaAvisoDetailView,
    PrevisualizarCobroWhatsAppView, RegistrarEnvioManualCobroWhatsAppView, EnviarCobroWhatsAppView,
    WebhookMetaWhatsAppView, WebhookTwilioWhatsAppView, AdjuntoWhatsAppView,
)

urlpatterns = [
    path('probar/',                     ProbarNotificacionView.as_view()),
    path('configuracion/',              ConfiguracionNotificacionesView.as_view()),
    path('perfiles-email/<str:area>/',  PerfilEmailRemitenteView.as_view()),
    path('push/usuario/',               SuscripcionPushUsuarioView.as_view()),
    path('logs/',                       LogNotificacionesView.as_view()),

    # Cobros por WhatsApp — 'variables/' debe ir antes que '<int:pk>/' para
    # que no lo capture el patrón con pk.
    path('plantillas-whatsapp/variables/',          VariablesPlantillaWhatsAppView.as_view()),
    path('plantillas-whatsapp/',                    PlantillasWhatsAppView.as_view()),
    path('plantillas-whatsapp/<int:pk>/',           PlantillaWhatsAppDetailView.as_view()),
    # Plantillas de aviso al representante (comprobante aprobado/rechazado)
    path('plantillas-aviso/',                       PlantillasAvisoView.as_view()),
    path('plantillas-aviso/<int:pk>/',              PlantillaAvisoDetailView.as_view()),
    path('cobro-whatsapp/previsualizar/',           PrevisualizarCobroWhatsAppView.as_view()),
    path('cobro-whatsapp/registrar-envio-manual/',  RegistrarEnvioManualCobroWhatsAppView.as_view()),
    path('cobro-whatsapp/enviar/',                  EnviarCobroWhatsAppView.as_view()),

    # WhatsApp entrante (públicos, protegidos por la firma del proveedor)
    path('whatsapp/webhook/meta/',                  WebhookMetaWhatsAppView.as_view()),
    path('whatsapp/webhook/twilio/',                WebhookTwilioWhatsAppView.as_view()),
    path('whatsapp/adjuntos/<int:pk>/',             AdjuntoWhatsAppView.as_view()),
]
