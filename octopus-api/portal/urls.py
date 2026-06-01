from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    PortalTokenView,
    PortalDashboardView,
    PortalHistorialPagosView,
    PortalComprobantePagoView,
    ActivarPortalRepresentanteView,
    PortalBancosView,
    StripeCheckoutView,
    StripeWebhookView,
    AdminComprobantesView,
    ConfiguracionColegioPublicaView,
    CambiarContrasenaPortalView,
)

urlpatterns = [
    # Autenticación: POST /api/portal/token/
    path('token/', PortalTokenView.as_view(), name='portal_token'),

    # Refresh de token del portal: POST /api/portal/token/refresh/
    # SEGURIDAD: ruta propia del portal para que el frontend NO use /api/token/refresh/
    # (que pertenece al panel admin y no valida RepresentanteUser).
    # Nota: simplejwt TokenRefreshView acepta cualquier refresh token válido del sistema;
    # el control de que solo representantes usen el portal se aplica en PortalJWTAuthentication
    # al validar el access token resultante en cada endpoint protegido.
    path('token/refresh/', TokenRefreshView.as_view(), name='portal_token_refresh'),

    # Dashboard financiero: GET /api/portal/dashboard/
    path('dashboard/', PortalDashboardView.as_view(), name='portal_dashboard'),

    # Historial de pagos: GET /api/portal/historial/?alumno_id=X
    path('historial/', PortalHistorialPagosView.as_view(), name='portal_historial'),

    # Comprobantes: POST /api/portal/comprobante/ — GET /api/portal/comprobante/
    path('comprobante/', PortalComprobantePagoView.as_view(), name='portal_comprobante'),

    # Activar/desactivar portal de un representante (uso admin)
    path('activar-representante/', ActivarPortalRepresentanteView.as_view(), name='portal_activar'),
    path('activar-representante/<int:representante_id>/', ActivarPortalRepresentanteView.as_view(), name='portal_desactivar'),

    # Datos bancarios del colegio para transferencias
    path('bancos/', PortalBancosView.as_view(), name='portal_bancos'),

    # Stripe Checkout: POST /api/portal/stripe/checkout/
    path('stripe/checkout/', StripeCheckoutView.as_view(), name='portal_stripe_checkout'),

    # Stripe Webhook: POST /api/portal/stripe/webhook/
    # SEGURIDAD: Sin autenticación — Stripe firma el payload con STRIPE_WEBHOOK_SECRET
    path('stripe/webhook/', StripeWebhookView.as_view(), name='portal_stripe_webhook'),

    # Admin — Listar comprobantes pendientes: GET /api/portal/admin/comprobantes/?estatus=pendiente
    path('admin/comprobantes/', AdminComprobantesView.as_view(), name='portal_admin_comprobantes'),

    # Admin — Aprobar/rechazar comprobante: PATCH /api/portal/admin/comprobantes/<id>/
    path('admin/comprobantes/<int:comprobante_id>/', AdminComprobantesView.as_view(), name='portal_admin_comprobante_detalle'),


    # Configuración visual pública del colegio (sin auth): GET /api/portal/config-colegio/
    path('config-colegio/', ConfiguracionColegioPublicaView.as_view(), name='portal_config_colegio'),

    # Cambio de contraseña del representante: POST /api/portal/cambiar-contrasena/
    path('cambiar-contrasena/', CambiarContrasenaPortalView.as_view(), name='portal_cambiar_contrasena'),
]
