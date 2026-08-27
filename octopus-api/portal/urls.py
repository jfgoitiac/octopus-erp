from django.urls import path
from rest_framework import status
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.views import TokenRefreshView

from .views import PORTAL_REFRESH_COOKIE, _portal_cookie_settings


class PortalTokenRefreshView(TokenRefreshView):
    """
    Refresh del portal sin clases de autenticación: si el cliente adjunta un
    access token (expirado o de rol 'representante') en el header, la clase
    por defecto AdminJWTAuthentication lo rechazaría con 401 antes de poder
    procesar el refresh token del body.

    SEGURIDAD: el refresh token ya NO se lee del body — viaja SOLO en la
    cookie HttpOnly `portal_refresh_token` (path=/api/portal/), mismo patrón
    que CookieTokenRefreshView del panel admin (authentication/cookie_views.py).
    Si simplejwt rota el refresh (ROTATE_REFRESH_TOKENS), la cookie se
    re-setea con el nuevo valor en la respuesta.
    """
    authentication_classes = []

    def post(self, request, *args, **kwargs):
        refresh = request.COOKIES.get(PORTAL_REFRESH_COOKIE)
        if not refresh:
            return Response(
                {'detail': 'Sesion expirada. Inicia sesion nuevamente.'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        serializer = self.get_serializer(data={'refresh': refresh})
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as e:
            raise InvalidToken(e.args[0])
        return Response(serializer.validated_data, status=status.HTTP_200_OK)

    def finalize_response(self, request, response, *args, **kwargs):
        if response.status_code == 200 and 'refresh' in response.data:
            new_refresh = response.data.pop('refresh')
            response.set_cookie(PORTAL_REFRESH_COOKIE, new_refresh, **_portal_cookie_settings())
        return super().finalize_response(request, response, *args, **kwargs)


from .views import (
    PortalTokenView,
    PortalLogoutView,
    PortalSolicitarResetView,
    PortalConfirmarResetView,
    PortalDashboardView,
    PortalHistorialPagosView,
    PortalReciboPagoView,
    PortalComprobantePagoView,
    ActivarPortalRepresentanteView,
    PortalBancosView,
    AdminComprobantesView,
    VerificarReferenciaView,
    ConfiguracionColegioPublicaView,
    CambiarContrasenaPortalView,
    PortalMiPerfilView,
    PortalFotoPerfilView,
    PortalSaldoTarjetaView,
    PortalHistorialConsumoCantinaView,
    PortalRecargarTarjetaView,
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

    # Logout: POST /api/portal/logout/ — invalida el refresh (blacklist) y borra la cookie.
    path('logout/', PortalLogoutView.as_view(), name='portal_logout'),

    # Recuperación de contraseña self-service (sin sesión activa):
    # POST /api/portal/reset-password/solicitar/  — { cedula_o_email }
    # POST /api/portal/reset-password/confirmar/  — { uid, token, contrasena_nueva, confirmar }
    path('reset-password/solicitar/', PortalSolicitarResetView.as_view(), name='portal_reset_solicitar'),
    path('reset-password/confirmar/', PortalConfirmarResetView.as_view(), name='portal_reset_confirmar'),

    # Dashboard financiero: GET /api/portal/dashboard/
    path('dashboard/', PortalDashboardView.as_view(), name='portal_dashboard'),

    # Historial de pagos: GET /api/portal/historial/?alumno_id=X
    path('historial/', PortalHistorialPagosView.as_view(), name='portal_historial'),

    # Recibo PDF de un pago confirmado: GET /api/portal/recibo/<pago_id>/
    path('recibo/<int:pago_id>/', PortalReciboPagoView.as_view(), name='portal_recibo'),

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

    # Perfil del representante: GET/PATCH /api/portal/mi-perfil/ — POST /api/portal/mi-perfil/foto/
    path('mi-perfil/', PortalMiPerfilView.as_view(), name='portal_mi_perfil'),
    path('mi-perfil/foto/', PortalFotoPerfilView.as_view(), name='portal_mi_perfil_foto'),

    # Cantina — saldo/historial/recarga de la tarjeta prepago de los hijos (cantina.md §5.6/§7.5)
    path('cantina/saldo/', PortalSaldoTarjetaView.as_view(), name='portal_cantina_saldo'),
    path('cantina/historial/', PortalHistorialConsumoCantinaView.as_view(), name='portal_cantina_historial'),
    path('cantina/recargar/', PortalRecargarTarjetaView.as_view(), name='portal_cantina_recargar'),
]
