import logging
from django.db import models, transaction
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from config.pagination import StandardResultsPagination
from portal.authentication import PortalJWTAuthentication
from portal.models import RepresentanteUser
from secretaria.models import Alumno

from .models import Circular, LecturaCircular, MensajeDirecto
from .serializers import (
    CircularPortalSerializer,
    CircularSerializer,
    LecturaCircularSerializer,
    MensajeDirectoPortalSerializer,
    MensajeDirectoSerializer,
)

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────
# PERMISO PERSONALIZADO
# ─────────────────────────────────────────────
class IsAdminOrAbove(permissions.BasePermission):
    """Permite acceso a director, sistemas y administrador. Mismo criterio que
    IsAdminOrAbove en academico/views.py — cada app define su propia copia
    (no hay un módulo de permisos compartido en este proyecto)."""

    ROLES_PERMITIDOS = ['director', 'sistemas', 'administrador']

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.is_superuser:
            return True
        try:
            return (
                request.user.perfil.esta_activo
                and request.user.perfil.rol in self.ROLES_PERMITIDOS
            )
        except Exception:
            return False


# ─────────────────────────────────────────────
# CIRCULARES — PANEL ADMIN
# ─────────────────────────────────────────────
class CircularListCreateView(generics.ListCreateAPIView):
    """
    GET: lista circulares paginada (cualquier usuario autenticado del panel).
    POST: publica una circular nueva. Roles permitidos: director, sistemas,
    administrador. Al publicar, se crea una LecturaCircular por cada
    RepresentanteUser activo (broadcast completo, sin segmentación) y se
    encola el envío de email.
    """
    queryset = Circular.objects.select_related('publicado_por').prefetch_related('lecturas')
    serializer_class = CircularSerializer
    pagination_class = StandardResultsPagination
    permission_classes = [permissions.IsAuthenticated]

    def create(self, request, *args, **kwargs):
        if not IsAdminOrAbove().has_permission(request, self):
            return Response(
                {'error': 'No tienes permisos para publicar circulares.'},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            circular = serializer.save(publicado_por=request.user)
            representantes_activos = RepresentanteUser.objects.filter(esta_activo=True)
            LecturaCircular.objects.bulk_create([
                LecturaCircular(circular=circular, usuario=ru) for ru in representantes_activos
            ])

        try:
            from notificaciones.tasks import task_notificar_circular_nueva
            task_notificar_circular_nueva.delay(circular.id)
        except Exception as e:
            logger.warning(f'No se pudo encolar el envío de email de la circular: {e}')

        return Response(self.get_serializer(circular).data, status=status.HTTP_201_CREATED)


class CircularDetailView(APIView):
    """GET de una circular puntual. Panel admin."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        try:
            circular = Circular.objects.select_related('publicado_por').get(pk=pk)
        except Circular.DoesNotExist:
            return Response({'error': 'Circular no encontrada.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(CircularSerializer(circular).data)


class CircularLecturasView(APIView):
    """GET — lista de representantes y su estado de lectura para una circular.
    Roles permitidos: director, sistemas, administrador."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        if not IsAdminOrAbove().has_permission(request, self):
            return Response(
                {'error': 'No tienes permisos para ver las lecturas de esta circular.'},
                status=status.HTTP_403_FORBIDDEN
            )
        try:
            circular = Circular.objects.get(pk=pk)
        except Circular.DoesNotExist:
            return Response({'error': 'Circular no encontrada.'}, status=status.HTTP_404_NOT_FOUND)

        lecturas = circular.lecturas.select_related('usuario__representante').order_by('-leido', 'usuario__representante__apellido')
        return Response(LecturaCircularSerializer(lecturas, many=True).data)


# ─────────────────────────────────────────────
# CIRCULARES — PORTAL DE REPRESENTANTES
# ─────────────────────────────────────────────
class CircularPortalListView(APIView):
    """GET — lista de circulares visibles para el representante autenticado,
    con su propio estado de lectura anotado."""
    authentication_classes = [PortalJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        rep_user = request.user.representante_portal
        lecturas_map = {
            l.circular_id: l
            for l in LecturaCircular.objects.filter(usuario=rep_user).select_related('circular')
        }
        circulares = Circular.objects.filter(id__in=lecturas_map.keys()).order_by('-fecha_publicacion')
        for circular in circulares:
            circular.lectura_actual = lecturas_map.get(circular.id)

        return Response(CircularPortalSerializer(circulares, many=True).data)


class ConfirmarLecturaView(APIView):
    """POST — marca la circular como leída por el representante autenticado."""
    authentication_classes = [PortalJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        rep_user = request.user.representante_portal
        try:
            lectura = LecturaCircular.objects.get(circular_id=pk, usuario=rep_user)
        except LecturaCircular.DoesNotExist:
            return Response(
                {'error': 'Esta circular no está disponible para tu cuenta.'},
                status=status.HTTP_404_NOT_FOUND
            )

        if not lectura.leido:
            lectura.leido = True
            lectura.fecha_lectura = timezone.now()
            lectura.save(update_fields=['leido', 'fecha_lectura'])

        return Response(LecturaCircularSerializer(lectura).data)


# ─────────────────────────────────────────────
# MENSAJE DIRECTO — PANEL ADMIN / DOCENTE
# ─────────────────────────────────────────────
def _get_rol(request):
    """Helper para obtener el rol del usuario autenticado. Copia local
    del mismo helper en academico/views.py -- cada app define su propia
    copia, no hay módulo de permisos compartido en este proyecto."""
    try:
        return request.user.perfil.rol
    except Exception:
        return None


def _docente_tiene_seccion(user, grado_seccion):
    """True si el docente tiene una Materia activa asignada en esa sección.
    Copia local del mismo helper en academico/views.py."""
    if not grado_seccion:
        return False
    from academico.models import Materia
    return Materia.objects.filter(
        docente=user, grado_seccion__iexact=grado_seccion, activa=True
    ).exists()


class MensajeDirectoListCreateView(APIView):
    """
    GET: bandeja del docente autenticado. ?alumno_id= filtra la conversación
    de un alumno puntual; sin filtro, lista todas las conversaciones donde
    participa. Roles permitidos: docente, secretaria+ (supervisión).
    POST: el docente inicia una conversación sobre un alumno de su sección.
    Body: {alumno_id, cuerpo, adjunto opcional}. Resuelve automáticamente el
    RepresentanteUser activo del alumno como destinatario.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        rol = _get_rol(request)
        if not (request.user.is_superuser or IsAdminOrAbove().has_permission(request, self) or rol == 'docente'):
            return Response({'error': 'No tienes permisos para ver mensajes.'}, status=status.HTTP_403_FORBIDDEN)

        qs = MensajeDirecto.objects.select_related(
            'alumno', 'remitente_docente', 'remitente_representante__representante'
        ).all()

        if rol == 'docente' and not IsAdminOrAbove().has_permission(request, self):
            qs = qs.filter(models.Q(remitente_docente=request.user) | models.Q(destinatario_docente=request.user))

        alumno_id = request.query_params.get('alumno_id')
        if alumno_id:
            qs = qs.filter(alumno_id=alumno_id)

        return Response(MensajeDirectoSerializer(qs, many=True, context={'request': request}).data)

    def post(self, request):
        if _get_rol(request) != 'docente':
            return Response({'error': 'Solo docentes pueden iniciar una conversación.'}, status=status.HTTP_403_FORBIDDEN)

        alumno_id = request.data.get('alumno_id')
        cuerpo = (request.data.get('cuerpo') or '').strip()
        if not cuerpo:
            return Response({'error': 'El mensaje no puede estar vacío.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            alumno = Alumno.objects.select_related('representante').get(pk=alumno_id)
        except (Alumno.DoesNotExist, TypeError, ValueError):
            return Response({'error': 'Alumno no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        if not _docente_tiene_seccion(request.user, alumno.grado_seccion):
            return Response(
                {'error': 'No tienes una materia asignada en la sección de este alumno.'},
                status=status.HTTP_403_FORBIDDEN
            )

        rep_user = getattr(alumno.representante, 'portal_user', None)
        if not rep_user or not rep_user.esta_activo:
            return Response(
                {'error': 'El representante de este alumno no tiene acceso activo al portal.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        mensaje = MensajeDirecto.objects.create(
            alumno=alumno,
            remitente_docente=request.user,
            destinatario_representante=rep_user,
            cuerpo=cuerpo,
            adjunto=request.FILES.get('adjunto'),
        )

        try:
            from notificaciones.tasks import task_notificar_mensaje_nuevo
            task_notificar_mensaje_nuevo.delay(mensaje.id)
        except Exception as e:
            logger.warning(f'No se pudo encolar el envío de email del mensaje: {e}')

        return Response(MensajeDirectoSerializer(mensaje, context={'request': request}).data, status=status.HTTP_201_CREATED)


class MarcarMensajeLeidoView(APIView):
    """PATCH — marca un mensaje como leído por el docente destinatario."""
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk):
        try:
            mensaje = MensajeDirecto.objects.get(pk=pk, destinatario_docente=request.user)
        except MensajeDirecto.DoesNotExist:
            return Response({'error': 'Mensaje no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        if not mensaje.leido:
            mensaje.leido = True
            mensaje.save(update_fields=['leido'])

        return Response(MensajeDirectoSerializer(mensaje, context={'request': request}).data)


# ─────────────────────────────────────────────
# MENSAJE DIRECTO — PORTAL DE REPRESENTANTES
# ─────────────────────────────────────────────
class MensajeDirectoPortalListCreateView(APIView):
    """
    GET: conversaciones del representante autenticado. ?alumno_id= filtra por
    un hijo puntual.
    POST: responde dentro de una conversación ya iniciada por un docente
    (no se puede iniciar una conversación en frío desde el portal).
    """
    authentication_classes = [PortalJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        rep_user = request.user.representante_portal
        qs = MensajeDirecto.objects.select_related('alumno', 'remitente_docente').filter(
            models.Q(remitente_representante=rep_user) | models.Q(destinatario_representante=rep_user)
        )
        alumno_id = request.query_params.get('alumno_id')
        if alumno_id:
            qs = qs.filter(alumno_id=alumno_id)
        return Response(MensajeDirectoPortalSerializer(qs, many=True, context={'request': request}).data)

    def post(self, request):
        rep_user = request.user.representante_portal
        alumno_id = request.data.get('alumno_id')
        cuerpo = (request.data.get('cuerpo') or '').strip()
        if not cuerpo:
            return Response({'error': 'El mensaje no puede estar vacío.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            alumno = Alumno.objects.get(pk=alumno_id, representante=rep_user.representante)
        except (Alumno.DoesNotExist, TypeError, ValueError):
            return Response({'error': 'Alumno no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        ultimo_mensaje_docente = MensajeDirecto.objects.filter(
            alumno=alumno, destinatario_representante=rep_user
        ).order_by('-fecha').first()
        if not ultimo_mensaje_docente:
            return Response(
                {'error': 'Todavía no hay una conversación iniciada por un docente para este alumno.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        mensaje = MensajeDirecto.objects.create(
            alumno=alumno,
            remitente_representante=rep_user,
            destinatario_docente=ultimo_mensaje_docente.remitente_docente,
            cuerpo=cuerpo,
            adjunto=request.FILES.get('adjunto'),
        )

        try:
            from notificaciones.tasks import task_notificar_mensaje_nuevo
            task_notificar_mensaje_nuevo.delay(mensaje.id)
        except Exception as e:
            logger.warning(f'No se pudo encolar el envío de email del mensaje: {e}')

        return Response(MensajeDirectoPortalSerializer(mensaje, context={'request': request}).data, status=status.HTTP_201_CREATED)


class MarcarMensajeLeidoPortalView(APIView):
    """PATCH — marca un mensaje como leído por el representante autenticado."""
    authentication_classes = [PortalJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk):
        rep_user = request.user.representante_portal
        try:
            mensaje = MensajeDirecto.objects.get(pk=pk, destinatario_representante=rep_user)
        except MensajeDirecto.DoesNotExist:
            return Response({'error': 'Mensaje no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        if not mensaje.leido:
            mensaje.leido = True
            mensaje.save(update_fields=['leido'])

        return Response(MensajeDirectoPortalSerializer(mensaje, context={'request': request}).data)
