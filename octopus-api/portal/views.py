import hashlib
import logging
import os
import secrets
from collections import defaultdict
from datetime import date
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.db import transaction

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from secretaria.models import Alumno
from cobranza.models import CuotaInscripcion, CuotaProyectoInversion, Mensualidad, Pago

from authentication.serializers import PerfilFotoSerializer

from pagos_comunes.comprobantes import validar_comprobante

from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from django.contrib.auth.tokens import default_token_generator

from .authentication import PortalJWTAuthentication
from .models import ComprobantePago, RepresentanteUser
from .serializers import (
    AlumnoDashboardSerializer,
    ComprobantePagoSerializer,
    MensualidadSerializer,
    MovimientoTarjetaPortalSerializer,
    PagoHistorialSerializer,
    PortalConfirmarResetSerializer,
    PortalPerfilSerializer,
    PortalSolicitarResetSerializer,
    PortalTokenSerializer,
    RecargaTarjetaPortalSerializer,
    TarjetaCantinaPortalSerializer,
)

# Métodos de pago del portal que REQUIEREN número de referencia bancaria.
# El efectivo genera su propio identificador automáticamente.
_METODOS_CON_REFERENCIA_OBLIGATORIA = {
    'transferencia', 'pago_movil', 'punto_de_venta', 'zelle',
}

# ──────────────────────────────────────────────────────────────────────────────
# THROTTLE: limita intentos de login a 5 por minuto por IP
# ──────────────────────────────────────────────────────────────────────────────

class PortalLoginThrottle(AnonRateThrottle):
    rate = '5/min'
    scope = 'portal_login'


class PortalPasswordResetThrottle(AnonRateThrottle):
    # Mismo límite que el login: evita usar el endpoint para floodear de
    # emails a una cédula/correo ajena, o para tantear por fuerza bruta
    # qué cédulas tienen portal activo (aunque la respuesta ya sea genérica).
    rate = '5/min'
    scope = 'portal_password_reset'

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# COOKIE DEL REFRESH TOKEN DEL PORTAL
# Mismo patrón que authentication/cookie_views.py (REFRESH_COOKIE='refresh_token'
# del panel admin) pero con nombre y path propios para que la cookie del portal
# NUNCA viaje hacia rutas del panel administrativo (ni viceversa).
# ──────────────────────────────────────────────────────────────────────────────

PORTAL_REFRESH_COOKIE = 'portal_refresh_token'
PORTAL_REFRESH_COOKIE_PATH = '/api/portal/'


def _portal_cookie_settings():
    # AUTH_COOKIE_SECURE permite forzar False en producción sobre HTTP puro,
    # igual que en authentication/cookie_views.py::_cookie_settings().
    secure = getattr(settings, 'AUTH_COOKIE_SECURE', not settings.DEBUG)
    return {
        'httponly': True,
        'secure': secure,
        'samesite': 'Lax',
        'max_age': int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()),
        'path': PORTAL_REFRESH_COOKIE_PATH,
    }


# ──────────────────────────────────────────────────────────────────────────────
# HELPER: obtener representante del request autenticado
# ──────────────────────────────────────────────────────────────────────────────

def _get_representante(request):
    """
    Retorna el objeto Representante asociado al usuario autenticado del portal.
    Lanza una excepción si el vínculo no existe (no debería ocurrir si
    PortalJWTAuthentication está bien configurada).
    """
    return request.user.representante_portal.representante


# ──────────────────────────────────────────────────────────────────────────────
# LOGIN DEL PORTAL
# ──────────────────────────────────────────────────────────────────────────────

class PortalTokenView(APIView):
    """
    Endpoint de autenticación exclusivo para representantes.
    Acepta cédula o correo + contraseña y retorna tokens JWT separados
    de los tokens del panel administrativo.
    SEGURIDAD: protegido con throttle de 5 intentos/minuto por IP.
    """
    permission_classes = [permissions.AllowAny]
    authentication_classes = []  # login: no debe evaluar tokens previos del header
    throttle_classes = [PortalLoginThrottle]

    def post(self, request):
        serializer = PortalTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        tokens = serializer.validated_data['tokens']
        representante = serializer.validated_data['representante']

        # El refresh token viaja SOLO via cookie HttpOnly — nunca en el body
        # JSON — mismo patrón que CookieTokenObtainPairView del panel admin
        # (authentication/cookie_views.py). El access token se sigue
        # devolviendo en el body (vida corta, guardado en localStorage por
        # ahora — fuera de alcance de esta migración).
        response = Response({
            'access': tokens['access'],
            'representante_id': representante.id,
            'nombre': representante.nombre,
            'apellido': representante.apellido,
            'cedula': representante.cedula,
            'debe_cambiar_password': serializer.validated_data['debe_cambiar_password'],
        }, status=status.HTTP_200_OK)
        response.set_cookie(PORTAL_REFRESH_COOKIE, tokens['refresh'], **_portal_cookie_settings())
        return response


# ──────────────────────────────────────────────────────────────────────────────
# LOGOUT DEL PORTAL
# ──────────────────────────────────────────────────────────────────────────────

class PortalLogoutView(APIView):
    """
    Invalida (blacklist) el refresh token del portal y borra la cookie
    HttpOnly. Mismo patrón que authentication/views.py::LogoutView (panel
    admin), pero exclusivo del portal de representantes: usa la cookie
    PORTAL_REFRESH_COOKIE (nombre y path propios) en vez de la del admin.
    POST /api/portal/logout/
    """
    authentication_classes = [PortalJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        refresh = request.COOKIES.get(PORTAL_REFRESH_COOKIE)
        if refresh:
            try:
                RefreshToken(refresh).blacklist()
            except (TokenError, AttributeError):
                # Token ya inválido/expirado/malformado o ya en blacklist:
                # no es un error para el usuario, igual se cierra la sesión.
                pass

        response = Response({'mensaje': 'Sesión cerrada correctamente.'}, status=status.HTTP_200_OK)
        response.delete_cookie(PORTAL_REFRESH_COOKIE, path=PORTAL_REFRESH_COOKIE_PATH)
        return response


# ──────────────────────────────────────────────────────────────────────────────
# RECUPERACIÓN DE CONTRASEÑA (self-service — el representante no depende de
# que un admin le resetee la clave a mano desde el panel)
# ──────────────────────────────────────────────────────────────────────────────

# Mensaje único para ambos casos (cédula/correo existe o no) — evita username
# enumeration, mismo criterio que PortalTokenSerializer._ERROR_GENERICO.
_MENSAJE_RESET_SOLICITADO = (
    'Si la cédula o correo corresponde a una cuenta del portal, se envió un '
    'enlace de recuperación al correo registrado.'
)


class PortalSolicitarResetView(APIView):
    """
    POST /api/portal/reset-password/solicitar/ — { cedula_o_email }
    Envía (si corresponde) un email con un link de un solo uso para
    restablecer la contraseña. La respuesta HTTP es idéntica exista o no
    la cuenta, para no filtrar qué cédulas tienen portal activo.
    """
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [PortalPasswordResetThrottle]

    def post(self, request):
        serializer = PortalSolicitarResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        representante = serializer.validated_data['representante']

        if representante and representante.correo:
            rep_user = representante.portal_user
            uid = urlsafe_base64_encode(force_bytes(rep_user.pk))
            token = default_token_generator.make_token(rep_user.user)
            from notificaciones.services import notificar_reset_password_portal
            notificar_reset_password_portal(representante, uid, token)
            logger.info(f'Solicitud de reset de password enviada para representante {representante.cedula}.')

        return Response({'mensaje': _MENSAJE_RESET_SOLICITADO}, status=status.HTTP_200_OK)


class PortalConfirmarResetView(APIView):
    """
    POST /api/portal/reset-password/confirmar/ — { uid, token, contrasena_nueva, confirmar }
    Aplica la nueva contraseña si el uid/token del link son válidos y no expiraron.
    """
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [PortalPasswordResetThrottle]

    def post(self, request):
        serializer = PortalConfirmarResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rep_user = serializer.validated_data['rep_user']

        rep_user.user.set_password(serializer.validated_data['contrasena_nueva'])
        rep_user.user.save()
        if rep_user.debe_cambiar_password:
            rep_user.debe_cambiar_password = False
            rep_user.save(update_fields=['debe_cambiar_password'])

        logger.info(f'Representante {rep_user.representante.cedula} restableció su contraseña vía link de recuperación.')
        return Response({'mensaje': 'Contraseña actualizada. Ya puedes iniciar sesión.'}, status=status.HTTP_200_OK)


# ──────────────────────────────────────────────────────────────────────────────
# DASHBOARD DEL REPRESENTANTE
# ──────────────────────────────────────────────────────────────────────────────

class PortalDashboardView(APIView):
    """
    Dashboard principal del portal.
    Retorna datos del representante, lista de alumnos y resumen financiero.
    """
    authentication_classes = [PortalJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from cobranza.mora import annotate_en_mora, estatus_financiero_actual

        representante = _get_representante(request)
        # Estatus EN VIVO (criterio canónico) para que el portal coincida con
        # los módulos de alumnos y morosos sin esperar la corrida nocturna.
        alumnos = list(annotate_en_mora(Alumno.objects.filter(
            representante=representante, activo=True
        )))
        for a in alumnos:
            a.estatus_financiero = estatus_financiero_actual(a)

        hoy = date.today()

        # Una sola query para las mensualidades pendientes de todos los alumnos
        # (antes: 2 queries de Mensualidad por alumno, N+1 con varios hijos).
        # El orden ('anio', 'mes') coincide con Meta.ordering de Mensualidad,
        # así que al agrupar por alumno cada lista queda cronológica.
        pendientes_por_alumno = defaultdict(list)
        for m in Mensualidad.objects.filter(
            alumno__in=alumnos, pagado=False
        ).order_by('anio', 'mes'):
            pendientes_por_alumno[m.alumno_id].append(m)

        # Cuotas de inscripción pendientes de todos los alumnos (una sola query,
        # igual que con las mensualidades más arriba).
        inscripcion_por_alumno = defaultdict(list)
        for c in CuotaInscripcion.objects.filter(alumno__in=alumnos, pagado=False):
            inscripcion_por_alumno[c.alumno_id].append(c)

        # Proyecto de Inversión: cuota por REPRESENTANTE (no por alumno), se
        # cobra una sola vez por período aunque tenga varios hijos inscritos
        # (ver cobranza/models.py::CuotaProyectoInversion).
        proyectos_inversion = list(
            CuotaProyectoInversion.objects.filter(
                representante=representante, pagado=False
            )
        )

        # Calcular resumen financiero consolidado de todos los alumnos
        total_deuda_usd = 0
        mensualidades_vencidas = []
        proximos_vencimientos = []
        otros_conceptos_pendientes = []

        for alumno in alumnos:
            pendientes = pendientes_por_alumno.get(alumno.id, [])

            # Mensualidades no pagadas y ya vencidas (mes <= mes actual)
            vencidas = [
                m for m in pendientes
                if m.anio < hoy.year or (m.anio == hoy.year and m.mes <= hoy.month)
            ]

            # Próximos 2 meses sin pagar
            futuras = [
                m for m in pendientes
                if m.anio > hoy.year or (m.anio == hoy.year and m.mes > hoy.month)
            ][:2]

            vencidas_data = MensualidadSerializer(vencidas, many=True).data
            futuras_data = MensualidadSerializer(futuras, many=True).data

            # Acumular datos enriquecidos con nombre del alumno
            alumno_nombre = f"{alumno.nombre} {alumno.apellido}"
            for item in vencidas_data:
                item['alumno_nombre'] = alumno_nombre
                item['alumno_id'] = alumno.id
                # monto_total ya incluye el recargo prospectivo (ver
                # MensualidadSerializer.get_monto_total) — se usa en vez de
                # monto_usd para que el resumen financiero del portal
                # coincida con lo que realmente se cobraría en caja.
                total_deuda_usd += float(item['monto_total'])
            for item in futuras_data:
                item['alumno_nombre'] = alumno_nombre
                item['alumno_id'] = alumno.id

            mensualidades_vencidas.extend(vencidas_data)
            proximos_vencimientos.extend(futuras_data)

            # Cuota de inscripción: no tiene fecha límite propia, se considera
            # vencida desde que se genera (mismo criterio que cobranza/mora.py).
            for c in inscripcion_por_alumno.get(alumno.id, []):
                total_deuda_usd += float(c.monto_usd)
                otros_conceptos_pendientes.append({
                    'id': c.id,
                    'tipo': 'inscripcion',
                    'concepto': f'Inscripción {c.periodo_escolar}',
                    'periodo_escolar': c.periodo_escolar,
                    'monto_usd': str(c.monto_usd),
                    'alumno_nombre': alumno_nombre,
                    'alumno_id': alumno.id,
                })

        # El proyecto de inversión se cobra una sola vez por representante,
        # aunque tenga varios hijos: se agrega una sola vez al total.
        for p in proyectos_inversion:
            total_deuda_usd += float(p.monto_usd)
            otros_conceptos_pendientes.append({
                'id': p.id,
                'tipo': 'proyecto_inversion',
                'concepto': f'Proyecto de Inversión {p.periodo_escolar}',
                'periodo_escolar': p.periodo_escolar,
                'monto_usd': str(p.monto_usd),
                'alumno_nombre': None,
                'alumno_id': None,
            })

        # Últimos 3 pagos de todos los alumnos del representante
        ultimos_pagos = Pago.objects.filter(
            alumno__representante=representante,
            alumno__activo=True,
        ).order_by('-fecha_pago')[:3]

        return Response({
            'representante': {
                'nombre': representante.nombre,
                'apellido': representante.apellido,
                'cedula': representante.cedula,
                'correo': representante.correo,
                'telefono': representante.telefono,
            },
            'alumnos': AlumnoDashboardSerializer(alumnos, many=True).data,
            'resumen_financiero': {
                'total_deuda_usd': round(total_deuda_usd, 2),
                'mensualidades_vencidas': mensualidades_vencidas,
                'proximos_vencimientos': proximos_vencimientos,
                'otros_conceptos_pendientes': otros_conceptos_pendientes,
            },
            'ultimos_pagos': PagoHistorialSerializer(ultimos_pagos, many=True).data,
        })


# ──────────────────────────────────────────────────────────────────────────────
# HISTORIAL DE PAGOS
# ──────────────────────────────────────────────────────────────────────────────

class PortalHistorialPagosView(APIView):
    """
    Historial de pagos de un alumno específico del representante autenticado.
    Soporta paginación mediante query params: page, page_size (máx. 50).
    """
    authentication_classes = [PortalJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        representante = _get_representante(request)

        alumno_id = request.query_params.get('alumno_id')
        if not alumno_id:
            return Response(
                {'error': 'El parámetro alumno_id es requerido.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Verificar que el alumno pertenece al representante autenticado
        try:
            alumno = Alumno.objects.get(
                id=alumno_id,
                representante=representante,
                activo=True
            )
        except Alumno.DoesNotExist:
            return Response(
                {'error': 'Alumno no encontrado o no pertenece a este representante.'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Paginación
        try:
            page = max(1, int(request.query_params.get('page', 1)))
            page_size = min(50, max(1, int(request.query_params.get('page_size', 10))))
        except (ValueError, TypeError):
            page, page_size = 1, 10

        from cobranza.services import pagos_de_alumno
        # Incluye pagos donde el alumno fue el titular de la transacción y
        # también aquellos donde fue uno de los hermanos cuya deuda se saldó
        # en una operación conjunta (ver cobranza/services.py::pagos_de_alumno).
        pagos_qs = pagos_de_alumno(alumno).order_by('-fecha_pago')
        total = pagos_qs.count()
        offset = (page - 1) * page_size
        pagos_pagina = pagos_qs[offset:offset + page_size]

        return Response({
            'alumno': f"{alumno.nombre} {alumno.apellido}",
            'total': total,
            'page': page,
            'page_size': page_size,
            'total_pages': max(1, (total + page_size - 1) // page_size),
            'results': PagoHistorialSerializer(pagos_pagina, many=True).data,
        })


class PortalReciboPagoView(APIView):
    """
    GET /api/portal/recibo/<pago_id>/
    Descarga el recibo PDF de un pago confirmado del representante autenticado.
    Reusa cobranza.utils.generar_pdf_recibo — el mismo generador que
    cobranza.views.ReciboView usa para el panel admin — para no duplicar el
    formato del recibo ni el manejo de operaciones multipago (un Pago puede
    saldar la deuda de varios hermanos a la vez, ver pagos_de_alumno).
    """
    authentication_classes = [PortalJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pago_id):
        from django.db.models import Q
        from django.http import FileResponse
        from cobranza.utils import generar_pdf_recibo

        representante = _get_representante(request)

        try:
            pago = Pago.objects.filter(
                Q(alumno__representante=representante)
                | Q(mensualidades_pagadas__alumno__representante=representante)
                | Q(cuotas_inscripcion_pagadas__alumno__representante=representante)
                | Q(cuotas_solvencia_pagadas__alumno__representante=representante)
            ).distinct().get(id=pago_id, estatus='completado')
        except Pago.DoesNotExist:
            return Response(
                {'error': 'Pago no encontrado, no está confirmado, o no pertenece a sus alumnos.'},
                status=status.HTTP_404_NOT_FOUND
            )

        pagos = list(
            Pago.objects.filter(operacion_uuid=pago.operacion_uuid).select_related(
                'alumno', 'alumno__representante', 'usuario_receptor', 'banco_receptor'
            ).order_by('id')
        )

        try:
            pdf_buffer = generar_pdf_recibo(pagos)
        except Exception as e:
            logger.error(f'Error generando PDF de recibo {pago_id} (portal): {e}')
            return Response(
                {'error': 'No se pudo generar el recibo PDF.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        factura_label = pago.factura_id or f"{pago.id:06d}"
        return FileResponse(
            pdf_buffer,
            as_attachment=True,
            filename=f"Recibo_{factura_label}.pdf",
            content_type='application/pdf'
        )


# ──────────────────────────────────────────────────────────────────────────────
# SUBIDA DE COMPROBANTE DE PAGO
# ──────────────────────────────────────────────────────────────────────────────

class PortalComprobantePagoView(APIView):
    """
    Permite al representante subir un comprobante de transferencia o depósito
    para una mensualidad pendiente. El personal administrativo revisará
    y aprobará o rechazará el comprobante desde el panel interno.
    """
    authentication_classes = [PortalJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        representante = _get_representante(request)

        mensualidad_id     = request.data.get('mensualidad_id')
        archivo            = request.FILES.get('archivo')
        referencia_raw     = (request.data.get('referencia_bancaria') or '').strip()
        metodo_pago        = (request.data.get('metodo_pago') or 'transferencia').strip().lower()
        banco_receptor_id  = request.data.get('banco_receptor_id')

        if not mensualidad_id:
            return Response(
                {'error': 'El campo mensualidad_id es requerido.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if not archivo:
            return Response(
                {'error': 'Debe adjuntar un archivo de comprobante.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Verificar que la mensualidad corresponde a un alumno del representante.
        # Se hace ANTES de cualquier validación de campos (ej. referencia
        # obligatoria) para que un intento sobre una mensualidad ajena
        # devuelva 404 (IDOR) sin importar qué otros campos falten en el
        # payload — mismo criterio que el resto del portal (ver
        # PortalHistorialPagosView). Antes vivía después del chequeo de
        # referencia y un intento sobre una mensualidad ajena sin referencia
        # devolvía 400 en vez de 404, filtrando por accidente el requisito
        # de validación de un objeto al que el representante no debería ni
        # poder consultar.
        try:
            mensualidad = Mensualidad.objects.select_related('alumno__representante').get(
                id=mensualidad_id,
                alumno__representante=representante,
                alumno__activo=True,
                pagado=False,
            )
        except Mensualidad.DoesNotExist:
            return Response(
                {'error': 'Mensualidad no encontrada, ya pagada, o no pertenece a sus alumnos.'},
                status=status.HTTP_404_NOT_FOUND
            )

        # --- Banco receptor: OPCIONAL, nunca bloquea el envío. Solo se valida
        # que exista y esté activo si el representante sí eligió uno. ---
        banco_receptor = None
        if banco_receptor_id:
            from cobranza.models import BancoInstitucional
            try:
                banco_receptor = BancoInstitucional.objects.get(id=banco_receptor_id, activo=True)
            except (BancoInstitucional.DoesNotExist, ValueError, TypeError):
                return Response(
                    {'error': 'Banco receptor no encontrado.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # --- ANTIFRAUDE 1: referencia obligatoria para métodos bancarios ---
        if metodo_pago in _METODOS_CON_REFERENCIA_OBLIGATORIA and not referencia_raw:
            return Response(
                {'error': 'Debe ingresar el número de referencia o confirmación de la transacción.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Normalizar referencia (mayúsculas, sin espacios dobles)
        referencia = ' '.join(referencia_raw.upper().split()) if referencia_raw else None

        # --- ANTIFRAUDE 2: bloquear múltiples comprobantes pendientes por mensualidad ---
        comprobante_pendiente = ComprobantePago.objects.filter(
            mensualidad=mensualidad,
            estatus='pendiente',
        ).first()
        if comprobante_pendiente:
            return Response(
                {
                    'error': (
                        'Ya tiene un comprobante en revisión para esta mensualidad '
                        f'(#{comprobante_pendiente.id}, enviado el '
                        f'{comprobante_pendiente.fecha_subida.strftime("%d/%m/%Y %H:%M")}). '
                        'Espere la respuesta del equipo de cobranza antes de enviar otro.'
                    )
                },
                status=status.HTTP_409_CONFLICT
            )

        # Validar tamaño, extensión, content-type y magic bytes (pagos_comunes.comprobantes)
        error_comprobante = validar_comprobante(archivo)
        if error_comprobante:
            return Response({'error': error_comprobante}, status=status.HTTP_400_BAD_REQUEST)

        # --- ANTIFRAUDE 3: hash SHA-256 del archivo para detectar duplicados exactos ---
        archivo.seek(0)
        hash_sha256 = hashlib.sha256(archivo.read()).hexdigest()
        archivo.seek(0)

        comprobante_mismo_hash = ComprobantePago.objects.filter(
            hash_archivo=hash_sha256,
            estatus__in=['pendiente', 'aprobado'],
        ).first()
        if comprobante_mismo_hash:
            return Response(
                {
                    'error': (
                        'Este archivo ya fue enviado anteriormente '
                        f'(comprobante #{comprobante_mismo_hash.id}, '
                        f'mensualidad: {comprobante_mismo_hash.mensualidad.get_mes_display()} '
                        f'{comprobante_mismo_hash.mensualidad.anio}). '
                        'No puede presentar el mismo comprobante para mensualidades distintas.'
                    )
                },
                status=status.HTTP_409_CONFLICT
            )

        # --- ANTIFRAUDE 4: referencia ya usada en otro comprobante o pago registrado ---
        # Clave compuesta (referencia, metodo_pago, banco_receptor): la misma
        # referencia con otro método o banco receptor no es duplicado. Cuando
        # este comprobante no trae banco, se compara solo contra otros
        # comprobantes/pagos que TAMPOCO tienen banco (isnull=True), porque
        # NULL no colisiona con NULL a nivel de columna.
        if referencia:
            dup_comprobante_qs = ComprobantePago.objects.filter(
                referencia_bancaria=referencia,
                metodo_pago=metodo_pago,
                estatus__in=['pendiente', 'aprobado'],
            ).exclude(mensualidad=mensualidad)
            if banco_receptor_id:
                dup_comprobante_qs = dup_comprobante_qs.filter(banco_receptor_id=banco_receptor.id)
            else:
                dup_comprobante_qs = dup_comprobante_qs.filter(banco_receptor__isnull=True)
            dup_comprobante = dup_comprobante_qs.first()
            if dup_comprobante:
                return Response(
                    {
                        'error': (
                            f"La referencia '{referencia}' ya fue enviada en otro comprobante "
                            f"(#{dup_comprobante.id}). Cada transacción bancaria solo puede "
                            "usarse para pagar una mensualidad."
                        )
                    },
                    status=status.HTTP_409_CONFLICT
                )

            dup_pago_qs = Pago.objects.filter(
                referencia=referencia,
                metodo_pago=metodo_pago,
                estatus__in=['completado', 'en_revision'],
            )
            if banco_receptor_id:
                dup_pago_qs = dup_pago_qs.filter(banco_receptor_id=banco_receptor.id)
            else:
                dup_pago_qs = dup_pago_qs.filter(banco_receptor__isnull=True)
            dup_pago = dup_pago_qs.first()
            if dup_pago:
                return Response(
                    {
                        'error': (
                            f"La referencia '{referencia}' ya fue registrada como pago "
                            f"confirmado (factura {dup_pago.factura_id or dup_pago.pk}). "
                            "Si cree que hay un error, contacte a la administración."
                        )
                    },
                    status=status.HTTP_409_CONFLICT
                )

            # --- ANTIFRAUDE 4b: referencia ya usada en una recarga de cantina ---
            # Cierra el hueco cruzado descrito en cantina.md §5.9: sin este
            # chequeo, una referencia ya usada para recargar la tarjeta de
            # cantina de un alumno podía reciclarse aquí para "pagar" una
            # mensualidad, porque este endpoint solo miraba sus propias
            # tablas (ComprobantePago/Pago) y no sabía que `cantina` existe.
            from pagos_comunes.referencias import buscar_referencia_duplicada
            duplicado_cantina = buscar_referencia_duplicada(
                referencia, metodo_pago=metodo_pago,
                banco_receptor_id=(banco_receptor.id if banco_receptor_id else None),
            )
            if duplicado_cantina and duplicado_cantina['origen'] == 'cantina.RecargaTarjeta':
                return Response(
                    {
                        'error': (
                            f"La referencia '{referencia}' ya está en uso en una recarga "
                            f"de cantina (#{duplicado_cantina['id']}, {duplicado_cantina['detalle']}). "
                            "Si cree que es un error, contacte a la administración."
                        )
                    },
                    status=status.HTTP_409_CONFLICT
                )

        # Obtener IP del cliente
        ip_cliente = (
            request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()
            or request.META.get('REMOTE_ADDR', '')
        )

        comprobante = ComprobantePago.objects.create(
            mensualidad=mensualidad,
            archivo=archivo,
            referencia_bancaria=referencia,
            metodo_pago=metodo_pago,
            banco_receptor=banco_receptor,
            hash_archivo=hash_sha256,
            subido_por_ip=ip_cliente,
        )

        # Notificar al equipo de cobranza de forma asíncrona
        try:
            from .tasks import notificar_comprobante_subido
            notificar_comprobante_subido.delay(comprobante.id)
        except Exception as e:
            logger.warning(f'No se pudo encolar notificación de comprobante: {e}')

        logger.info(
            "Comprobante #%s subido por representante %s para mensualidad %s (ref=%s, hash=%s…)",
            comprobante.id, representante.cedula, mensualidad_id,
            referencia or 'N/A', hash_sha256[:12],
        )

        return Response(
            ComprobantePagoSerializer(comprobante).data,
            status=status.HTTP_201_CREATED
        )

    def get(self, request):
        """
        Consulta el estado de los comprobantes del representante autenticado.
        Permite filtrar por alumno_id o mensualidad_id.
        """
        representante = _get_representante(request)

        comprobantes_qs = ComprobantePago.objects.filter(
            mensualidad__alumno__representante=representante
        ).select_related('mensualidad__alumno')

        alumno_id = request.query_params.get('alumno_id')
        if alumno_id:
            comprobantes_qs = comprobantes_qs.filter(
                mensualidad__alumno_id=alumno_id
            )

        return Response(
            ComprobantePagoSerializer(comprobantes_qs, many=True).data
        )

# ──────────────────────────────────────────────────────────────────────────────
# CANTINA — SALDO, HISTORIAL DE CONSUMO Y RECARGA DE TARJETA PREPAGO
# (Fase 3 del portal — cantina.md §5.6/§7.5. El portal solo lee cantina.models
#  y crea RecargaTarjeta en 'pendiente' — nunca acredita saldo directamente,
#  eso solo ocurre cuando cantina aprueba la recarga, fuera de este módulo.)
# ──────────────────────────────────────────────────────────────────────────────

# Métodos de pago que el portal ofrece para recargar la tarjeta de cantina.
# "efectivo" (USD) y "tarjeta_prepago" quedan excluidos deliberadamente: el
# representante que quiere pagar en efectivo lo hace presencialmente en la
# cantina (RecargarTarjetaCajeroView, fuera de este módulo), no por la app.
_METODOS_RECARGA_CANTINA_PORTAL = {'transferencia', 'pago_movil', 'zelle', 'efectivo_ves'}
# Solo transferencia/pago_movil piden a qué cuenta del colegio se transfirió.
_METODOS_RECARGA_CON_BANCO_RECEPTOR = {'transferencia', 'pago_movil'}
# efectivo_ves no tiene rastro bancario que referenciar (se entrega físicamente).
_METODOS_RECARGA_CON_REFERENCIA_OBLIGATORIA = {'transferencia', 'pago_movil', 'zelle'}
_METODOS_RECARGA_CON_COMPROBANTE_OBLIGATORIO = {'transferencia', 'pago_movil', 'zelle'}


class PortalSaldoTarjetaView(APIView):
    """
    GET /api/portal/cantina/saldo/
    Devuelve, para cada alumno activo del representante autenticado, el
    estado de su tarjeta de cantina. Un alumno sin tarjeta asignada aparece
    con tiene_tarjeta=False (nunca se omite ni se responde con error).
    Soporta ?alumno_id= para pedir solo uno (debe pertenecer al representante).
    """
    authentication_classes = [PortalJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        representante = _get_representante(request)
        alumnos_qs = Alumno.objects.filter(
            representante=representante, activo=True
        ).select_related('tarjeta_cantina')

        alumno_id = request.query_params.get('alumno_id')
        if alumno_id:
            try:
                alumnos_qs = alumnos_qs.filter(id=alumno_id)
                encontrado = alumnos_qs.exists()
            except (ValueError, TypeError):
                encontrado = False
            if not encontrado:
                return Response(
                    {'error': 'Alumno no encontrado o no pertenece a este representante.'},
                    status=status.HTTP_404_NOT_FOUND
                )

        hoy = date.today()
        resultados = []
        for alumno in alumnos_qs:
            # getattr con default funciona porque el descriptor reverso de un
            # OneToOneField levanta una excepción que también es AttributeError
            # cuando no existe la fila relacionada (TarjetaPrepago.alumno).
            tarjeta = getattr(alumno, 'tarjeta_cantina', None)
            alumno_nombre = f'{alumno.nombre} {alumno.apellido}'

            if tarjeta is None:
                resultados.append({
                    'alumno_id': alumno.id,
                    'alumno_nombre': alumno_nombre,
                    'grado_seccion': alumno.grado_seccion,
                    'tiene_tarjeta': False,
                    'tarjeta_id': None,
                    'saldo': None,
                    'estado': None,
                    'estado_display': None,
                    'limite_credito': None,
                    'en_negativo': False,
                    'saldo_negativo_desde': None,
                    'dias_en_negativo': 0,
                })
                continue

            dias_negativo = (hoy - tarjeta.saldo_negativo_desde).days if tarjeta.saldo_negativo_desde else 0
            resultados.append({
                'alumno_id': alumno.id,
                'alumno_nombre': alumno_nombre,
                'grado_seccion': alumno.grado_seccion,
                'tiene_tarjeta': True,
                'tarjeta_id': tarjeta.id,
                'saldo': str(tarjeta.saldo),
                'estado': tarjeta.estado,
                'estado_display': tarjeta.get_estado_display(),
                'limite_credito': str(tarjeta.limite_credito),
                'en_negativo': tarjeta.saldo < 0,
                'saldo_negativo_desde': tarjeta.saldo_negativo_desde,
                'dias_en_negativo': dias_negativo,
            })

        return Response(TarjetaCantinaPortalSerializer(resultados, many=True).data)


class PortalHistorialConsumoCantinaView(APIView):
    """
    GET /api/portal/cantina/historial/?alumno_id=X&page=&page_size=
    Historial paginado de consumos (MovimientoTarjeta tipo 'consumo') de la
    tarjeta de cantina de un alumno del representante autenticado.
    Se separa de PortalSaldoTarjetaView (en vez de anidar el historial ahí)
    porque es paginado igual que PortalHistorialPagosView — mezclarlo con el
    saldo de todos los hijos en una sola respuesta hubiera forzado paginar
    varias listas independientes en el mismo payload.
    """
    authentication_classes = [PortalJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from cantina.models import MovimientoTarjeta

        representante = _get_representante(request)

        alumno_id = request.query_params.get('alumno_id')
        if not alumno_id:
            return Response(
                {'error': 'El parámetro alumno_id es requerido.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            alumno = Alumno.objects.select_related('tarjeta_cantina').get(
                id=alumno_id, representante=representante, activo=True
            )
        except (Alumno.DoesNotExist, ValueError, TypeError):
            return Response(
                {'error': 'Alumno no encontrado o no pertenece a este representante.'},
                status=status.HTTP_404_NOT_FOUND
            )

        tarjeta = getattr(alumno, 'tarjeta_cantina', None)
        if tarjeta is None:
            return Response({
                'alumno': f'{alumno.nombre} {alumno.apellido}',
                'tiene_tarjeta': False,
                'total': 0,
                'page': 1,
                'page_size': 10,
                'total_pages': 1,
                'results': [],
            })

        try:
            page = max(1, int(request.query_params.get('page', 1)))
            page_size = min(50, max(1, int(request.query_params.get('page_size', 10))))
        except (ValueError, TypeError):
            page, page_size = 1, 10

        movimientos_qs = MovimientoTarjeta.objects.filter(
            tarjeta=tarjeta, tipo='consumo'
        ).order_by('-creado_en')
        total = movimientos_qs.count()
        offset = (page - 1) * page_size
        pagina = movimientos_qs[offset:offset + page_size]

        return Response({
            'alumno': f'{alumno.nombre} {alumno.apellido}',
            'tiene_tarjeta': True,
            'total': total,
            'page': page,
            'page_size': page_size,
            'total_pages': max(1, (total + page_size - 1) // page_size),
            'results': MovimientoTarjetaPortalSerializer(pagina, many=True).data,
        })


class PortalRecargarTarjetaView(APIView):
    """
    POST /api/portal/cantina/recargar/ (multipart)
    Crea una RecargaTarjeta en estatus='pendiente' con registrado_por_portal=True
    para la tarjeta de cantina de un alumno del representante autenticado.
    NUNCA acredita saldo: eso solo pasa cuando cantina aprueba la recarga
    (AprobarRecargaView, en la app cantina, fuera del alcance de esta vista).

    Payload (multipart/form-data):
      - alumno_id (obligatorio): la tarjeta se resuelve desde el alumno,
        siempre validando que pertenezca al representante autenticado.
      - metodo_pago (obligatorio): 'transferencia' | 'pago_movil' | 'zelle' | 'efectivo_ves'.
      - monto_usd o monto_ves (al menos uno): el campo no enviado se deriva
        con la tasa vigente (TasaCambio.objects.latest('fecha')) y NUNCA se
        vuelve a recalcular después.
      - banco_receptor_id (obligatorio solo si metodo_pago es transferencia/pago_movil).
      - banco_procedencia (opcional).
      - referencia (obligatorio solo si metodo_pago es transferencia/pago_movil/zelle).
      - archivo (obligatorio solo si metodo_pago es transferencia/pago_movil/zelle).
    """
    authentication_classes = [PortalJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from cantina.models import RecargaTarjeta
        from cobranza.models import BancoInstitucional, TasaCambio
        from pagos_comunes.referencias import buscar_referencia_duplicada, normalizar_referencia

        representante = _get_representante(request)

        alumno_id          = request.data.get('alumno_id')
        metodo_pago        = (request.data.get('metodo_pago') or '').strip().lower()
        archivo             = request.FILES.get('archivo')
        banco_receptor_id  = request.data.get('banco_receptor_id')
        banco_procedencia  = (request.data.get('banco_procedencia') or '').strip() or None
        referencia_raw     = (request.data.get('referencia') or '').strip()

        if not alumno_id:
            return Response(
                {'error': 'El campo alumno_id es requerido.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if metodo_pago not in _METODOS_RECARGA_CANTINA_PORTAL:
            return Response(
                {
                    'error': (
                        "Método de pago no permitido desde el portal. Use "
                        "transferencia, pago_movil, zelle o efectivo_ves. Efectivo en "
                        "divisas y pago con tarjeta prepago solo se procesan "
                        "presencialmente en la cantina."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # Verificar que el alumno pertenece al representante autenticado
        # (nunca se confía en un alumno_id sin verificar contra el dueño del token).
        try:
            alumno = Alumno.objects.select_related('tarjeta_cantina').get(
                id=alumno_id, representante=representante, activo=True
            )
        except (Alumno.DoesNotExist, ValueError, TypeError):
            return Response(
                {'error': 'Alumno no encontrado o no pertenece a este representante.'},
                status=status.HTTP_404_NOT_FOUND
            )

        tarjeta = getattr(alumno, 'tarjeta_cantina', None)
        if tarjeta is None:
            return Response(
                {'error': 'Este alumno no tiene una tarjeta de cantina asignada todavía.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if tarjeta.estado != 'activa':
            return Response(
                {
                    'error': (
                        f'La tarjeta de este alumno está en estado '
                        f'"{tarjeta.get_estado_display()}" y no puede recibir recargas.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # --- Monto: se requiere USD o VES; el que no llega se deriva con la tasa vigente ---
        monto_usd_raw = request.data.get('monto_usd')
        monto_ves_raw = request.data.get('monto_ves')
        if not monto_usd_raw and not monto_ves_raw:
            return Response(
                {'error': 'Se requiere monto en USD o VES.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            monto_usd_in = Decimal(str(monto_usd_raw)) if monto_usd_raw else None
            monto_ves_in = Decimal(str(monto_ves_raw)) if monto_ves_raw else None
        except InvalidOperation:
            return Response({'error': 'Monto inválido.'}, status=status.HTTP_400_BAD_REQUEST)

        if (monto_usd_in is not None and monto_usd_in <= 0) or (monto_ves_in is not None and monto_ves_in <= 0):
            return Response({'error': 'El monto debe ser mayor a cero.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            tasa = TasaCambio.objects.latest('fecha')
        except TasaCambio.DoesNotExist:
            return Response(
                {'error': 'No se ha registrado ninguna tasa de cambio.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if monto_usd_in is not None:
            monto_usd = monto_usd_in
            monto_ves = (monto_usd * tasa.valor_bs).quantize(Decimal('0.01'))
        else:
            monto_ves = monto_ves_in
            monto_usd = (monto_ves / tasa.valor_bs).quantize(Decimal('0.01'))

        # --- Banco receptor (solo transferencia/pago_movil) ---
        banco_receptor = None
        if metodo_pago in _METODOS_RECARGA_CON_BANCO_RECEPTOR:
            if not banco_receptor_id:
                return Response(
                    {'error': 'Debe indicar el banco receptor.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            try:
                banco_receptor = BancoInstitucional.objects.get(id=banco_receptor_id, activo=True)
            except (BancoInstitucional.DoesNotExist, ValueError, TypeError):
                return Response(
                    {'error': 'Banco receptor no encontrado.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # --- Referencia obligatoria según método ---
        if metodo_pago in _METODOS_RECARGA_CON_REFERENCIA_OBLIGATORIA and not referencia_raw:
            return Response(
                {'error': 'Debe ingresar el número de referencia o confirmación de la transacción.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        referencia = normalizar_referencia(referencia_raw) if referencia_raw else None

        # --- Comprobante (misma validación que PortalComprobantePagoView:
        #     tamaño máx. 10MB, extensión, content-type, magic bytes) ---
        if metodo_pago in _METODOS_RECARGA_CON_COMPROBANTE_OBLIGATORIO and not archivo:
            return Response(
                {'error': 'Debe adjuntar un archivo de comprobante.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if archivo:
            error_comprobante = validar_comprobante(archivo)
            if error_comprobante:
                return Response({'error': error_comprobante}, status=status.HTTP_400_BAD_REQUEST)

        # --- Antifraude: referencia duplicada CRUZADA entre cobranza/portal/cantina ---
        if referencia:
            duplicado = buscar_referencia_duplicada(
                referencia, metodo_pago=metodo_pago,
                banco_receptor_id=(banco_receptor.id if banco_receptor else None),
            )
            if duplicado:
                return Response(
                    {
                        'error': (
                            f"La referencia '{referencia}' ya está en uso en "
                            f"{duplicado['origen']} (#{duplicado['id']}, {duplicado['detalle']}). "
                            "Si cree que es un error, contacte a la administración."
                        )
                    },
                    status=status.HTTP_409_CONFLICT
                )

        recarga = RecargaTarjeta.objects.create(
            tarjeta=tarjeta,
            metodo_pago=metodo_pago,
            monto_usd=monto_usd,
            tasa_aplicada=tasa.valor_bs,
            monto_ves=monto_ves,
            banco_receptor=banco_receptor,
            banco_procedencia=banco_procedencia,
            referencia=referencia,
            comprobante=archivo,
            estatus='pendiente',
            registrado_por_portal=True,
        )

        logger.info(
            "Recarga de cantina #%s creada desde portal por representante %s "
            "para alumno %s (metodo=%s, usd=%s, ves=%s).",
            recarga.id, representante.cedula, alumno.id, metodo_pago, monto_usd, monto_ves,
        )

        return Response(
            RecargaTarjetaPortalSerializer(recarga).data,
            status=status.HTTP_201_CREATED
        )


# ──────────────────────────────────────────────────────────────────────────────
# PROBLEMA 3 — ACTIVAR/DESACTIVAR PORTAL DE UN REPRESENTANTE
# ──────────────────────────────────────────────────────────────────────────────

class ActivarPortalRepresentanteView(APIView):
    """
    Permite a un administrador activar el acceso al portal
    de un Representante existente.
    Solo roles: director, sistemas, administrador.
    POST body: { representante_id, password (opcional, default=cedula) }
    DELETE /activar-representante/<id>/ — desactiva el acceso.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        rol = getattr(getattr(request.user, 'perfil', None), 'rol', '')
        if rol not in ('director', 'sistemas', 'administrador'):
            return Response({'error': 'Sin permiso.'}, status=403)

        rep_id = request.data.get('representante_id')
        password = request.data.get('password')

        try:
            from secretaria.models import Representante
            rep = Representante.objects.get(id=rep_id)
        except Representante.DoesNotExist:
            return Response({'error': 'Representante no encontrado.'}, status=404)

        # Verificar si ya tiene acceso
        if RepresentanteUser.objects.filter(representante=rep).exists():
            ru = RepresentanteUser.objects.get(representante=rep)
            ru.esta_activo = True
            ru.save()
            # Si se envió password explícita, actualizarla (caso "restablecer contraseña")
            if password:
                ru.user.set_password(password)
                ru.user.save(update_fields=['password'])
                ru.debe_cambiar_password = True
                ru.save(update_fields=['debe_cambiar_password'])
                return Response({'mensaje': 'Contraseña restablecida y acceso reactivado.', 'cedula': rep.cedula})
            return Response({'mensaje': 'Acceso al portal reactivado.', 'cedula': rep.cedula})

        # Crear user Django + RepresentanteUser
        from django.contrib.auth import get_user_model
        User = get_user_model()

        # Username = cédula. SEGURIDAD: la cédula es información cuasi-pública
        # (aparece en facturas/recibos), así que NO se usa como contraseña por
        # defecto — se genera una contraseña aleatoria de un solo uso si no se
        # especifica una explícita.
        username = rep.cedula
        pwd = password or secrets.token_urlsafe(9)

        if User.objects.filter(username=username).exists():
            user = User.objects.get(username=username)
        else:
            user = User.objects.create_user(
                username=username,
                password=pwd,
                email=rep.correo,
                first_name=rep.nombre,
                last_name=rep.apellido,
            )

        RepresentanteUser.objects.create(
            representante=rep, user=user, debe_cambiar_password=True
        )

        # SEGURIDAD: el signal create_perfil_usuario asigna rol 'cajero' por
        # defecto; el usuario del portal no debe tener acceso al panel admin.
        from .models import asignar_rol_portal
        asignar_rol_portal(user)

        return Response({
            'mensaje': 'Acceso al portal activado correctamente.',
            'cedula': rep.cedula,
            'contrasena_inicial': pwd,
            'nota': 'Comunique al representante que debe cambiar su contraseña al primer ingreso.'
        }, status=201)

    def delete(self, request, representante_id):
        """Desactiva el acceso al portal de un representante."""
        rol = getattr(getattr(request.user, 'perfil', None), 'rol', '')
        if rol not in ('director', 'sistemas', 'administrador'):
            return Response({'error': 'Sin permiso.'}, status=403)
        try:
            from secretaria.models import Representante
            rep = Representante.objects.get(id=representante_id)
            ru = RepresentanteUser.objects.get(representante=rep)
            ru.esta_activo = False
            ru.save()
            return Response({'mensaje': 'Acceso al portal desactivado.'})
        except (Representante.DoesNotExist, RepresentanteUser.DoesNotExist):
            return Response({'error': 'No encontrado.'}, status=404)


# ──────────────────────────────────────────────────────────────────────────────
# PROBLEMA 4 — DATOS BANCARIOS DEL COLEGIO PARA EL PORTAL
# ──────────────────────────────────────────────────────────────────────────────

class PortalBancosView(APIView):
    """
    Lista los bancos activos del colegio para que el representante
    sepa a dónde transferir su pago.
    Autenticado con PortalJWTAuthentication (JWT del portal).
    """
    authentication_classes = [PortalJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from django.core.cache import cache
        from cobranza.models import BancoInstitucional
        from cobranza.signals import CACHE_KEY_BANCOS_ACTIVOS

        cache_key = f'{CACHE_KEY_BANCOS_ACTIVOS}_portal'
        data = cache.get(cache_key)
        if data is None:
            bancos = BancoInstitucional.objects.filter(activo=True).values(
                'id', 'nombre', 'numero_cuenta', 'tipo'
            )
            data = list(bancos)
            cache.set(cache_key, data, timeout=300)
        return Response(data)


# ──────────────────────────────────────────────────────────────────────────────
# ADMIN — GESTIÓN DE COMPROBANTES PENDIENTES
# ──────────────────────────────────────────────────────────────────────────────

class AdminComprobantesView(APIView):
    """
    Vista para el panel administrativo: lista y gestiona comprobantes pendientes.
    Solo roles: director, sistemas, administrador, cobranza.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        rol = getattr(getattr(request.user, 'perfil', None), 'rol', '')
        if rol not in ('director', 'sistemas', 'administrador', 'cobranza'):
            return Response({'error': 'Sin permiso.'}, status=403)

        estatus = request.query_params.get('estatus', 'pendiente')
        comprobantes = ComprobantePago.objects.filter(
            estatus=estatus
        ).select_related(
            'mensualidad__alumno__representante'
        ).order_by('-fecha_subida')

        data = []
        for c in comprobantes:
            alumno = c.mensualidad.alumno
            rep = alumno.representante
            data.append({
                'id': c.id,
                'fecha_subida': c.fecha_subida,
                'estatus': c.estatus,
                'observaciones': c.observaciones,
                # Ruta protegida (pagos_comunes.media_views.ComprobanteProtegidoView)
                # en vez de la URL directa de /media/ — esa última no tiene control
                # de acceso real si nginx la sirve estático en producción.
                'archivo_url': (
                    request.build_absolute_uri(
                        f'/media-protegido/comprobantes/{os.path.basename(c.archivo.name)}/'
                    ) if c.archivo else None
                ),
                'alumno': f'{alumno.nombre} {alumno.apellido}',
                'grado': alumno.grado_seccion,
                'representante': f'{rep.nombre} {rep.apellido}',
                'representante_cedula': rep.cedula,
                'mensualidad': f'{c.mensualidad.get_mes_display()} {c.mensualidad.anio}',
                'monto_usd': str(c.mensualidad.monto_usd),
            })

        return Response(data)

    def patch(self, request, comprobante_id):
        """
        Aprobar o rechazar un comprobante.
        Al APROBAR:
        - Marca la mensualidad como pagada.
        - Crea un registro Pago vinculado (para auditoría y coherencia del sistema).
        - Advierte si la referencia ya existe en otro Pago confirmado (alerta de fraude).
        """
        rol = getattr(getattr(request.user, 'perfil', None), 'rol', '')
        if rol not in ('director', 'sistemas', 'administrador', 'cobranza'):
            return Response({'error': 'Sin permiso.'}, status=403)

        nuevo_estatus = request.data.get('estatus')
        observaciones = request.data.get('observaciones', '')

        if nuevo_estatus not in ('aprobado', 'rechazado'):
            return Response({'error': "estatus debe ser 'aprobado' o 'rechazado'."}, status=400)

        advertencias = []
        mensualidad = None
        pago_creado = None

        # Todo lo que toca dinero (mensualidad.pagado, Pago, sincronizar_estatus_alumno)
        # vive dentro de este atomic() SIN try/except que lo trague: si algo falla
        # a mitad de camino, la transacción completa hace rollback (el comprobante
        # vuelve a 'pendiente' tal como estaba) en vez de quedar aprobado a medias
        # sin registro contable de respaldo.
        try:
            with transaction.atomic():
                # select_for_update() bloquea la fila hasta el commit; combinado con
                # el re-chequeo de estatus de abajo, evita que dos aprobaciones
                # concurrentes del mismo comprobante (doble clic, dos admins) generen
                # doble acreditación.
                try:
                    comprobante = ComprobantePago.objects.select_for_update().select_related(
                        'mensualidad__alumno'
                    ).get(id=comprobante_id)
                except ComprobantePago.DoesNotExist:
                    return Response({'error': 'Comprobante no encontrado.'}, status=404)

                if comprobante.estatus != 'pendiente':
                    return Response(
                        {'error': f'Este comprobante ya fue procesado (estatus actual: {comprobante.estatus}).'},
                        status=409
                    )

                comprobante.estatus = nuevo_estatus
                comprobante.observaciones = observaciones
                comprobante.save()

                if nuevo_estatus == 'aprobado':
                    mensualidad = comprobante.mensualidad
                    alumno = mensualidad.alumno

                    # --- ANTIFRAUDE: verificar referencia antes de aprobar ---
                    # Filtra por la misma clave compuesta (referencia, metodo_pago,
                    # banco_receptor) que el resto del sistema: método/banco distinto
                    # ya no es la misma transacción. Cuando este comprobante no
                    # trae banco, la alerta queda redactada como sospecha a
                    # verificar (no como certeza) y compara contra otros registros
                    # que tampoco tienen banco.
                    referencia = comprobante.referencia_bancaria
                    if referencia:
                        dup_pago_qs = Pago.objects.filter(
                            referencia=referencia,
                            metodo_pago=comprobante.metodo_pago,
                            estatus__in=['completado', 'en_revision'],
                        )
                        dup_pago_qs = (
                            dup_pago_qs.filter(banco_receptor_id=comprobante.banco_receptor_id)
                            if comprobante.banco_receptor_id
                            else dup_pago_qs.filter(banco_receptor__isnull=True)
                        )
                        dup_pago = dup_pago_qs.first()
                        if dup_pago:
                            if comprobante.banco_receptor_id:
                                advertencias.append(
                                    f"ALERTA DE FRAUDE: La referencia '{referencia}' ya existe "
                                    f"en el pago #{dup_pago.pk} (factura {dup_pago.factura_id or 'N/A'}, "
                                    f"alumno: {dup_pago.alumno.nombre} {dup_pago.alumno.apellido}). "
                                    "Verifique la autenticidad antes de completar la aprobación."
                                )
                            else:
                                advertencias.append(
                                    f"AVISO: La referencia '{referencia}' (sin banco receptor indicado) "
                                    f"coincide con el pago #{dup_pago.pk} (factura {dup_pago.factura_id or 'N/A'}, "
                                    f"alumno: {dup_pago.alumno.nombre} {dup_pago.alumno.apellido}). "
                                    "Verifique manualmente antes de completar la aprobación: sin banco "
                                    "confirmado, esta coincidencia es solo una sospecha a revisar."
                                )

                        dup_comp_qs = ComprobantePago.objects.filter(
                            referencia_bancaria=referencia,
                            metodo_pago=comprobante.metodo_pago,
                            estatus='aprobado',
                        ).exclude(pk=comprobante.pk)
                        dup_comp_qs = (
                            dup_comp_qs.filter(banco_receptor_id=comprobante.banco_receptor_id)
                            if comprobante.banco_receptor_id
                            else dup_comp_qs.filter(banco_receptor__isnull=True)
                        )
                        dup_comp = dup_comp_qs.first()
                        if dup_comp:
                            if comprobante.banco_receptor_id:
                                advertencias.append(
                                    f"ALERTA: La referencia '{referencia}' ya fue aprobada en el "
                                    f"comprobante #{dup_comp.pk} "
                                    f"({dup_comp.mensualidad.get_mes_display()} {dup_comp.mensualidad.anio}). "
                                    "Posible intento de doble cobro."
                                )
                            else:
                                advertencias.append(
                                    f"AVISO: La referencia '{referencia}' (sin banco receptor indicado) "
                                    f"coincide con el comprobante ya aprobado #{dup_comp.pk} "
                                    f"({dup_comp.mensualidad.get_mes_display()} {dup_comp.mensualidad.anio}). "
                                    "Verifique manualmente: sin banco confirmado, es solo una sospecha a revisar."
                                )

                    # Hash duplicado (mismo archivo aprobado antes)
                    if comprobante.hash_archivo:
                        dup_hash = ComprobantePago.objects.filter(
                            hash_archivo=comprobante.hash_archivo,
                            estatus='aprobado',
                        ).exclude(pk=comprobante.pk).first()
                        if dup_hash:
                            advertencias.append(
                                f"ALERTA: El archivo de este comprobante es idéntico al del "
                                f"comprobante #{dup_hash.pk} que ya fue aprobado "
                                f"({dup_hash.mensualidad.get_mes_display()} {dup_hash.mensualidad.anio}). "
                                "Podría ser el mismo documento presentado dos veces."
                            )

                    if not mensualidad.pagado:
                        from django.utils import timezone
                        mensualidad.pagado = True
                        mensualidad.fecha_pago = timezone.now()
                        mensualidad.save()

                    # Crear registro Pago para mantener coherencia de auditoría.
                    # Si algo de esto falla, la excepción sale del atomic() y
                    # revierte TODO (comprobante, mensualidad.pagado incluidos).
                    from cobranza.models import TasaCambio
                    tasa = TasaCambio.objects.order_by('-fecha').first()
                    tasa_valor = tasa.valor_bs if tasa else 1

                    pago_creado = Pago.objects.create(
                        alumno=alumno,
                        usuario_receptor=request.user,
                        metodo_pago=comprobante.metodo_pago or 'transferencia',
                        banco_receptor=comprobante.banco_receptor,
                        concepto='mensualidad',
                        monto_usd=mensualidad.monto_usd,
                        tasa_aplicada=tasa_valor,
                        monto_ves=mensualidad.monto_usd * tasa_valor,
                        referencia=referencia or f'COMP-{comprobante.id}',
                        observaciones=(
                            f'Pago aprobado desde comprobante del portal #{comprobante.id}'
                        ),
                        estatus='completado',
                    )
                    mensualidad.pagos.add(pago_creado)
                    # Recalcular con el criterio canónico: aprobar un comprobante
                    # de un mes no implica solvencia si debe meses anteriores.
                    from cobranza.mora import sincronizar_estatus_alumno
                    sincronizar_estatus_alumno(alumno)
        except Exception as exc:
            logger.error(
                'Error al %s comprobante #%s — se revirtió la operación completa: %s',
                nuevo_estatus, comprobante_id, exc
            )
            return Response(
                {'error': 'No se pudo procesar el comprobante. Intente nuevamente o contacte a sistemas.'},
                status=500
            )

        # Notificación al representante: best-effort, DELIBERADAMENTE fuera de la
        # transacción de dinero. Si Celery/Redis está caído, el pago ya quedó
        # confirmado en BD y no debe revertirse solo porque no se pudo encolar
        # el aviso — se registra el fallo para revisión manual.
        if nuevo_estatus == 'aprobado' and pago_creado:
            try:
                from notificaciones.tasks import task_notificar_pago_exitoso
                task_notificar_pago_exitoso.delay(mensualidad.id, pago_creado.id)
            except Exception as exc:
                logger.error(
                    'Comprobante #%s aprobado (Pago #%s creado) pero falló el encolado de '
                    'la notificación al representante: %s',
                    comprobante_id, pago_creado.id, exc
                )

        logger.info(
            'Comprobante %s marcado como %s por %s. Advertencias: %s',
            comprobante_id, nuevo_estatus, request.user.username,
            len(advertencias),
        )

        respuesta = {'mensaje': f'Comprobante {nuevo_estatus} correctamente.'}
        if advertencias:
            respuesta['advertencias'] = advertencias
        return Response(respuesta)


# ──────────────────────────────────────────────────────────────────────────────
# VERIFICACIÓN DE REFERENCIA BANCARIA (uso admin y cajero)
# ──────────────────────────────────────────────────────────────────────────────

class VerificarReferenciaView(APIView):
    """
    GET /api/portal/verificar-referencia/?ref=XXXXXX
    Comprueba si una referencia bancaria ya existe en el sistema
    (en Pago completado/en_revision o en ComprobantePago pendiente/aprobado).
    Util para que el cajero o el administrador valide una referencia
    antes de registrar o aprobar un pago.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        ref_raw = (request.query_params.get('ref') or '').strip()
        if not ref_raw:
            return Response(
                {'error': 'El parámetro ref es requerido.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        ref = ' '.join(ref_raw.upper().split())
        metodo_raw = (request.query_params.get('metodo') or '').strip().lower()
        banco_id_raw = (request.query_params.get('banco_id') or '').strip()

        resultado = {
            'referencia': ref,
            'existe': False,
            'coincidencias': [],
        }

        pagos = Pago.objects.filter(
            referencia=ref,
            estatus__in=['completado', 'en_revision'],
        ).select_related('alumno')
        if metodo_raw:
            pagos = pagos.filter(metodo_pago=metodo_raw)
        if banco_id_raw:
            pagos = pagos.filter(banco_receptor_id=banco_id_raw)
        for p in pagos:
            resultado['coincidencias'].append({
                'fuente': 'pago_registrado',
                'id': p.pk,
                'factura_id': p.factura_id,
                'estatus': p.estatus,
                'alumno': f'{p.alumno.nombre} {p.alumno.apellido}',
                'monto_usd': str(p.monto_usd),
                'fecha': p.fecha_pago,
            })

        comprobantes = ComprobantePago.objects.filter(
            referencia_bancaria=ref,
            estatus__in=['pendiente', 'aprobado'],
        ).select_related('mensualidad__alumno')
        if metodo_raw:
            comprobantes = comprobantes.filter(metodo_pago=metodo_raw)
        if banco_id_raw:
            comprobantes = comprobantes.filter(banco_receptor_id=banco_id_raw)
        for c in comprobantes:
            alumno = c.mensualidad.alumno
            resultado['coincidencias'].append({
                'fuente': 'comprobante_portal',
                'id': c.pk,
                'estatus': c.estatus,
                'alumno': f'{alumno.nombre} {alumno.apellido}',
                'mensualidad': f'{c.mensualidad.get_mes_display()} {c.mensualidad.anio}',
                'fecha': c.fecha_subida,
            })

        resultado['existe'] = len(resultado['coincidencias']) > 0
        return Response(resultado)


# ──────────────────────────────────────────────────────────────────────────────
# CONFIGURACIÓN VISUAL PÚBLICA DEL COLEGIO
# ──────────────────────────────────────────────────────────────────────────────

class ConfiguracionColegioPublicaView(APIView):
    """
    Retorna la configuración visual pública del colegio:
    nombre, colores, logo. No requiere autenticación (se usa al cargar el portal).
    """
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request):
        from django.conf import settings
        from django.core.cache import cache
        from secretaria.signals import CACHE_KEY_CONFIG_COLEGIO_PUBLICA

        data = cache.get(CACHE_KEY_CONFIG_COLEGIO_PUBLICA)
        if data is None:
            from secretaria.models import ConfiguracionSistema
            config = ConfiguracionSistema.objects.first()
            if not config:
                data = {
                    'nombre_colegio': 'Mi Colegio',
                    'color_primario': '#0fa3b1',
                    'color_secundario': '#1f3864',
                    'logo_url': '',
                    'titulo_web': '',
                    'descripcion_web': '',
                    'favicon_url': '',
                }
            else:
                # logo_url (URL externa) tiene prioridad si está configurada;
                # si no, cae a logo_colegio (imagen subida — hoy usada para
                # recibos de pago, pero es el logo real del colegio en la
                # práctica: la mayoría de los colegios lo cargan ahí y dejan
                # logo_url vacío, así que sin este fallback esta vista nunca
                # devolvía el logo real de esos colegios).
                logo = config.logo_url or (config.logo_colegio.url if config.logo_colegio else '')
                favicon = config.favicon_url or (config.favicon.url if config.favicon else '')
                data = {
                    'nombre_colegio': config.nombre_colegio or 'Mi Colegio',
                    'color_primario': config.color_primario or '#0fa3b1',
                    'color_secundario': config.color_secundario or '#1f3864',
                    'logo_url': logo,
                    'titulo_web': config.titulo_web or '',
                    'descripcion_web': config.descripcion_web or '',
                    'favicon_url': favicon,
                }
            # TTL de 5 min como red de seguridad además de la invalidación por
            # señal (secretaria/signals.py), por si corre con varios workers.
            cache.set(CACHE_KEY_CONFIG_COLEGIO_PUBLICA, data, timeout=300)

        # No se cachea junto al resto: es una constante de settings (no de BD),
        # así que se agrega en cada respuesta sin depender de la invalidación
        # del cache de configuración visual.
        return Response({**data, 'vapid_public_key': settings.VAPID_PUBLIC_KEY})


# ──────────────────────────────────────────────────────────────────────────────
# CAMBIO DE CONTRASEÑA DEL REPRESENTANTE
# ──────────────────────────────────────────────────────────────────────────────

class CambiarContrasenaPortalView(APIView):
    """
    Permite al representante autenticado cambiar su propia contraseña.
    Requiere la contraseña actual para verificar identidad.
    """
    authentication_classes = [PortalJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        contrasena_actual = request.data.get('contrasena_actual', '')
        contrasena_nueva  = request.data.get('contrasena_nueva', '')
        confirmar         = request.data.get('confirmar', '')

        if not contrasena_actual or not contrasena_nueva:
            return Response(
                {'error': 'Se requieren contrasena_actual y contrasena_nueva.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if contrasena_nueva != confirmar:
            return Response(
                {'error': 'La nueva contraseña y la confirmación no coinciden.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if len(contrasena_nueva) < 8:
            return Response(
                {'error': 'La contraseña debe tener al menos 8 caracteres.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        user = request.user
        if not user.check_password(contrasena_actual):
            return Response(
                {'error': 'La contraseña actual es incorrecta.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        user.set_password(contrasena_nueva)
        user.save()

        rep_user = request.user.representante_portal
        if rep_user.debe_cambiar_password:
            rep_user.debe_cambiar_password = False
            rep_user.save(update_fields=['debe_cambiar_password'])

        representante = _get_representante(request)
        logger.info(f'Representante {representante.cedula} cambió su contraseña del portal.')

        return Response({'mensaje': 'Contraseña actualizada exitosamente.'})


# ──────────────────────────────────────────────────────────────────────────────
# MI PERFIL (representante autenticado)
# ──────────────────────────────────────────────────────────────────────────────

class PortalMiPerfilView(APIView):
    """
    GET   /api/portal/mi-perfil/ — perfil del representante autenticado.
    PATCH /api/portal/mi-perfil/ — edita first_name/last_name/email (User) y
    telefono (Representante). username, cedula y foto no se editan aquí
    (la foto tiene endpoint propio: PortalFotoPerfilView).
    """
    authentication_classes = [PortalJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]
    CAMPOS_USER = ('first_name', 'last_name', 'email')

    def get(self, request):
        return Response(PortalPerfilSerializer(request.user).data)

    def patch(self, request):
        for campo in self.CAMPOS_USER:
            if campo in request.data:
                setattr(request.user, campo, request.data[campo])
        request.user.save(update_fields=list(self.CAMPOS_USER))

        if 'telefono' in request.data:
            representante = _get_representante(request)
            representante.telefono = request.data['telefono']
            representante.save(update_fields=['telefono'])

        return Response(PortalPerfilSerializer(request.user).data)


class PortalFotoPerfilView(APIView):
    """
    POST /api/portal/mi-perfil/foto/ (multipart, campo 'foto')
    Reemplaza la foto de perfil del representante autenticado.
    """
    authentication_classes = [PortalJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not request.data.get('foto'):
            return Response({'error': "Debes adjuntar un archivo en el campo 'foto'."}, status=status.HTTP_400_BAD_REQUEST)

        perfil = request.user.perfil
        serializer = PerfilFotoSerializer(perfil, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(PortalPerfilSerializer(request.user).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
