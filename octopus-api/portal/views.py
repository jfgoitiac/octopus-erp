import hashlib
import logging
from collections import defaultdict
from datetime import date

from django.db import transaction

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

# Métodos de pago del portal que REQUIEREN número de referencia bancaria.
# Stripe y efectivo generan su propio identificador automáticamente.
_METODOS_CON_REFERENCIA_OBLIGATORIA = {
    'transferencia', 'pago_movil', 'punto_de_venta', 'zelle',
}

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
    authentication_classes = []  # login: no debe evaluar tokens previos del header
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
        alumnos = list(Alumno.objects.filter(
            representante=representante, activo=True
        ))

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

        # Calcular resumen financiero consolidado de todos los alumnos
        total_deuda_usd = 0
        mensualidades_vencidas = []
        proximos_vencimientos = []

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

        mensualidad_id  = request.data.get('mensualidad_id')
        archivo         = request.FILES.get('archivo')
        referencia_raw  = (request.data.get('referencia_bancaria') or '').strip()
        metodo_pago     = (request.data.get('metodo_pago') or 'transferencia').strip().lower()

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

        # --- ANTIFRAUDE 1: referencia obligatoria para métodos bancarios ---
        if metodo_pago in _METODOS_CON_REFERENCIA_OBLIGATORIA and not referencia_raw:
            return Response(
                {'error': 'Debe ingresar el número de referencia o confirmación de la transacción.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Normalizar referencia (mayúsculas, sin espacios dobles)
        referencia = ' '.join(referencia_raw.upper().split()) if referencia_raw else None

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
        # Verificación adicional por magic bytes para imágenes
        if content_type.startswith('image/'):
            archivo.seek(0)
            header = archivo.read(12)
            archivo.seek(0)
            es_jpeg = header[:3] == b'\xff\xd8\xff'
            es_png  = header[:8] == b'\x89PNG\r\n\x1a\n'
            es_gif  = header[:6] in (b'GIF87a', b'GIF89a')
            es_webp = header[:4] == b'RIFF' and header[8:12] == b'WEBP'
            if not (es_jpeg or es_png or es_gif or es_webp):
                return Response(
                    {'error': 'El contenido del archivo no corresponde a una imagen valida.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

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
        if referencia:
            dup_comprobante = ComprobantePago.objects.filter(
                referencia_bancaria=referencia,
                estatus__in=['pendiente', 'aprobado'],
            ).exclude(mensualidad=mensualidad).first()
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

            dup_pago = Pago.objects.filter(
                referencia=referencia,
                estatus__in=['completado', 'en_revision'],
            ).first()
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

        # Obtener IP del cliente
        ip_cliente = (
            request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()
            or request.META.get('REMOTE_ADDR', '')
        )

        comprobante = ComprobantePago.objects.create(
            mensualidad=mensualidad,
            archivo=archivo,
            referencia_bancaria=referencia,
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
                return Response({'mensaje': 'Contraseña restablecida y acceso reactivado.', 'cedula': rep.cedula})
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

        try:
            comprobante = ComprobantePago.objects.select_related(
                'mensualidad__alumno'
            ).get(id=comprobante_id)
        except ComprobantePago.DoesNotExist:
            return Response({'error': 'Comprobante no encontrado.'}, status=404)

        advertencias = []

        with transaction.atomic():
            comprobante.estatus = nuevo_estatus
            comprobante.observaciones = observaciones
            comprobante.save()

            if nuevo_estatus == 'aprobado':
                mensualidad = comprobante.mensualidad
                alumno = mensualidad.alumno

                # --- ANTIFRAUDE: verificar referencia antes de aprobar ---
                referencia = comprobante.referencia_bancaria
                if referencia:
                    dup_pago = Pago.objects.filter(
                        referencia=referencia,
                        estatus__in=['completado', 'en_revision'],
                    ).exclude(
                        # Excluir el pago que se crea en esta misma aprobación (no existe aún)
                        pk__isnull=True
                    ).first()
                    if dup_pago:
                        advertencias.append(
                            f"ALERTA DE FRAUDE: La referencia '{referencia}' ya existe "
                            f"en el pago #{dup_pago.pk} (factura {dup_pago.factura_id or 'N/A'}, "
                            f"alumno: {dup_pago.alumno.nombre} {dup_pago.alumno.apellido}). "
                            "Verifique la autenticidad antes de completar la aprobación."
                        )

                    dup_comp = ComprobantePago.objects.filter(
                        referencia_bancaria=referencia,
                        estatus='aprobado',
                    ).exclude(pk=comprobante.pk).first()
                    if dup_comp:
                        advertencias.append(
                            f"ALERTA: La referencia '{referencia}' ya fue aprobada en el "
                            f"comprobante #{dup_comp.pk} "
                            f"({dup_comp.mensualidad.get_mes_display()} {dup_comp.mensualidad.anio}). "
                            "Posible intento de doble cobro."
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

                # Crear registro Pago para mantener coherencia de auditoría
                try:
                    from cobranza.models import TasaCambio
                    tasa = TasaCambio.objects.order_by('-fecha').first()
                    tasa_valor = tasa.valor_bs if tasa else 1

                    pago_creado = Pago.objects.create(
                        alumno=alumno,
                        usuario_receptor=request.user,
                        metodo_pago='transferencia',
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
                    alumno.estatus_financiero = 'solvente'
                    alumno.save(update_fields=['estatus_financiero'])
                except Exception as exc:
                    logger.error(
                        'No se pudo crear Pago al aprobar comprobante #%s: %s',
                        comprobante.id, exc
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

        resultado = {
            'referencia': ref,
            'existe': False,
            'coincidencias': [],
        }

        pagos = Pago.objects.filter(
            referencia=ref,
            estatus__in=['completado', 'en_revision'],
        ).select_related('alumno')
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
        from django.core.cache import cache
        from secretaria.signals import CACHE_KEY_CONFIG_COLEGIO_PUBLICA

        data = cache.get(CACHE_KEY_CONFIG_COLEGIO_PUBLICA)
        if data is not None:
            return Response(data)

        from secretaria.models import ConfiguracionSistema
        config = ConfiguracionSistema.objects.first()
        if not config:
            data = {
                'nombre_colegio': 'Mi Colegio',
                'color_primario': '#0fa3b1',
                'color_secundario': '#1f3864',
                'logo_url': '',
            }
        else:
            data = {
                'nombre_colegio': config.nombre_colegio or 'Mi Colegio',
                'color_primario': config.color_primario or '#0fa3b1',
                'color_secundario': config.color_secundario or '#1f3864',
                'logo_url': config.logo_url or '',
            }
        # TTL de 5 min como red de seguridad además de la invalidación por
        # señal (secretaria/signals.py), por si corre con varios workers.
        cache.set(CACHE_KEY_CONFIG_COLEGIO_PUBLICA, data, timeout=300)
        return Response(data)


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
