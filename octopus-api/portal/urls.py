from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView


class PortalTokenRefreshView(TokenRefreshView):
    """
    Refresh del portal sin clases de autenticación: si el cliente adjunta un
    access token (expirado o de rol 'representante') en el header, la clase
    por defecto AdminJWTAuthentication lo rechazaría con 401 antes de poder
    procesar el refresh token del body.
    """
    authentication_classes = []


from .views import (
    PortalTokenView,
    PortalDashboardView,
    PortalHistorialPagosView,
    PortalComprobantePagoView,
    ActivarPortalRepresentanteView,
    PortalBancosView,
    AdminComprobantesView,
    VerificarReferenciaView,
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
    path('token/refresh/', PortalTokenRefreshView.as_view(), name='portal_token_refresh'),

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

    # Admin — Listar comprobantes pendientes: GET /api/portal/admin/comprobantes/?estatus=pendiente
    path('admin/comprobantes/', AdminComprobantesView.as_view(), name='portal_admin_comprobantes'),

    # Admin — Aprobar/rechazar comprobante: PATCH /api/portal/admin/comprobantes/<id>/
    path('admin/comprobantes/<int:comprobante_id>/', AdminComprobantesView.as_view(), name='portal_admin_comprobante_detalle'),


    # Verificar si una referencia bancaria ya existe en el sistema
    # GET /api/portal/verificar-referencia/?ref=XXXXXX
    path('verificar-referencia/', VerificarReferenciaView.as_view(), name='portal_verificar_referencia'),

    # Configuración visual pública del colegio (sin auth): GET /api/portal/config-colegio/
    path('config-colegio/', ConfiguracionColegioPublicaView.as_view(), name='portal_config_colegio'),

    # Cambio de contraseña del representante: POST /api/portal/cambiar-contrasena/
    path('cambiar-contrasena/', CambiarContrasenaPortalView.as_view(), name='portal_cambiar_contrasena'),
]
