import logging
from datetime import date

from django.db.models import Q

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework.throttling import AnonRateThrottle

from secretaria.models import Alumno
from cobranza.models import Mensualidad, Pago

from .authentication import PortalJWTAuthentication
from .models import ComprobantePago, RepresentanteUser
from .serializers import (
    AlumnoDashboardSerializer,
    ComprobantePagoSerializer,
    MensualidadSerializer,
    PagoHistorialSerializer,
    PortalTokenSerializer,
)

# ──────────────────────────────────────────────────────────────────────────────
# THROTTLE: limita intentos de login a 5 por minuto por IP
# ──────────────────────────────────────────────────────────────────────────────

class PortalLoginThrottle(AnonRateThrottle):
    rate = '5/min'
    scope = 'portal_login'

# Tamaño máximo de comprobante: 10 MB
_COMPROBANTE_MAX_BYTES = 10 * 1024 * 1024

# MIME types permitidos para comprobantes, mapeados a extensiones válidas
_MIME_PERMITIDOS = {
    'jpeg': ['.jpg', '.jpeg'],
    'png':  ['.png'],
    'webp': ['.webp'],
    # PDF no tiene firma detectada por imghdr; se valida por extensión + content_type
}
_CONTENT_TYPES_PERMITIDOS = {
    'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
}

logger = logging.getLogger(__name__)


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
    throttle_classes = [PortalLoginThrottle]

    def post(self, request):
        serializer = PortalTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        tokens = serializer.validated_data['tokens']
        representante = serializer.validated_data['representante']

        return Response({
            'access': tokens['access'],
            'refresh': tokens['refresh'],
            'representante_id': representante.id,
            'nombre': representante.nombre,
            'apellido': representante.apellido,
            'cedula': representante.cedula,
        }, status=status.HTTP_200_OK)


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
        representante = _get_representante(request)
        alumnos = Alumno.objects.filter(
            representante=representante, activo=True
        )

        hoy = date.today()

        # Calcular resumen financiero consolidado de todos los alumnos
        total_deuda_usd = 0
        mensualidades_vencidas = []
        proximos_vencimientos = []

        for alumno in alumnos:
            # Mensualidades no pagadas y ya vencidas (mes <= mes actual)
            vencidas = Mensualidad.objects.filter(
                alumno=alumno,
                pagado=False,
            ).filter(
                Q(anio__lt=hoy.year) |
                Q(anio=hoy.year, mes__lte=hoy.month)
            )

            # Próximos 2 meses sin pagar
            futuras = Mensualidad.objects.filter(
                alumno=alumno,
                pagado=False,
            ).filter(
                Q(anio__gt=hoy.year) |
                Q(anio=hoy.year, mes__gt=hoy.month)
            ).order_by('anio', 'mes')[:2]

            vencidas_data = MensualidadSerializer(vencidas, many=True).data
            futuras_data = MensualidadSerializer(futuras, many=True).data

            # Acumular datos enriquecidos con nombre del alumno
            alumno_nombre = f"{alumno.nombre} {alumno.apellido}"
            for item in vencidas_data:
                item['alumno_nombre'] = alumno_nombre
                item['alumno_id'] = alumno.id
                total_deuda_usd += float(item['monto_usd'])
            for item in futuras_data:
                item['alumno_nombre'] = alumno_nombre
                item['alumno_id'] = alumno.id

            mensualidades_vencidas.extend(vencidas_data)
            proximos_vencimientos.extend(futuras_data)

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

        pagos_qs = Pago.objects.filter(alumno=alumno).order_by('-fecha_pago')
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

        mensualidad_id = request.data.get('mensualidad_id')
        archivo = request.FILES.get('archivo')

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

        # Verificar que la mensualidad corresponde a un alumno del representante
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

        # Validar tamaño del archivo (máx. 10 MB)
        if archivo.size > _COMPROBANTE_MAX_BYTES:
            return Response(
                {'error': 'El archivo supera el tamaño máximo permitido (10 MB).'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validar extensión del archivo
        nombre_archivo = archivo.name.lower()
        extensiones_validas = ['.jpg', '.jpeg', '.png', '.pdf', '.webp']
        if not any(nombre_archivo.endswith(ext) for ext in extensiones_validas):
            return Response(
                {'error': 'Formato no permitido. Use JPG, PNG, PDF o WEBP.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validar tipo MIME real del contenido (evita extension spoofing)
        content_type = getattr(archivo, 'content_type', '')
        if content_type not in _CONTENT_TYPES_PERMITIDOS:
            return Response(
                {'error': 'El tipo de contenido del archivo no es valido.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        # Verificacion adicional por magic bytes para imagenes
        if content_type.startswith('image/'):
            archivo.seek(0)
            header = archivo.read(12)
            archivo.seek(0)
            es_jpeg = header[:3] == b'\xff\xd8\xff'
            es_png = header[:8] == b'\x89PNG\r\n\x1a\n'
            es_gif = header[:6] in (b'GIF87a', b'GIF89a')
            es_webp = header[:4] == b'RIFF' and header[8:12] == b'WEBP'
            if not (es_jpeg or es_png or es_gif or es_webp):
                return Response(
                    {'error': 'El contenido del archivo no corresponde a una imagen valida.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Obtener IP del cliente
        ip_cliente = (
            request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()
            or request.META.get('REMOTE_ADDR', '')
        )

        comprobante = ComprobantePago.objects.create(
            mensualidad=mensualidad,
            archivo=archivo,
            subido_por_ip=ip_cliente,
        )

        # Notificar al equipo de cobranza de forma asíncrona
        try:
            from .tasks import notificar_comprobante_subido
            notificar_comprobante_subido.delay(comprobante.id)
        except Exception as e:
            logger.warning(f'No se pudo encolar notificación de comprobante: {e}')

        logger.info(
            "Comprobante #%s subido por representante %s para mensualidad %s",
            comprobante.id, representante.cedula, mensualidad_id
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
            return Response({'mensaje': 'Acceso al portal reactivado.', 'cedula': rep.cedula})

        # Crear user Django + RepresentanteUser
        from django.contrib.auth import get_user_model
        User = get_user_model()

        # Username = cédula, password = cédula si no se especifica
        username = rep.cedula
        pwd = password or rep.cedula

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

        RepresentanteUser.objects.create(representante=rep, user=user)

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
        from cobranza.models import BancoInstitucional
        bancos = BancoInstitucional.objects.filter(activo=True).values(
            'id', 'nombre', 'numero_cuenta', 'tipo'
        )
        return Response(list(bancos))


# ──────────────────────────────────────────────────────────────────────────────
# STRIPE CHECKOUT
# ──────────────────────────────────────────────────────────────────────────────

class StripeCheckoutView(APIView):
    """Crea una Stripe Checkout Session para pagar una mensualidad."""
    authentication_classes = [PortalJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from django.conf import settings as dj_settings
        if not dj_settings.STRIPE_SECRET_KEY:
            return Response(
                {'error': 'Pagos en línea no están configurados. Contacte a la administración.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        mensualidad_id = request.data.get('mensualidad_id')
        if not mensualidad_id:
            return Response({'error': 'mensualidad_id es requerido.'}, status=status.HTTP_400_BAD_REQUEST)

        representante = _get_representante(request)
        try:
            mensualidad = Mensualidad.objects.select_related('alumno__representante').get(
                id=mensualidad_id,
                alumno__representante=representante,
                alumno__activo=True,
                pagado=False,
            )
        except Mensualidad.DoesNotExist:
            return Response({'error': 'Mensualidad no encontrada o ya pagada.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            import stripe
            stripe.api_key = dj_settings.STRIPE_SECRET_KEY
            alumno = mensualidad.alumno
            monto_centavos = int(float(mensualidad.monto_usd) * 100)
            frontend_url = getattr(dj_settings, 'FRONTEND_URL', 'http://localhost:5173')

            session = stripe.checkout.Session.create(
                payment_method_types=['card'],
                line_items=[{
                    'price_data': {
                        'currency': 'usd',
                        'product_data': {
                            'name': f'Mensualidad — {mensualidad.get_mes_display()} {mensualidad.anio}',
                            'description': f'{alumno.nombre} {alumno.apellido} · {alumno.grado_seccion or ""}',
                        },
                        'unit_amount': monto_centavos,
                    },
                    'quantity': 1,
                }],
                mode='payment',
                success_url=f'{frontend_url}/portal?pago=exitoso&session_id={{CHECKOUT_SESSION_ID}}',
                cancel_url=f'{frontend_url}/portal?pago=cancelado',
                metadata={
                    'mensualidad_id': str(mensualidad.id),
                    'representante_id': str(representante.id),
                    'alumno_id': str(alumno.id),
                },
                customer_email=representante.correo or None,
            )
            return Response({'checkout_url': session.url, 'session_id': session.id})
        except Exception as e:
            logger.error(f'Error Stripe checkout: {e}')
            return Response({'error': 'Error al crear sesión de pago.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class StripeWebhookView(APIView):
    """Recibe eventos de Stripe. Marca mensualidad como pagada al completar."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def post(self, request):
        from django.conf import settings as dj_settings
        import stripe

        payload = request.body
        sig_header = request.META.get('HTTP_STRIPE_SIGNATURE', '')

        if not dj_settings.STRIPE_WEBHOOK_SECRET:
            return Response({'error': 'Webhook no configurado.'}, status=400)

        try:
            stripe.api_key = dj_settings.STRIPE_SECRET_KEY
            event = stripe.Webhook.construct_event(payload, sig_header, dj_settings.STRIPE_WEBHOOK_SECRET)
        except (ValueError, stripe.error.SignatureVerificationError):
            return Response({'error': 'Firma inválida.'}, status=400)

        if event['type'] == 'checkout.session.completed':
            session_data = event['data']['object']
            mensualidad_id = session_data.get('metadata', {}).get('mensualidad_id')
            if mensualidad_id:
                try:
                    from django.utils import timezone
                    from cobranza.models import TasaCambio
                    from django.contrib.auth import get_user_model

                    mensualidad = Mensualidad.objects.select_related('alumno').get(
                        id=mensualidad_id, pagado=False
                    )
                    mensualidad.pagado = True
                    mensualidad.fecha_pago = timezone.now()
                    mensualidad.save(update_fields=['pagado', 'fecha_pago'])

                    tasa = TasaCambio.objects.order_by('-fecha').first()
                    tasa_valor = float(tasa.valor_bs) if tasa else 1.0
                    monto = float(mensualidad.monto_usd)

                    User = get_user_model()
                    sistema_user = User.objects.filter(is_superuser=True).first()

                    Pago.objects.create(
                        alumno=mensualidad.alumno,
                        usuario_receptor=sistema_user,
                        metodo_pago='stripe',
                        concepto='mensualidad',
                        monto_usd=monto,
                        tasa_aplicada=tasa_valor,
                        monto_ves=monto * tasa_valor,
                        referencia=session_data.get('payment_intent', f'stripe_{session_data["id"]}'),
                        observaciones=f'Pago online Stripe — Session: {session_data["id"]}',
                        estatus='completado',
                    )
                    logger.info(f'Pago Stripe procesado: mensualidad {mensualidad_id}')
                except Exception as e:
                    logger.error(f'Error procesando webhook Stripe: {e}')

        return Response({'status': 'ok'})


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
                'archivo_url': request.build_absolute_uri(c.archivo.url) if c.archivo else None,
                'alumno': f'{alumno.nombre} {alumno.apellido}',
                'grado': alumno.grado_seccion,
                'representante': f'{rep.nombre} {rep.apellido}',
                'representante_cedula': rep.cedula,
                'mensualidad': f'{c.mensualidad.get_mes_display()} {c.mensualidad.anio}',
                'monto_usd': str(c.mensualidad.monto_usd),
            })

        return Response(data)

    def patch(self, request, comprobante_id):
        """Aprobar o rechazar un comprobante."""
        rol = getattr(getattr(request.user, 'perfil', None), 'rol', '')
        if rol not in ('director', 'sistemas', 'administrador', 'cobranza'):
            return Response({'error': 'Sin permiso.'}, status=403)

        nuevo_estatus = request.data.get('estatus')
        observaciones = request.data.get('observaciones', '')

        if nuevo_estatus not in ('aprobado', 'rechazado'):
            return Response({'error': "estatus debe ser 'aprobado' o 'rechazado'."}, status=400)

        try:
            comprobante = ComprobantePago.objects.get(id=comprobante_id)
        except ComprobantePago.DoesNotExist:
            return Response({'error': 'Comprobante no encontrado.'}, status=404)

        comprobante.estatus = nuevo_estatus
        comprobante.observaciones = observaciones
        comprobante.save()

        # Si se aprueba, marcar la mensualidad como pagada
        if nuevo_estatus == 'aprobado':
            mensualidad = comprobante.mensualidad
            if not mensualidad.pagado:
                from django.utils import timezone
                mensualidad.pagado = True
                mensualidad.fecha_pago = timezone.now()
                mensualidad.save()

        logger.info(
            f'Comprobante {comprobante_id} marcado como {nuevo_estatus} '
            f'por {request.user.username}'
        )

        return Response({'mensaje': f'Comprobante {nuevo_estatus} correctamente.'})


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
        from secretaria.models import ConfiguracionSistema
        config = ConfiguracionSistema.objects.first()
        if not config:
            return Response({
                'nombre_colegio': 'Mi Colegio',
                'color_primario': '#0fa3b1',
                'color_secundario': '#1f3864',
                'logo_url': '',
            })
        return Response({
            'nombre_colegio': config.nombre_colegio or 'Mi Colegio',
            'color_primario': config.color_primario or '#0fa3b1',
            'color_secundario': config.color_secundario or '#1f3864',
            'logo_url': config.logo_url or '',
        })


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

        representante = _get_representante(request)
        logger.info(f'Representante {representante.cedula} cambió su contraseña del portal.')

        return Response({'mensaje': 'Contraseña actualizada exitosamente.'})
