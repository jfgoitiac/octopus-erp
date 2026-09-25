from collections import defaultdict
from datetime import date, datetime

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.serializers import PerfilDocenteSerializer, PerfilFotoSerializer
from secretaria.models import Alumno, ConfiguracionGrado, ConfiguracionSistema
from .filters import AsistenciaFilter, IncidenteFilter, NotaFilter
from .models import (
    AlertaRendimiento,
    Asistencia,
    BloqueEvaluacion,
    BloqueHorario,
    Docente,
    DisponibilidadDocente,
    EventoCalendario,
    GeneracionHorarioSnapshot,
    HorarioClase,
    IncidenteDisciplinario,
    ItemEvaluacion,
    Lapso,
    Materia,
    MaterialEstudio,
    Nota,
    NotaItemEvaluacion,
    PaqueteHorario,
    PaqueteHorarioGrado,
    PlanEvaluacion,
)
from .services import (
    UMBRAL_APROBATORIO,
    calcular_alertas_riesgo_docente,
    calcular_comparacion_materia,
    calcular_plan_notas,
    calcular_radar_cierre_lapso,
    calcular_rendimiento_alumno,
    calcular_rendimiento_seccion,
)
from .serializers import (
    AsistenciaBulkSerializer,
    AsistenciaSerializer,
    BloqueHorarioSerializer,
    DisponibilidadDocenteSerializer,
    DocenteSerializer,
    EventoCalendarioSerializer,
    HorarioClaseSerializer,
    IncidenteDisciplinarioSerializer,
    LapsoSerializer,
    MateriaDocenteSerializer,
    MateriaSerializer,
    MaterialEstudioSerializer,
    NotaBulkSerializer,
    NotaItemBulkSerializer,
    NotaSerializer,
    PaqueteHorarioGradoSerializer,
    PaqueteHorarioSerializer,
    PlanEvaluacionInputSerializer,
    PlanEvaluacionSerializer,
)
from usuarios.models import crear_log


# ─────────────────────────────────────────────
# AUTENTICACIÓN DEL PORTAL DOCENTE
# ─────────────────────────────────────────────
# NOTA: el login del docente se unificó con el del resto del staff — ver
# POST /api/token/ (authentication/cookie_views.py::CookieTokenObtainPairView).
# Ya no existe un login propio en academico (antes DocenteTokenView).
class DocenteCambiarContrasenaView(APIView):
    """
    Permite al docente autenticado cambiar su propia contraseña.
    Requiere la contraseña actual para verificar identidad.
    Mismo patrón que CambiarContrasenaPortalView (portal/views.py) para
    representantes, adaptado a que el docente usa el JWT/auth por defecto
    del panel administrativo (AdminJWTAuthentication) en vez de uno propio.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if getattr(getattr(request.user, 'perfil', None), 'rol', None) != 'docente':
            return Response(
                {'error': 'Este acceso es exclusivo para docentes.'},
                status=status.HTTP_403_FORBIDDEN,
            )

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

        return Response({'mensaje': 'Contraseña actualizada exitosamente.'})


# ─────────────────────────────────────────────
# PERMISOS PERSONALIZADOS
# ─────────────────────────────────────────────
class IsAdminOrAbove(permissions.BasePermission):
    """Permite acceso a director, sistemas, administrador y coordinador académico."""

    ROLES_PERMITIDOS = ['director', 'sistemas', 'administrador', 'coordinador']

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


class IsSecretariaOrAbove(permissions.BasePermission):
    """Permite acceso a secretaria, director, sistemas, administrador y coordinador académico."""

    ROLES_PERMITIDOS = ['director', 'sistemas', 'administrador', 'secretaria', 'coordinador']

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


def _get_rol(request):
    """Helper para obtener el rol del usuario autenticado."""
    try:
        return request.user.perfil.rol
    except Exception:
        return None


def _docente_tiene_seccion(user, grado_seccion):
    """True si el usuario tiene una Materia activa asignada en esa sección."""
    if not grado_seccion:
        return False
    return Materia.objects.filter(
        docente=user, grado_seccion__iexact=grado_seccion, activa=True
    ).exists()


class IsDocenteAsignadoOrSecretariaOrAbove(permissions.BasePermission):
    """
    Permite acceso a secretaria+ sin restricciones, o a un docente únicamente
    para la sección donde tiene una Materia activa asignada.

    Requiere que la vista implemente `_grado_seccion_objetivo(request)` que
    devuelva el grado_seccion sobre el que se está operando.
    """

    def has_permission(self, request, view):
        if IsSecretariaOrAbove().has_permission(request, view):
            return True
        if not request.user or not request.user.is_authenticated:
            return False
        if _get_rol(request) != 'docente':
            return False
        grado_seccion = view._grado_seccion_objetivo(request)
        return _docente_tiene_seccion(request.user, grado_seccion)


# ─────────────────────────────────────────────
# MATERIAS
# ─────────────────────────────────────────────
class MateriasView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        """Lista todas las materias. Filtro opcional por ?grado_seccion="""
        qs = Materia.objects.select_related('docente').all()
        grado = request.query_params.get('grado_seccion')
        if grado:
            qs = qs.filter(grado_seccion=grado)
        serializer = MateriaSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        """Crea una nueva materia. Roles permitidos: director, sistemas, administrador."""
        if not IsAdminOrAbove().has_permission(request, self):
            return Response(
                {'error': 'No tienes permisos para crear materias.'},
                status=status.HTTP_403_FORBIDDEN
            )

        datos = request.data.copy()

        # Autogenerar código si no se proporcionó
        if not datos.get('codigo'):
            nombre = datos.get('nombre', '')
            grado  = datos.get('grado_seccion', '')
            prefijo = nombre[:3].upper().replace(' ', '')
            base    = f"{prefijo}-{grado[:6].upper().replace(' ', '')}"
            codigo  = base
            contador = 1
            while Materia.objects.filter(codigo=codigo).exists():
                codigo = f"{base}-{contador}"
                contador += 1
            datos['codigo'] = codigo

        serializer = MateriaSerializer(data=datos)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class MateriaDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_materia(self, pk):
        try:
            return Materia.objects.select_related('docente').get(pk=pk)
        except Materia.DoesNotExist:
            return None

    def get(self, request, pk):
        """Detalle de una materia."""
        materia = self._get_materia(pk)
        if not materia:
            return Response({'error': 'Materia no encontrada.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(MateriaSerializer(materia).data)

    def put(self, request, pk):
        """Actualiza una materia."""
        if not IsAdminOrAbove().has_permission(request, self):
            return Response(
                {'error': 'No tienes permisos para editar materias.'},
                status=status.HTTP_403_FORBIDDEN
            )
        materia = self._get_materia(pk)
        if not materia:
            return Response({'error': 'Materia no encontrada.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = MateriaSerializer(materia, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        """Desactiva una materia (soft delete — no elimina el registro)."""
        if not IsAdminOrAbove().has_permission(request, self):
            return Response(
                {'error': 'No tienes permisos para desactivar materias.'},
                status=status.HTTP_403_FORBIDDEN
            )
        materia = self._get_materia(pk)
        if not materia:
            return Response({'error': 'Materia no encontrada.'}, status=status.HTTP_404_NOT_FOUND)
        materia.activa = False
        materia.save(update_fields=['activa'])
        return Response({'mensaje': 'Materia desactivada correctamente.'})


# ─────────────────────────────────────────────
# DOCENTES
# ─────────────────────────────────────────────
class DocentesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        """Lista docentes. Filtros opcionales: ?activo=true/false&search=&sede="""
        qs = Docente.objects.select_related('user', 'user__perfil', 'sede').filter(user__is_active=True)

        sede_id = request.query_params.get('sede')
        if sede_id:
            qs = qs.filter(sede_id=sede_id)

        activo = request.query_params.get('activo')
        if activo is not None:
            qs = qs.filter(activo=(activo.lower() == 'true'))

        buscar = request.query_params.get('search')
        if buscar:
            qs = qs.filter(
                Q(user__first_name__icontains=buscar)
                | Q(user__last_name__icontains=buscar)
                | Q(user__username__icontains=buscar)
                | Q(especialidad__icontains=buscar)
            )

        return Response(DocenteSerializer(qs, many=True).data)

    def post(self, request):
        """Crea un docente. Roles permitidos: director, sistemas, administrador."""
        if not IsAdminOrAbove().has_permission(request, self):
            return Response(
                {'error': 'No tienes permisos para crear docentes.'},
                status=status.HTTP_403_FORBIDDEN
            )
        serializer = DocenteSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class DocenteDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_docente(self, pk):
        try:
            return Docente.objects.select_related('user', 'user__perfil', 'sede').get(pk=pk)
        except Docente.DoesNotExist:
            return None

    def get(self, request, pk):
        """Detalle de un docente."""
        docente = self._get_docente(pk)
        if not docente:
            return Response({'error': 'Docente no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(DocenteSerializer(docente).data)

    def put(self, request, pk):
        """Actualiza un docente."""
        if not IsAdminOrAbove().has_permission(request, self):
            return Response(
                {'error': 'No tienes permisos para editar docentes.'},
                status=status.HTTP_403_FORBIDDEN
            )
        docente = self._get_docente(pk)
        if not docente:
            return Response({'error': 'Docente no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = DocenteSerializer(docente, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        """Desactiva un docente (soft delete — no elimina el registro)."""
        if not IsAdminOrAbove().has_permission(request, self):
            return Response(
                {'error': 'No tienes permisos para desactivar docentes.'},
                status=status.HTTP_403_FORBIDDEN
            )
        docente = self._get_docente(pk)
        if not docente:
            return Response({'error': 'Docente no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        docente.activo = False
        docente.save(update_fields=['activo'])
        return Response({'mensaje': 'Docente desactivado correctamente.'})


class DocenteAsignarMateriasView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        """
        Recibe {"materias": [ids]} y asigna esas materias al docente,
        desasignando las que tenía y ya no vienen en la lista.
        """
        if not IsAdminOrAbove().has_permission(request, self):
            return Response(
                {'error': 'No tienes permisos para asignar materias.'},
                status=status.HTTP_403_FORBIDDEN
            )
        try:
            docente = Docente.objects.select_related('user').get(pk=pk)
        except Docente.DoesNotExist:
            return Response({'error': 'Docente no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        ids = request.data.get('materias', [])
        if not isinstance(ids, list):
            return Response({'error': 'materias debe ser una lista de ids.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            Materia.objects.filter(id__in=ids).update(docente=docente.user)
            Materia.objects.filter(docente=docente.user).exclude(id__in=ids).update(docente=None)

        crear_log(
            usuario=request.user,
            accion='Asignación de materias a docente',
            modulo='academico',
            detalles={'docente_id': docente.id, 'materias': ids},
        )

        return Response(DocenteSerializer(docente).data)


# ─────────────────────────────────────────────
# LAPSOS
# ─────────────────────────────────────────────
class LapsosView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        """Lista lapsos. Filtros opcionales: ?periodo_escolar=&activo=true/false"""
        qs = Lapso.objects.all()
        periodo = request.query_params.get('periodo_escolar')
        activo  = request.query_params.get('activo')
        if periodo:
            qs = qs.filter(periodo_escolar=periodo)
        if activo is not None:
            qs = qs.filter(activo=(activo.lower() == 'true'))
        return Response(LapsoSerializer(qs, many=True).data)

    def post(self, request):
        """Crea un lapso. Roles permitidos: director, sistemas."""
        rol = _get_rol(request)
        if not request.user.is_superuser and rol not in ['director', 'sistemas']:
            return Response(
                {'error': 'Solo el director o sistemas pueden crear lapsos.'},
                status=status.HTTP_403_FORBIDDEN
            )
        serializer = LapsoSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ─────────────────────────────────────────────
# NOTAS DE UN GRADO
# ─────────────────────────────────────────────
class NotasGradoView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        """
        Retorna todos los alumnos del grado con sus notas para una materia y lapso.
        Parámetros requeridos: ?materia_id=&lapso_id=
        Si un alumno no tiene Nota aún, se retorna un objeto con campos null.
        """
        materia_id = request.query_params.get('materia_id')
        lapso_id   = request.query_params.get('lapso_id')

        if not materia_id or not lapso_id:
            return Response(
                {'error': 'Se requieren los parámetros materia_id y lapso_id.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            materia = Materia.objects.get(pk=materia_id)
        except Materia.DoesNotExist:
            return Response({'error': 'Materia no encontrada.'}, status=status.HTTP_404_NOT_FOUND)

        if not IsSecretariaOrAbove().has_permission(request, self):
            if _get_rol(request) != 'docente' or materia.docente_id != request.user.id:
                return Response(
                    {'error': 'No tienes permisos para consultar las notas de esta materia.'},
                    status=status.HTTP_403_FORBIDDEN
                )

        try:
            lapso = Lapso.objects.get(pk=lapso_id)
        except Lapso.DoesNotExist:
            return Response({'error': 'Lapso no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        # Alumnos activos del grado
        alumnos = Alumno.objects.filter(grado_seccion=materia.grado_seccion)

        # Notas existentes — aplicar filtros adicionales vía query params
        # select_related evita 3 queries por nota (alumno, materia, lapso) que
        # NotaSerializer dispara vía sus SerializerMethodField
        notas_qs = Nota.objects.filter(materia=materia, lapso=lapso).select_related('alumno', 'materia', 'lapso')
        filterset = NotaFilter(request.query_params, queryset=notas_qs)
        if filterset.is_valid():
            notas_qs = filterset.qs
        notas_map = {n.alumno_id: n for n in notas_qs}

        resultado = []
        for alumno in alumnos:
            nota = notas_map.get(alumno.id)
            if nota:
                resultado.append(NotaSerializer(nota).data)
            else:
                # Alumno sin nota registrada — retornar objeto vacío
                resultado.append({
                    'id': None,
                    'alumno_id': alumno.id,
                    'alumno_nombre': f"{alumno.nombre} {alumno.apellido}",
                    'materia_id': materia.id,
                    'materia_nombre': materia.nombre,
                    'lapso_id': lapso.id,
                    'lapso_nombre': str(lapso),
                    'evaluacion_1': None,
                    'evaluacion_2': None,
                    'evaluacion_3': None,
                    'evaluacion_4': None,
                    'definitiva': None,
                    'aprobado': None,
                    'observaciones': '',
                })

        return Response(resultado)

    def post(self, request):
        """
        Guarda/actualiza notas de un grado completo.
        Body: {materia_id, lapso_id, notas: [{alumno_id, evaluacion_1..4, observaciones}]}
        Roles permitidos: director, sistemas, administrador, secretaria,
        o docente únicamente para su propia materia (Materia.docente = request.user).
        """
        serializer = NotaBulkSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        datos = serializer.validated_data
        materia_id = datos['materia_id']
        lapso_id   = datos['lapso_id']
        notas_data = datos['notas']

        try:
            materia = Materia.objects.get(pk=materia_id)
        except Materia.DoesNotExist:
            return Response({'error': 'Materia no encontrada.'}, status=status.HTTP_404_NOT_FOUND)

        if not IsSecretariaOrAbove().has_permission(request, self):
            if _get_rol(request) != 'docente' or materia.docente_id != request.user.id:
                return Response(
                    {'error': 'No tienes permisos para registrar notas en esta materia.'},
                    status=status.HTTP_403_FORBIDDEN
                )

        try:
            lapso = Lapso.objects.get(pk=lapso_id)
        except Lapso.DoesNotExist:
            return Response({'error': 'Lapso no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        if not lapso.activo:
            return Response(
                {'error': 'El lapso está cerrado — no se pueden registrar ni editar notas.'},
                status=status.HTTP_409_CONFLICT
            )

        # Prefetch de todos los alumnos del payload en una sola query (antes:
        # 1 query por fila con Alumno.objects.get() dentro del loop).
        alumno_ids  = [item['alumno_id'] for item in notas_data]
        alumnos_map = {a.id: a for a in Alumno.objects.filter(pk__in=alumno_ids)}

        guardadas = []
        errores   = []

        # Todo el guardado masivo corre en una única transacción: si una fila
        # revienta a mitad de camino (constraint, timeout, etc.) se hace
        # rollback completo en vez de dejar un guardado parcial del grado.
        with transaction.atomic():
            for item in notas_data:
                alumno_id = item['alumno_id']
                alumno = alumnos_map.get(alumno_id)
                if alumno is None:
                    errores.append({'alumno_id': alumno_id, 'error': 'Alumno no encontrado.'})
                    continue

                nota, _ = Nota.objects.get_or_create(
                    alumno=alumno,
                    materia=materia,
                    lapso=lapso,
                )
                # Reasigna los objetos ya en memoria: get_or_create no cachea las
                # relaciones FK cuando toma la rama "get" (registro ya existente),
                # así que sin esto NotaSerializer(nota).data dispararía 3 queries
                # más (alumno, materia, lapso) por cada nota ya existente.
                nota.alumno  = alumno
                nota.materia = materia
                nota.lapso   = lapso
                nota.evaluacion_1  = item.get('evaluacion_1')
                nota.evaluacion_2  = item.get('evaluacion_2')
                nota.evaluacion_3  = item.get('evaluacion_3')
                nota.evaluacion_4  = item.get('evaluacion_4')
                nota.observaciones = item.get('observaciones', '')
                nota.save()
                guardadas.append(NotaSerializer(nota).data)

        return Response({
            'guardadas': guardadas,
            'errores':   errores,
        }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# ASISTENCIA
# ─────────────────────────────────────────────
class AsistenciaView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        """
        Retorna la lista de alumnos de un grado con su asistencia del día.
        Parámetros requeridos: ?grado_seccion=&fecha=YYYY-MM-DD
        Si un alumno no tiene registro para esa fecha, presente=null.
        """
        grado = request.query_params.get('grado_seccion')
        fecha = request.query_params.get('fecha')

        if not grado or not fecha:
            return Response(
                {'error': 'Se requieren los parámetros grado_seccion y fecha.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not IsDocenteAsignadoOrSecretariaOrAbove().has_permission(request, self):
            return Response(
                {'error': 'No tienes permisos para consultar la asistencia de esta sección.'},
                status=status.HTTP_403_FORBIDDEN
            )

        alumnos = Alumno.objects.filter(grado_seccion=grado)
        asistencias_qs = Asistencia.objects.filter(
            alumno__grado_seccion=grado, fecha=fecha
        ).select_related('alumno')
        # Aplicar filtros adicionales vía query params (presente, justificada, etc.)
        filterset = AsistenciaFilter(request.query_params, queryset=asistencias_qs)
        if filterset.is_valid():
            asistencias_qs = filterset.qs
        asistencias_map = {a.alumno_id: a for a in asistencias_qs}

        resultado = []
        for alumno in alumnos:
            asistencia = asistencias_map.get(alumno.id)
            if asistencia:
                resultado.append(AsistenciaSerializer(asistencia).data)
            else:
                resultado.append({
                    'id': None,
                    'alumno_id': alumno.id,
                    'alumno_nombre': f"{alumno.nombre} {alumno.apellido}",
                    'fecha': fecha,
                    'presente': None,
                    'justificada': False,
                    'estado': None,
                    'observacion': '',
                })

        return Response(resultado)

    def _grado_seccion_objetivo(self, request):
        # GET envía grado_seccion por query params; POST lo envía en el body.
        return request.query_params.get('grado_seccion') or request.data.get('grado_seccion')

    def post(self, request):
        """
        Guarda/actualiza la asistencia masiva de un grado en un día.
        Body: {fecha, grado_seccion, registros: [{alumno_id, estado, observacion}]}
        Roles permitidos: director, sistemas, administrador, secretaria,
        o docente si tiene una materia activa asignada en esa sección.
        """
        if not IsDocenteAsignadoOrSecretariaOrAbove().has_permission(request, self):
            return Response(
                {'error': 'No tienes permisos para registrar asistencia en esta sección.'},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = AsistenciaBulkSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        datos     = serializer.validated_data
        fecha     = datos['fecha']
        registros = datos['registros']

        # Prefetch de todos los alumnos del payload en una sola query (antes:
        # 1 query por fila con Alumno.objects.get() dentro del loop).
        alumno_ids  = [item['alumno_id'] for item in registros]
        alumnos_map = {a.id: a for a in Alumno.objects.filter(pk__in=alumno_ids)}

        guardadas = []
        errores   = []

        for item in registros:
            alumno_id = item['alumno_id']
            alumno = alumnos_map.get(alumno_id)
            if alumno is None:
                errores.append({'alumno_id': alumno_id, 'error': 'Alumno no encontrado.'})
                continue

            asistencia, _ = Asistencia.objects.update_or_create(
                alumno=alumno,
                fecha=fecha,
                defaults={
                    'presente':       item['presente'],
                    'justificada':    item.get('justificada', False),
                    'estado':         item.get('estado'),
                    'observacion':    item.get('observacion', ''),
                    'registrado_por': request.user,
                }
            )
            # update_or_create no cachea la relación FK cuando toma la rama
            # "update" (registro ya existente) — sin esto AsistenciaSerializer
            # dispararía 1 query más (alumno) por cada registro ya existente.
            asistencia.alumno = alumno
            guardadas.append(AsistenciaSerializer(asistencia).data)

        return Response({
            'guardadas': guardadas,
            'errores':   errores,
        }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# RESUMEN DE ASISTENCIA POR ALUMNO / MES
# ─────────────────────────────────────────────
class ResumenAsistenciaView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        """
        Retorna resumen de asistencia de un alumno en un mes/año dado.
        Parámetros requeridos: ?alumno_id=&mes=&anio=
        """
        alumno_id = request.query_params.get('alumno_id')
        mes       = request.query_params.get('mes')
        anio      = request.query_params.get('anio')

        if not alumno_id or not mes or not anio:
            return Response(
                {'error': 'Se requieren los parámetros alumno_id, mes y anio.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            alumno = Alumno.objects.get(pk=alumno_id)
        except Alumno.DoesNotExist:
            return Response({'error': 'Alumno no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            mes  = int(mes)
            anio = int(anio)
        except ValueError:
            return Response({'error': 'mes y anio deben ser números enteros.'}, status=status.HTTP_400_BAD_REQUEST)

        asistencias = Asistencia.objects.filter(
            alumno=alumno,
            fecha__month=mes,
            fecha__year=anio,
        )

        total_dias        = asistencias.count()
        dias_presentes    = asistencias.filter(presente=True).count()
        ausencias         = asistencias.filter(presente=False).count()
        ausencias_justif  = asistencias.filter(presente=False, justificada=True).count()
        porcentaje        = round((dias_presentes / total_dias * 100), 2) if total_dias > 0 else 0

        return Response({
            'alumno_id':            alumno.id,
            'alumno_nombre':        f"{alumno.nombre} {alumno.apellido}",
            'mes':                  mes,
            'anio':                 anio,
            'total_dias':           total_dias,
            'dias_presentes':       dias_presentes,
            'ausencias':            ausencias,
            'ausencias_justificadas': ausencias_justif,
            'porcentaje_asistencia': porcentaje,
        })


# ─────────────────────────────────────────────
# HORARIOS
# ─────────────────────────────────────────────
def _buscar_choque_horario(materia, dia_semana, hora_inicio, hora_fin, aula, excluir_pk=None):
    """
    Verifica si el bloque propuesto (dia_semana, hora_inicio-hora_fin) choca con
    otro HorarioClase existente para el MISMO docente (en cualquier grado_seccion,
    no solo el grado de `materia`), la MISMA aula (si viene informada), o el
    MISMO grado_seccion (un grado no puede tener dos clases simultáneas,
    aunque no compartan docente ni aula — ej. ambas materias sin docente
    asignado). Este último chequeo se agregó en la auditoría 2026-09-15: antes,
    si ninguna de las dos clases tenía docente ni aula informados, no había
    forma de detectar el choque.

    Comparación por rango horario (no solo igualdad exacta de hora), para detectar
    solapamientos parciales — ej. 07:00-08:00 vs 07:30-08:30 sí chocan.

    Retorna una tupla (HorarioClase en conflicto, mismo_docente, misma_aula,
    mismo_grado), o (None, False, False, False) si no hay choque.
    """
    if not hora_inicio or not hora_fin:
        return None, False, False, False

    # select_for_update(): los dos callers (HorariosView.post,
    # HorarioDetailView.put) envuelven el chequeo + guardado en
    # transaction.atomic(), así que esto bloquea las filas candidatas hasta
    # que la transacción termine, evitando que dos requests concurrentes
    # pasen ambos el chequeo antes de que cualquiera guarde. En SQLite
    # (dev/test) Django ignora el FOR UPDATE silenciosamente; el bloqueo real
    # aplica en motores que sí lo soportan (ej. PostgreSQL).
    candidatos = HorarioClase.objects.select_for_update().filter(
        dia_semana=dia_semana,
    ).select_related('materia')
    if excluir_pk is not None:
        candidatos = candidatos.exclude(pk=excluir_pk)

    docente_id = materia.docente_id if materia else None
    grado_seccion = materia.grado_seccion if materia else None
    aula_normalizada = (aula or '').strip()

    filtro_choque = Q(materia__grado_seccion=grado_seccion)
    if docente_id:
        filtro_choque |= Q(materia__docente_id=docente_id)
    if aula_normalizada:
        filtro_choque |= Q(aula=aula_normalizada)

    candidatos = candidatos.filter(filtro_choque)

    for otro in candidatos:
        # Solapamiento de rango horario (intervalos semiabiertos [inicio, fin))
        if hora_inicio < otro.hora_fin and otro.hora_inicio < hora_fin:
            mismo_docente = bool(docente_id and otro.materia.docente_id == docente_id)
            misma_aula = bool(aula_normalizada and otro.aula.strip() == aula_normalizada)
            mismo_grado = bool(grado_seccion and otro.materia.grado_seccion == grado_seccion)
            if mismo_docente or misma_aula or mismo_grado:
                return otro, mismo_docente, misma_aula, mismo_grado
    return None, False, False, False


def _mensaje_choque_horario(otro, mismo_docente, misma_aula, mismo_grado):
    detalle = (
        f"'{otro.materia.nombre}' ({otro.materia.grado_seccion}) "
        f"el {otro.get_dia_semana_display()} de {otro.hora_inicio:%H:%M} a {otro.hora_fin:%H:%M}"
    )
    motivos = []
    if mismo_docente:
        motivos.append('el docente ya tiene clase asignada')
    if misma_aula:
        motivos.append("el aula ya está ocupada")
    if mismo_grado:
        motivos.append('el grado ya tiene otra clase asignada')
    motivo = ' y '.join(motivos) if motivos else 'hay un choque de horario'
    return f"Choque de horario: {motivo} en {detalle}."


class HorariosView(APIView):
    # Antes IsAuthenticated (cualquier rol, incluidos docentes, podía
    # consultar el horario de cualquier grado/sección). Restringido a
    # secretaria/director/sistemas/administrador — auditoría 2026-09-15, H7.
    # POST sigue exigiendo además IsAdminOrAbove (más estricto) en su propio
    # chequeo manual dentro de post().
    permission_classes = [IsSecretariaOrAbove]

    def get(self, request):
        """
        Retorna el horario semanal de un grado como lista plana (mismo
        contrato que DocenteMiHorarioView): cada elemento es un
        HorarioClaseSerializer, con `dia_semana` en el mismo formato string
        ('lunes'..'viernes') que usa el modelo. Antes se devolvía un objeto
        agrupado por día, que el frontend (useHorarios.js) nunca consumía
        correctamente — ver auditoría 2026-09-15 (NOTAS_TECNICAS.md).
        Parámetro requerido: ?grado_seccion=
        """
        grado = request.query_params.get('grado_seccion')
        if not grado:
            return Response(
                {'error': 'Se requiere el parámetro grado_seccion.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        horarios = HorarioClase.objects.filter(
            materia__grado_seccion=grado,
            materia__activa=True,
        ).select_related('materia')

        # Un mismo grado_seccion puede repetirse en distintos periodos/sedes
        # (paquetes distintos) — sin este filtro se mezclaban horarios de
        # paquetes distintos que comparten el mismo nombre de grado.
        paquete_id = request.query_params.get('paquete')
        if paquete_id:
            horarios = horarios.filter(bloque__paquete_id=paquete_id)

        return Response(HorarioClaseSerializer(horarios, many=True).data)

    def post(self, request):
        """
        Crea una entrada de horario.
        Roles permitidos: director, sistemas, administrador.
        """
        if not IsAdminOrAbove().has_permission(request, self):
            return Response(
                {'error': 'No tienes permisos para crear horarios.'},
                status=status.HTTP_403_FORBIDDEN
            )
        serializer = HorarioClaseSerializer(data=request.data)
        if serializer.is_valid():
            with transaction.atomic():
                materia = serializer.validated_data.get('materia')
                otro, mismo_docente, misma_aula, mismo_grado = _buscar_choque_horario(
                    materia,
                    serializer.validated_data.get('dia_semana'),
                    serializer.validated_data.get('hora_inicio'),
                    serializer.validated_data.get('hora_fin'),
                    serializer.validated_data.get('aula'),
                )
                if otro:
                    return Response(
                        {'error': _mensaje_choque_horario(otro, mismo_docente, misma_aula, mismo_grado)},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)



# ─────────────────────────────────────────────
# HORARIO — DETALLE (PUT / DELETE)
# ─────────────────────────────────────────────
class HorarioDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_horario(self, pk):
        try:
            return HorarioClase.objects.select_related('materia').get(pk=pk)
        except HorarioClase.DoesNotExist:
            return None

    def put(self, request, pk):
        """Actualiza un horario existente. Roles: director, sistemas, administrador."""
        if not IsAdminOrAbove().has_permission(request, self):
            return Response(
                {'error': 'No tienes permisos para editar horarios.'},
                status=status.HTTP_403_FORBIDDEN
            )
        horario = self._get_horario(pk)
        if not horario:
            return Response({'error': 'Horario no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = HorarioClaseSerializer(horario, data=request.data, partial=True)
        if serializer.is_valid():
            with transaction.atomic():
                datos = serializer.validated_data
                materia = datos.get('materia', horario.materia)
                dia_semana = datos.get('dia_semana', horario.dia_semana)
                hora_inicio = datos.get('hora_inicio', horario.hora_inicio)
                hora_fin = datos.get('hora_fin', horario.hora_fin)
                aula = datos.get('aula', horario.aula)
                otro, mismo_docente, misma_aula, mismo_grado = _buscar_choque_horario(
                    materia, dia_semana, hora_inicio, hora_fin, aula,
                    excluir_pk=horario.pk,
                )
                if otro:
                    return Response(
                        {'error': _mensaje_choque_horario(otro, mismo_docente, misma_aula, mismo_grado)},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        """Elimina un horario. Roles: director, sistemas, administrador."""
        if not IsAdminOrAbove().has_permission(request, self):
            return Response(
                {'error': 'No tienes permisos para eliminar horarios.'},
                status=status.HTTP_403_FORBIDDEN
            )
        horario = self._get_horario(pk)
        if not horario:
            return Response({'error': 'Horario no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        horario.delete()
        return Response({'mensaje': 'Horario eliminado correctamente.'}, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# BOLETÍN
# ─────────────────────────────────────────────
class BoletinView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        """
        Retorna todos los datos necesarios para generar el boletín de un alumno en un lapso.
        Parámetros requeridos: ?alumno_id=&lapso_id=
        """
        alumno_id = request.query_params.get('alumno_id')
        lapso_id  = request.query_params.get('lapso_id')

        if not alumno_id or not lapso_id:
            return Response(
                {'error': 'Se requieren los parámetros alumno_id y lapso_id.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            alumno = Alumno.objects.select_related('representante').get(pk=alumno_id)
        except Alumno.DoesNotExist:
            return Response({'error': 'Alumno no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            lapso = Lapso.objects.get(pk=lapso_id)
        except Lapso.DoesNotExist:
            return Response({'error': 'Lapso no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        # Notas del alumno en este lapso — materias sin plan de evaluación
        # configurado (sistema viejo evaluacion_1..4).
        notas_qs = Nota.objects.filter(
            alumno=alumno, lapso=lapso
        ).select_related('materia')

        materias_notas = []
        materias_con_nota_ids = set()
        for nota in notas_qs:
            materias_con_nota_ids.add(nota.materia_id)
            materias_notas.append({
                'materia_id':    nota.materia.id,
                'materia_nombre': nota.materia.nombre,
                'evaluacion_1':  nota.evaluacion_1,
                'evaluacion_2':  nota.evaluacion_2,
                'evaluacion_3':  nota.evaluacion_3,
                'evaluacion_4':  nota.evaluacion_4,
                'definitiva':    nota.definitiva,
                'definitiva_letra': None,
                'aprobado':      nota.aprobado,
                'cuenta_para_promedio': nota.materia.cuenta_para_promedio,
            })

        # Materias del grado del alumno con Plan de Evaluación en este lapso
        # (sistema nuevo de bloques/ítems) — no dejan fila en `Nota`, así que
        # sin este bloque quedarían completamente ausentes del boletín.
        materias_con_plan = Materia.objects.filter(
            grado_seccion=alumno.grado_seccion,
            activa=True,
            planes_evaluacion__lapso=lapso,
        ).exclude(pk__in=materias_con_nota_ids).distinct()

        for materia in materias_con_plan:
            _, alumnos_data = calcular_plan_notas(materia, lapso)
            fila_alumno = next((a for a in alumnos_data if a['alumno_id'] == alumno.id), None)
            if fila_alumno is None:
                continue
            definitiva = fila_alumno['total']
            aprobado = (definitiva >= float(UMBRAL_APROBATORIO)) if definitiva is not None else None
            materias_notas.append({
                'materia_id':    materia.id,
                'materia_nombre': materia.nombre,
                'evaluacion_1':  None,
                'evaluacion_2':  None,
                'evaluacion_3':  None,
                'evaluacion_4':  None,
                'definitiva':    definitiva,
                'definitiva_letra': fila_alumno['total_letra'],
                'aprobado':      aprobado,
                'cuenta_para_promedio': materia.cuenta_para_promedio,
            })

        # Resumen de asistencia durante el período del lapso
        asistencias = Asistencia.objects.filter(
            alumno=alumno,
            fecha__gte=lapso.fecha_inicio,
            fecha__lte=lapso.fecha_fin,
        )
        total_dias     = asistencias.count()
        dias_presentes = asistencias.filter(presente=True).count()

        # Datos del colegio desde ConfiguracionSistema
        config = ConfiguracionSistema.objects.first()
        datos_colegio = {}
        if config:
            datos_colegio = {
                'nombre_colegio':   config.nombre_colegio,
                'rif':              config.rif,
                'direccion':        config.direccion_colegio,
                'telefono':         config.telefono_colegio,
                'correo':           config.correo_colegio,
                'municipio':        config.municipio,
                'estado':           config.estado_colegio,
                'periodo_escolar':  config.periodo_escolar_activo,
            }

        return Response({
            'alumno': {
                'id':            alumno.id,
                'nombre':        alumno.nombre,
                'apellido':      alumno.apellido,
                'grado_seccion': alumno.grado_seccion,
                'cedula_escolar': alumno.cedula_escolar,
            },
            'lapso': {
                'id':              lapso.id,
                'nombre':          lapso.nombre,
                'periodo_escolar': lapso.periodo_escolar,
                'fecha_inicio':    lapso.fecha_inicio,
                'fecha_fin':       lapso.fecha_fin,
                'activo':          lapso.activo,
            },
            'materias': materias_notas,
            'asistencia': {
                'total_dias':     total_dias,
                'dias_presentes': dias_presentes,
                'ausencias':      total_dias - dias_presentes,
            },
            'colegio': datos_colegio,
        })


# ─────────────────────────────────────────────
# GENERADOR AUTOMÁTICO DE HORARIOS
# ─────────────────────────────────────────────
import random
from datetime import datetime, timedelta


def _calcular_bloques(hora_inicio_str, hora_fin_str, duracion_min, recesos):
    """
    Calcula la lista de bloques horarios disponibles en el día,
    excluyendo los bloques de receso.
    `recesos`: lista de dicts [{'hora': 'HH:MM', 'duracion_min': int}, ...]
    (soporta uno o varios recesos en el mismo día).
    Retorna: [{'inicio': 'HH:MM', 'fin': 'HH:MM'}, ...]
    """
    fmt = '%H:%M'
    inicio = datetime.strptime(hora_inicio_str, fmt)
    fin    = datetime.strptime(hora_fin_str, fmt)
    duracion = timedelta(minutes=duracion_min)

    rangos_receso = []
    for r in (recesos or []):
        r_inicio = datetime.strptime(r['hora'], fmt)
        r_fin    = r_inicio + timedelta(minutes=int(r['duracion_min']))
        rangos_receso.append((r_inicio, r_fin))

    bloques = []
    cursor  = inicio
    while cursor + duracion <= fin:
        bloque_fin = cursor + duracion
        # Omitir bloques que se solapen con cualquiera de los recesos
        receso_solapado = next(
            (rr for rr in rangos_receso if cursor < rr[1] and bloque_fin > rr[0]),
            None,
        )
        if receso_solapado is None:
            bloques.append({
                'inicio': cursor.strftime(fmt),
                'fin':    bloque_fin.strftime(fmt),
            })
            cursor += duracion
        elif cursor < receso_solapado[0]:
            # Si el cursor está antes del receso y el bloque llegaría a solaparlo,
            # saltar directo al final del receso para no generar bloques parciales.
            cursor = receso_solapado[1]
        else:
            cursor += duracion

    return bloques


def _rangos_se_solapan(inicio_a, fin_a, inicio_b, fin_b, fmt='%H:%M'):
    """True si los rangos [inicio_a, fin_a) y [inicio_b, fin_b) se solapan.
    Compara por valor de hora (vía datetime.strptime), no por igualdad de string,
    para detectar solapamientos parciales (ej. 07:00-08:00 vs 07:30-08:30)."""
    ia = datetime.strptime(inicio_a, fmt)
    fa = datetime.strptime(fin_a, fmt)
    ib = datetime.strptime(inicio_b, fmt)
    fb = datetime.strptime(fin_b, fmt)
    return ia < fb and ib < fa


def _intentar_recolocar(materia, dias, grilla, asignaciones, materia_dias, conflictos_docente,
                         aula_fija=None, conflictos_aula=None):
    """
    Backtracking limitado (no un solver completo): cuando `materia` no logra
    ubicarse, busca UNA asignación ya hecha de OTRA materia que pueda moverse
    a un bloque libre alternativo, liberando así su bloque original para
    `materia`. Se detiene en el primer movimiento válido encontrado.
    Retorna la nueva asignación para `materia` si tuvo éxito, o None.
    Muta `grilla`, `asignaciones` y `materia_dias` en caso de éxito.
    """
    def conflicto(m, dia, bloque):
        if m.docente_id:
            ocupados = conflictos_docente.get((m.docente_id, dia), [])
            if any(
                _rangos_se_solapan(bloque['inicio'], bloque['fin'], oi, of)
                for oi, of in ocupados
            ):
                return True
        if aula_fija and conflictos_aula:
            ocupados_aula = conflictos_aula.get((aula_fija, dia), [])
            if any(
                _rangos_se_solapan(bloque['inicio'], bloque['fin'], oi, of)
                for oi, of in ocupados_aula
            ):
                return True
        return False

    for idx, asignada in enumerate(asignaciones):
        otra_materia = asignada['materia']
        if otra_materia.id == materia.id:
            continue
        dia_original    = asignada['dia']
        bloque_original = asignada['bloque']

        # ¿La materia que falla puede ocupar el bloque que dejaría libre `otra_materia`?
        if conflicto(materia, dia_original, bloque_original):
            continue

        # Buscar un bloque libre alternativo, en cualquier día, para reubicar `otra_materia`
        for dia_alt in dias:
            for bloque_alt in list(grilla[dia_alt]):
                if conflicto(otra_materia, dia_alt, bloque_alt):
                    continue
                # Movimiento válido: mover `otra_materia` a (dia_alt, bloque_alt)
                # y ubicar `materia` en el bloque que queda libre.
                grilla[dia_alt].remove(bloque_alt)
                asignaciones[idx] = {'materia': otra_materia, 'dia': dia_alt, 'bloque': bloque_alt}
                materia_dias[otra_materia.id].discard(dia_original)
                materia_dias[otra_materia.id].add(dia_alt)
                materia_dias[materia.id].add(dia_original)
                return {'materia': materia, 'dia': dia_original, 'bloque': bloque_original}
    return None


def _ejecutar_algoritmo(grado_seccion, config, semilla=None):
    """
    Algoritmo de distribución de materias en la grilla horaria.
    Cada materia se asigna exactamente materia.horas_academicas veces en la semana
    (1 hora académica = 1 bloque de 45 min).
    Retorna (asignaciones, advertencias).
    asignaciones: [{'materia': <Materia>, 'dia': str, 'bloque': {'inicio': str, 'fin': str}}]

    `semilla`: si se provee, fija random.seed(semilla) para que el resultado sea
    reproducible. Si es None (default), NO se fija semilla y cada llamada usa
    aleatoriedad real, aunque los datos de entrada sean idénticos.
    """
    materias = list(Materia.objects.filter(grado_seccion=grado_seccion, activa=True))
    if not materias:
        return [], ['No hay materias activas para este grado.']

    dias = config.get('dias', ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'])

    # Soporta el array `recesos` (múltiples recesos por día). Por compatibilidad
    # hacia atrás, si no viene `recesos` se arma uno solo a partir de los campos
    # singulares `recreo_hora` / `recreo_duracion_min`.
    recesos = config.get('recesos')
    if not recesos:
        recesos = [{
            'hora':         config.get('recreo_hora', '09:00'),
            'duracion_min': config.get('recreo_duracion_min', 20),
        }]

    bloques = _calcular_bloques(
        config['hora_inicio'],
        config['hora_fin'],
        config['duracion_clase_min'],
        recesos,
    )

    if not bloques:
        return [], ['No se pudieron calcular bloques horarios con la configuración dada.']

    # Índice de conflictos de docentes en otros grados:
    # {(docente_id, dia): [(hora_inicio, hora_fin), ...]} — permite detectar
    # solapamiento de rangos, no solo igualdad exacta de hora_inicio.
    horarios_otros = HorarioClase.objects.exclude(
        materia__grado_seccion=grado_seccion
    ).select_related('materia')
    conflictos_docente = {}
    conflictos_aula = {}
    for h in horarios_otros:
        if h.materia.docente_id:
            clave = (h.materia.docente_id, h.dia_semana)
            conflictos_docente.setdefault(clave, []).append(
                (h.hora_inicio.strftime('%H:%M'), h.hora_fin.strftime('%H:%M'))
            )
        aula_otro = (h.aula or '').strip()
        if aula_otro:
            clave_aula = (aula_otro, h.dia_semana)
            conflictos_aula.setdefault(clave_aula, []).append(
                (h.hora_inicio.strftime('%H:%M'), h.hora_fin.strftime('%H:%M'))
            )

    # Aula fija del grado (ConfiguracionGrado.aula_fija) — el generador la
    # asigna a todas las clases de este grado, evitando bloques donde esa
    # misma aula ya esté ocupada por OTRO grado (ver auditoría 2026-09-15, H4).
    aula_fija = (
        ConfiguracionGrado.objects.filter(grado_seccion=grado_seccion)
        .values_list('aula_fija', flat=True).first() or ''
    ).strip()

    if semilla is not None:
        random.seed(semilla)

    # Grilla: dia -> [bloques disponibles] (copia por día)
    grilla = {dia: list(bloques) for dia in dias}

    # Bloques ocupados por clases marcadas como "bloqueadas" (que el usuario
    # pidió explícitamente no mover/regenerar): {dia: [(inicio, fin), ...]}.
    # Se excluyen por solapamiento de rango, igual que los recesos, para que
    # el algoritmo nunca proponga una clase nueva encima de una bloqueada.
    bloqueos_por_dia = config.get('bloqueos_por_dia') or {}
    if bloqueos_por_dia:
        for dia in dias:
            ocupados_dia = bloqueos_por_dia.get(dia, [])
            if not ocupados_dia:
                continue
            grilla[dia] = [
                b for b in grilla[dia]
                if not any(
                    _rangos_se_solapan(b['inicio'], b['fin'], oi, of)
                    for (oi, of) in ocupados_dia
                )
            ]

    # Rastrear en qué días ya está cada materia para distribuir equitativamente
    materia_dias = {m.id: set() for m in materias}

    # Expandir cada materia según sus horas_academicas semanales
    cola = []
    for m in materias:
        cola.extend([m] * max(1, m.horas_academicas))
    random.shuffle(cola)

    asignaciones = []
    advertencias = []

    for materia in cola:
        if not any(grilla[d] for d in dias):
            break

        dias_candidatos = random.sample(dias, len(dias))
        ubicada = False

        for intentar_sin_restriccion in (False, True):
            for dia in dias_candidatos:
                if not grilla[dia]:
                    continue
                # Primer pase: evitar repetir día para la misma materia
                if not intentar_sin_restriccion and dia in materia_dias[materia.id]:
                    continue
                bloque = grilla[dia][0]
                # Verificar conflicto de docente: solapamiento de rango [inicio, fin),
                # no solo igualdad exacta de hora_inicio.
                if materia.docente_id:
                    ocupados = conflictos_docente.get((materia.docente_id, dia), [])
                    if any(
                        _rangos_se_solapan(bloque['inicio'], bloque['fin'], oi, of)
                        for oi, of in ocupados
                    ):
                        advertencias.append(
                            f"Conflicto de docente: '{materia.nombre}' el {dia} a las {bloque['inicio']} — se intentará otro bloque."
                        )
                        continue
                # Verificar conflicto de aula fija del grado contra otros grados
                # que ya tengan esa misma aula ocupada en un rango solapado.
                if aula_fija:
                    ocupados_aula = conflictos_aula.get((aula_fija, dia), [])
                    if any(
                        _rangos_se_solapan(bloque['inicio'], bloque['fin'], oi, of)
                        for oi, of in ocupados_aula
                    ):
                        advertencias.append(
                            f"Conflicto de aula: '{aula_fija}' ya está ocupada el {dia} a las "
                            f"{bloque['inicio']} por otro grado — se intentará otro bloque."
                        )
                        continue
                grilla[dia].pop(0)
                materia_dias[materia.id].add(dia)
                asignaciones.append({'materia': materia, 'dia': dia, 'bloque': bloque})
                ubicada = True
                break
            if ubicada:
                break

        if not ubicada:
            # Recolocación acotada: intenta liberar el bloque de otra materia
            # que sí tenga una alternativa disponible en otro momento.
            reubicacion = _intentar_recolocar(
                materia, dias, grilla, asignaciones, materia_dias, conflictos_docente,
                aula_fija=aula_fija, conflictos_aula=conflictos_aula,
            )
            if reubicacion:
                asignaciones.append(reubicacion)
                ubicada = True

        if not ubicada:
            advertencias.append(
                f"No se pudo ubicar todas las horas de '{materia.nombre}' "
                f"({materia.horas_academicas} h/sem) por falta de bloques o conflictos de docente."
            )

    return asignaciones, advertencias


def _armar_disponibilidad_map(docentes_ids):
    """
    {docente_user_id: [DisponibilidadDocente, ...] | None}.
    None significa "sin franjas declaradas" == disponible siempre, para no
    romper docentes que aún no configuraron su disponibilidad.
    """
    mapa = {uid: [] for uid in docentes_ids}
    franjas = DisponibilidadDocente.objects.filter(
        docente__user_id__in=docentes_ids
    ).select_related('docente')
    for f in franjas:
        mapa[f.docente.user_id].append(f)
    return {uid: (franjas_docente or None) for uid, franjas_docente in mapa.items()}


def _docente_disponible_en_bloque(disponibilidad_map, docente_id, bloque):
    """True si el docente puede dictar en `bloque` (BloqueHorario). Un
    docente sin franjas declaradas (mapa[docente_id] es None) se considera
    disponible siempre."""
    franjas = disponibilidad_map.get(docente_id)
    if not franjas:
        return True
    for f in franjas:
        if (
            f.dia_semana == bloque.dia_semana
            and f.hora_inicio <= bloque.hora_inicio
            and f.hora_fin >= bloque.hora_fin
        ):
            return True
    return False


def _ejecutar_algoritmo_paquete(paquete, semilla=None):
    """
    Distribuye las materias de TODOS los grados de `paquete` en una sola
    pasada, usando los BloqueHorario del paquete como grilla (en vez de
    bloques calculados on-the-fly como el algoritmo legado por-grado). Esto
    permite detectar y evitar choques de docente/aula ENTRE los grados del
    paquete dentro de la misma corrida.

    Respeta:
      - HorarioClase.pineado=True: no se tocan ni se cuentan como libres
        los bloques que ya ocupan.
      - DisponibilidadDocente: si el docente declaró franjas, solo se le
        asigna dentro de ellas. Sin franjas declaradas = disponible siempre.
      - Conflicto de aula (ConfiguracionGrado.aula_fija por grado), igual
        que de docente.

    Retorna (colocadas, no_colocadas, advertencias):
      colocadas: [{'materia': Materia, 'bloque': BloqueHorario, 'aula': str}]
      no_colocadas: [{'materia': Materia, 'horas_faltantes': int, 'motivo': str}]
      advertencias: [str]
    """
    grados = list(
        PaqueteHorarioGrado.objects.filter(paquete=paquete)
        .values_list('grado_seccion', flat=True)
    )
    advertencias = []
    if not grados:
        return [], [], ['El paquete no tiene grados asociados.']

    bloques_clase = list(
        BloqueHorario.objects.filter(paquete=paquete, tipo='clase').order_by('dia_semana', 'orden')
    )
    if not bloques_clase:
        return [], [], ['El paquete no tiene bloques de clase definidos.']

    if semilla is not None:
        random.seed(semilla)

    materias = list(
        Materia.objects.filter(grado_seccion__in=grados, activa=True).select_related('docente')
    )
    if not materias:
        return [], [], ['No hay materias activas en los grados del paquete.']

    pineadas = list(
        HorarioClase.objects.filter(materia__grado_seccion__in=grados, pineado=True)
        .select_related('materia')
    )
    pineadas_por_materia = defaultdict(int)
    for hc in pineadas:
        pineadas_por_materia[hc.materia_id] += 1

    aula_fija_por_grado = {
        g: (ConfiguracionGrado.objects.filter(grado_seccion=g).values_list('aula_fija', flat=True).first() or '').strip()
        for g in grados
    }

    # Ocupación por bloque: qué docentes/aulas/grados ya están tomados ahí.
    ocupacion = {b.id: {'docentes': set(), 'aulas': set(), 'grados': set()} for b in bloques_clase}
    for hc in pineadas:
        if hc.bloque_id and hc.bloque_id in ocupacion:
            if hc.materia.docente_id:
                ocupacion[hc.bloque_id]['docentes'].add(hc.materia.docente_id)
            aula = (hc.aula or '').strip()
            if aula:
                ocupacion[hc.bloque_id]['aulas'].add(aula)
            ocupacion[hc.bloque_id]['grados'].add(hc.materia.grado_seccion)

    docentes_ids = {m.docente_id for m in materias if m.docente_id}
    disponibilidad_map = _armar_disponibilidad_map(docentes_ids)

    # Cola de "unidades de bloque" a colocar: una por cada hora académica
    # pendiente (ya descontando lo que quedó pineado).
    cola = []
    for m in materias:
        faltan = max(0, m.horas_academicas - pineadas_por_materia.get(m.id, 0))
        cola.extend([m] * faltan)
    random.shuffle(cola)

    materia_dias = {m.id: set() for m in materias}
    colocadas = []
    no_colocadas_map = {}

    bloques_por_grado = {g: list(bloques_clase) for g in grados}

    for materia in cola:
        grado = materia.grado_seccion
        aula_grado = aula_fija_por_grado.get(grado, '')
        candidatos = [b for b in bloques_por_grado[grado] if grado not in ocupacion[b.id]['grados']]
        random.shuffle(candidatos)

        ubicada = False
        for evitar_repetir_dia in (True, False):
            for bloque in candidatos:
                if grado in ocupacion[bloque.id]['grados']:
                    continue
                if evitar_repetir_dia and bloque.dia_semana in materia_dias[materia.id]:
                    continue
                if materia.docente_id and materia.docente_id in ocupacion[bloque.id]['docentes']:
                    continue
                if materia.docente_id and not _docente_disponible_en_bloque(
                    disponibilidad_map, materia.docente_id, bloque
                ):
                    continue
                if aula_grado and aula_grado in ocupacion[bloque.id]['aulas']:
                    continue

                ocupacion[bloque.id]['grados'].add(grado)
                if materia.docente_id:
                    ocupacion[bloque.id]['docentes'].add(materia.docente_id)
                if aula_grado:
                    ocupacion[bloque.id]['aulas'].add(aula_grado)
                materia_dias[materia.id].add(bloque.dia_semana)
                colocadas.append({'materia': materia, 'bloque': bloque, 'aula': aula_grado})
                ubicada = True
                break
            if ubicada:
                break

        if not ubicada:
            entrada = no_colocadas_map.setdefault(materia.id, {
                'materia': materia, 'horas_faltantes': 0, 'motivo': None,
            })
            entrada['horas_faltantes'] += 1
            if entrada['motivo'] is None:
                if materia.docente_id and disponibilidad_map.get(materia.docente_id):
                    entrada['motivo'] = 'Sin bloques compatibles con la disponibilidad declarada del docente.'
                else:
                    entrada['motivo'] = 'Sin bloques libres por conflicto de docente/aula en el paquete.'

    return colocadas, list(no_colocadas_map.values()), advertencias


# ─────────────────────────────────────────────
# PAQUETES DE HORARIO (rediseño 2026-09)
# ─────────────────────────────────────────────
class PaquetesHorarioView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not IsSecretariaOrAbove().has_permission(request, self):
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)
        qs = PaqueteHorario.objects.select_related('sede', 'creado_por').prefetch_related('grados').all()
        sede = request.query_params.get('sede')
        periodo = request.query_params.get('periodo_escolar')
        estado = request.query_params.get('estado')
        if sede:
            qs = qs.filter(sede_id=sede)
        if periodo:
            qs = qs.filter(periodo_escolar=periodo)
        if estado:
            qs = qs.filter(estado=estado)
        return Response(PaqueteHorarioSerializer(qs, many=True).data)

    def post(self, request):
        if not IsAdminOrAbove().has_permission(request, self):
            return Response({'error': 'No tienes permisos para crear paquetes de horario.'}, status=status.HTTP_403_FORBIDDEN)
        serializer = PaqueteHorarioSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(creado_por=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PaqueteHorarioDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get(self, pk):
        try:
            return PaqueteHorario.objects.select_related('sede', 'creado_por').get(pk=pk)
        except PaqueteHorario.DoesNotExist:
            return None

    def get(self, request, pk):
        if not IsSecretariaOrAbove().has_permission(request, self):
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)
        paquete = self._get(pk)
        if not paquete:
            return Response({'error': 'Paquete no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(PaqueteHorarioSerializer(paquete).data)

    def put(self, request, pk):
        if not IsAdminOrAbove().has_permission(request, self):
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)
        paquete = self._get(pk)
        if not paquete:
            return Response({'error': 'Paquete no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = PaqueteHorarioSerializer(paquete, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        if not IsAdminOrAbove().has_permission(request, self):
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)
        paquete = self._get(pk)
        if not paquete:
            return Response({'error': 'Paquete no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        paquete.delete()
        return Response({'mensaje': 'Paquete eliminado correctamente.'})


class PaqueteHorarioPublicarView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        if not IsAdminOrAbove().has_permission(request, self):
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            paquete = PaqueteHorario.objects.get(pk=pk)
        except PaqueteHorario.DoesNotExist:
            return Response({'error': 'Paquete no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        if not paquete.grados.exists():
            return Response({'error': 'El paquete debe tener al menos un grado para publicarse.'}, status=status.HTTP_400_BAD_REQUEST)
        if not paquete.bloques.exists():
            return Response({'error': 'El paquete debe tener al menos un bloque para publicarse.'}, status=status.HTTP_400_BAD_REQUEST)

        paquete.estado = 'publicado'
        paquete.save(update_fields=['estado', 'actualizado_en'])
        return Response(PaqueteHorarioSerializer(paquete).data)


class PaqueteHorarioGradosView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        if not IsSecretariaOrAbove().has_permission(request, self):
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            paquete = PaqueteHorario.objects.get(pk=pk)
        except PaqueteHorario.DoesNotExist:
            return Response({'error': 'Paquete no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(PaqueteHorarioGradoSerializer(paquete.grados.all(), many=True).data)

    def post(self, request, pk):
        if not IsAdminOrAbove().has_permission(request, self):
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            paquete = PaqueteHorario.objects.get(pk=pk)
        except PaqueteHorario.DoesNotExist:
            return Response({'error': 'Paquete no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        grado_seccion = (request.data.get('grado_seccion') or '').strip()
        if not grado_seccion:
            return Response({'error': 'El campo grado_seccion es requerido.'}, status=status.HTTP_400_BAD_REQUEST)

        # Regla: un grado_seccion no puede estar en dos PaqueteHorario con el
        # mismo periodo_escolar Y sede a la vez, sin importar el estado del
        # otro paquete (ver decisión #2 del rediseño). Se filtra por sede
        # porque el mismo nombre de grado puede repetirse en sedes distintas.
        conflicto = PaqueteHorarioGrado.objects.filter(
            grado_seccion=grado_seccion,
            paquete__periodo_escolar=paquete.periodo_escolar,
            paquete__sede=paquete.sede,
        ).exclude(paquete=paquete).select_related('paquete').first()
        if conflicto:
            return Response(
                {
                    'error': (
                        f"El grado '{grado_seccion}' ya está asignado al paquete "
                        f"'{conflicto.paquete.nombre}' para el periodo {paquete.periodo_escolar}. "
                        "Un grado no puede tener dos paquetes de horario vigentes en el mismo periodo."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if PaqueteHorarioGrado.objects.filter(paquete=paquete, grado_seccion=grado_seccion).exists():
            return Response({'error': 'Ese grado ya está en este paquete.'}, status=status.HTTP_400_BAD_REQUEST)

        pg = PaqueteHorarioGrado.objects.create(paquete=paquete, grado_seccion=grado_seccion)
        return Response(PaqueteHorarioGradoSerializer(pg).data, status=status.HTTP_201_CREATED)


class PaqueteHorarioGradoDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk, grado_pk):
        if not IsAdminOrAbove().has_permission(request, self):
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            pg = PaqueteHorarioGrado.objects.get(pk=grado_pk, paquete_id=pk)
        except PaqueteHorarioGrado.DoesNotExist:
            return Response({'error': 'Grado no encontrado en este paquete.'}, status=status.HTTP_404_NOT_FOUND)
        pg.delete()
        return Response({'mensaje': 'Grado removido del paquete.'})


class PaqueteHorarioBloquesView(APIView):
    """
    GET: lista los bloques del paquete.
    POST: agrega un bloque nuevo al final del día indicado. Recibe
    {dia_semana, duracion_min, tipo}. hora_inicio se calcula automáticamente
    como el hora_fin del último bloque de ese día (o '07:00' si es el primero).
    """
    permission_classes = [permissions.IsAuthenticated]
    HORA_INICIO_JORNADA_DEFAULT = '07:00'

    def get(self, request, pk):
        if not IsSecretariaOrAbove().has_permission(request, self):
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            paquete = PaqueteHorario.objects.get(pk=pk)
        except PaqueteHorario.DoesNotExist:
            return Response({'error': 'Paquete no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(BloqueHorarioSerializer(paquete.bloques.all(), many=True).data)

    def post(self, request, pk):
        if not IsAdminOrAbove().has_permission(request, self):
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            paquete = PaqueteHorario.objects.get(pk=pk)
        except PaqueteHorario.DoesNotExist:
            return Response({'error': 'Paquete no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        dia_semana = request.data.get('dia_semana')
        if dia_semana not in dict(HorarioClase.DIAS):
            return Response({'error': 'dia_semana inválido.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            duracion_min = int(request.data.get('duracion_min', 45))
        except (TypeError, ValueError):
            return Response({'error': 'duracion_min debe ser un entero.'}, status=status.HTTP_400_BAD_REQUEST)
        if duracion_min <= 0:
            return Response({'error': 'duracion_min debe ser mayor a 0.'}, status=status.HTTP_400_BAD_REQUEST)
        tipo = request.data.get('tipo', 'clase')
        if tipo not in dict(BloqueHorario.TIPO_CHOICES):
            return Response({'error': 'tipo inválido.'}, status=status.HTTP_400_BAD_REQUEST)

        fmt = '%H:%M'
        try:
            with transaction.atomic():
                # select_for_update evita que dos POST concurrentes calculen
                # el mismo `orden` y choquen contra el unique_together.
                ultimo = (
                    paquete.bloques.select_for_update()
                    .filter(dia_semana=dia_semana).order_by('orden').last()
                )
                if ultimo:
                    hora_inicio = ultimo.hora_fin
                    orden = ultimo.orden + 1
                else:
                    hora_inicio = datetime.strptime(self.HORA_INICIO_JORNADA_DEFAULT, fmt).time()
                    orden = 1
                hora_fin = (datetime.combine(date.today(), hora_inicio) + timedelta(minutes=duracion_min)).time()

                bloque = BloqueHorario(
                    paquete=paquete, dia_semana=dia_semana, orden=orden,
                    hora_inicio=hora_inicio, hora_fin=hora_fin, tipo=tipo,
                )
                bloque.full_clean()
                bloque.save()
        except DjangoValidationError as e:
            return Response({'error': '; '.join(e.messages)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(BloqueHorarioSerializer(bloque).data, status=status.HTTP_201_CREATED)


class PaqueteHorarioBloqueDetailView(APIView):
    """
    PUT: edita duración/tipo de un bloque. Al cambiar la duración, recalcula
    hora_fin y desplaza en cascada los bloques siguientes del mismo día.
    DELETE: elimina el bloque (no reordena ni desplaza los demás).
    """
    permission_classes = [permissions.IsAuthenticated]

    def _get_bloque(self, pk, bloque_pk):
        try:
            return BloqueHorario.objects.get(pk=bloque_pk, paquete_id=pk)
        except BloqueHorario.DoesNotExist:
            return None

    def put(self, request, pk, bloque_pk):
        if not IsAdminOrAbove().has_permission(request, self):
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)
        bloque = self._get_bloque(pk, bloque_pk)
        if not bloque:
            return Response({'error': 'Bloque no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        tipo = request.data.get('tipo')
        if tipo is not None:
            if tipo not in dict(BloqueHorario.TIPO_CHOICES):
                return Response({'error': 'tipo inválido.'}, status=status.HTTP_400_BAD_REQUEST)
            bloque.tipo = tipo

        duracion_min = request.data.get('duracion_min')
        try:
            with transaction.atomic():
                if duracion_min is not None:
                    try:
                        duracion_min = int(duracion_min)
                    except (TypeError, ValueError):
                        return Response({'error': 'duracion_min debe ser un entero.'}, status=status.HTTP_400_BAD_REQUEST)
                    if duracion_min <= 0:
                        return Response({'error': 'duracion_min debe ser mayor a 0.'}, status=status.HTTP_400_BAD_REQUEST)

                    nueva_hora_fin = (
                        datetime.combine(date.today(), bloque.hora_inicio) + timedelta(minutes=duracion_min)
                    ).time()
                    desplazamiento = (
                        datetime.combine(date.today(), nueva_hora_fin)
                        - datetime.combine(date.today(), bloque.hora_fin)
                    )
                    bloque.hora_fin = nueva_hora_fin
                    bloque.save()

                    if desplazamiento != timedelta(0):
                        siguientes = BloqueHorario.objects.filter(
                            paquete_id=pk, dia_semana=bloque.dia_semana, orden__gt=bloque.orden,
                        ).order_by('orden')
                        for sig in siguientes:
                            sig.hora_inicio = (datetime.combine(date.today(), sig.hora_inicio) + desplazamiento).time()
                            sig.hora_fin = (datetime.combine(date.today(), sig.hora_fin) + desplazamiento).time()
                            sig.save()
                else:
                    bloque.save()
        except DjangoValidationError as e:
            return Response({'error': '; '.join(e.messages)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(BloqueHorarioSerializer(bloque).data)

    def delete(self, request, pk, bloque_pk):
        if not IsAdminOrAbove().has_permission(request, self):
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)
        bloque = self._get_bloque(pk, bloque_pk)
        if not bloque:
            return Response({'error': 'Bloque no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        bloque.delete()
        return Response({'mensaje': 'Bloque eliminado correctamente.'})


# ─────────────────────────────────────────────
# DISPONIBILIDAD DEL DOCENTE (rediseño 2026-09)
# ─────────────────────────────────────────────
class DocenteDisponibilidadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        if not IsSecretariaOrAbove().has_permission(request, self):
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            docente = Docente.objects.get(pk=pk)
        except Docente.DoesNotExist:
            return Response({'error': 'Docente no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(DisponibilidadDocenteSerializer(docente.disponibilidades.all(), many=True).data)

    def post(self, request, pk):
        if not IsAdminOrAbove().has_permission(request, self):
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            docente = Docente.objects.get(pk=pk)
        except Docente.DoesNotExist:
            return Response({'error': 'Docente no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        datos = request.data.copy()
        datos['docente'] = docente.id
        serializer = DisponibilidadDocenteSerializer(data=datos)
        if serializer.is_valid():
            try:
                serializer.save(docente=docente)
            except DjangoValidationError as e:
                return Response({'error': '; '.join(e.messages)}, status=status.HTTP_400_BAD_REQUEST)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class DocenteDisponibilidadDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk, disp_pk):
        if not IsAdminOrAbove().has_permission(request, self):
            return Response({'error': 'Sin permiso.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            disponibilidad = DisponibilidadDocente.objects.get(pk=disp_pk, docente_id=pk)
        except DisponibilidadDocente.DoesNotExist:
            return Response({'error': 'Franja no encontrada.'}, status=status.HTTP_404_NOT_FOUND)
        disponibilidad.delete()
        return Response({'mensaje': 'Franja de disponibilidad eliminada.'})


class GenerarHorarioView(APIView):
    """
    POST /api/academico/horarios/generar/
    Genera automáticamente el horario de TODOS los grados de un
    PaqueteHorario en una sola pasada (así se detectan choques de
    docente/aula entre esos grados dentro de la misma corrida).
    Roles permitidos: director, sistemas, administrador.

    Body: {paquete_id, semilla? }
    Respuesta: {colocadas, no_colocadas, advertencias, snapshot_id}
    """
    permission_classes = [permissions.IsAuthenticated, IsAdminOrAbove]

    def post(self, request):
        if not IsAdminOrAbove().has_permission(request, self):
            return Response(
                {'error': 'No tienes permisos para generar horarios.'},
                status=status.HTTP_403_FORBIDDEN
            )

        paquete_id = request.data.get('paquete_id')
        if not paquete_id:
            return Response({'error': 'El campo paquete_id es requerido.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            paquete = PaqueteHorario.objects.get(pk=paquete_id)
        except PaqueteHorario.DoesNotExist:
            return Response({'error': 'Paquete no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        semilla = request.data.get('semilla', None)
        if semilla is not None:
            semilla = int(semilla)

        reemplazar_existente = bool(request.data.get('reemplazar_existente', False))

        grados = list(paquete.grados.values_list('grado_seccion', flat=True))
        if not grados:
            return Response({'error': 'El paquete no tiene grados asociados.'}, status=status.HTTP_400_BAD_REQUEST)

        colocadas, no_colocadas, advertencias = _ejecutar_algoritmo_paquete(paquete, semilla=semilla)

        if not colocadas and not no_colocadas:
            return Response(
                {'error': 'No se pudo generar el horario.', 'advertencias': advertencias},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        # ── Persistir: borrar clases no pineadas de estos grados, crear las
        # nuevas, y guardar un snapshot para poder deshacer la corrida ──────
        # El chequeo de "ya existe algo que se perdería" y el borrado viven en
        # la MISMA transacción, con select_for_update, para que dos POST
        # concurrentes (doble clic en "Generar") no pasen ambos el chequeo
        # antes de que ninguno haya confirmado — evita horarios duplicados.
        horarios_eliminados_snapshot = []
        creados = []
        with transaction.atomic():
            a_borrar = HorarioClase.objects.select_for_update().filter(
                materia__grado_seccion__in=grados, pineado=False,
            ).select_related('materia')
            if a_borrar.exists() and not reemplazar_existente:
                return Response(
                    {'error': 'Ya existen clases cargadas para uno o más grados de este paquete. Marca "Reemplazar horario existente" para regenerarlo.'},
                    status=status.HTTP_409_CONFLICT,
                )
            for hc in a_borrar:
                horarios_eliminados_snapshot.append({
                    'materia_id': hc.materia_id,
                    'dia_semana': hc.dia_semana,
                    'hora_inicio': hc.hora_inicio.strftime('%H:%M'),
                    'hora_fin': hc.hora_fin.strftime('%H:%M'),
                    'aula': hc.aula,
                    'bloque_id': hc.bloque_id,
                    'pineado': hc.pineado,
                })
            a_borrar.delete()

            for item in colocadas:
                materia = item['materia']
                bloque = item['bloque']
                try:
                    with transaction.atomic():
                        hc = HorarioClase.objects.create(
                            materia=materia,
                            dia_semana=bloque.dia_semana,
                            hora_inicio=bloque.hora_inicio,
                            hora_fin=bloque.hora_fin,
                            aula=item['aula'],
                            bloque=bloque,
                        )
                    creados.append(hc)
                except Exception as e:
                    advertencias.append(f"Error al guardar clase de '{materia.nombre}': {str(e)}")

            snapshot = GeneracionHorarioSnapshot.objects.create(
                paquete=paquete,
                horarios_creados_ids=[hc.id for hc in creados],
                horarios_eliminados=horarios_eliminados_snapshot,
                creado_por=request.user,
            )

        no_colocadas_data = [
            {
                'materia': item['materia'].nombre,
                'materia_id': item['materia'].id,
                'grado': item['materia'].grado_seccion,
                'horas_faltantes': item['horas_faltantes'],
                'motivo': item['motivo'],
            }
            for item in no_colocadas
        ]

        return Response({
            'generado': True,
            'clases_creadas': len(creados),
            'colocadas': HorarioClaseSerializer(creados, many=True).data,
            'no_colocadas': no_colocadas_data,
            'advertencias': list(dict.fromkeys(advertencias)),
            'snapshot_id': snapshot.id,
        }, status=status.HTTP_201_CREATED)


class DeshacerGeneracionHorarioView(APIView):
    """
    POST /api/academico/horarios/generar/deshacer/
    Body: {paquete_id}
    Revierte la última generación (no deshecha aún) de ese paquete: elimina
    los HorarioClase creados en esa corrida y recrea los que había borrado.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdminOrAbove]

    def post(self, request):
        if not IsAdminOrAbove().has_permission(request, self):
            return Response({'error': 'No tienes permisos para deshacer una generación de horario.'}, status=status.HTTP_403_FORBIDDEN)

        paquete_id = request.data.get('paquete_id')
        if not paquete_id:
            return Response({'error': 'El campo paquete_id es requerido.'}, status=status.HTTP_400_BAD_REQUEST)

        snapshot = (
            GeneracionHorarioSnapshot.objects
            .filter(paquete_id=paquete_id, deshecho=False)
            .order_by('-creado_en')
            .first()
        )
        if not snapshot:
            return Response({'error': 'No hay ninguna generación pendiente de deshacer para ese paquete.'}, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            HorarioClase.objects.filter(id__in=snapshot.horarios_creados_ids).delete()

            restaurados = []
            for datos in snapshot.horarios_eliminados:
                try:
                    materia = Materia.objects.get(pk=datos['materia_id'])
                except Materia.DoesNotExist:
                    continue
                hc = HorarioClase.objects.create(
                    materia=materia,
                    dia_semana=datos['dia_semana'],
                    hora_inicio=datos['hora_inicio'],
                    hora_fin=datos['hora_fin'],
                    aula=datos.get('aula', ''),
                    bloque_id=datos.get('bloque_id'),
                    pineado=datos.get('pineado', False),
                )
                restaurados.append(hc)

            snapshot.deshecho = True
            snapshot.save(update_fields=['deshecho'])

        return Response({
            'mensaje': 'Generación de horario deshecha correctamente.',
            'horarios_eliminados_de_la_corrida': len(snapshot.horarios_creados_ids),
            'horarios_restaurados': len(restaurados),
        })


# ─────────────────────────────────────────────
# HISTORIAL DE AUDITORÍA DE NOTAS
# ─────────────────────────────────────────────
class HistorialNotaView(APIView):
    """
    GET /api/academico/notas/<nota_id>/historial/
    Retorna el historial completo de cambios de una nota específica.
    Solo accesible para director y sistemas.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, nota_id):
        # Solo director y sistemas pueden consultar el historial de auditoría
        rol = getattr(getattr(request.user, 'perfil', None), 'rol', '')
        if not request.user.is_superuser and rol not in ('director', 'sistemas'):
            return Response({'error': 'Sin permiso. Se requiere rol director o sistemas.'}, status=403)

        try:
            nota = Nota.objects.get(id=nota_id)
        except Nota.DoesNotExist:
            return Response({'error': 'Nota no encontrada.'}, status=404)

        historial = nota.history.all().order_by('-history_date').values(
            'history_id',
            'history_date',
            'history_type',
            'history_user_id',
            'evaluacion_1',
            'evaluacion_2',
            'evaluacion_3',
            'evaluacion_4',
            'definitiva',
            'observaciones',
        )
        return Response(list(historial))


# ─────────────────────────────────────────────
# LAPSO — DETALLE (GET / PUT / DELETE)
# ─────────────────────────────────────────────
class LapsoDetailView(APIView):
    """GET, PUT, DELETE para un lapso específico."""
    permission_classes = [permissions.IsAuthenticated]

    def _verificar_rol(self, request):
        if request.user.is_superuser:
            return True
        rol = getattr(getattr(request.user, 'perfil', None), 'rol', '')
        return rol in ('director', 'sistemas')

    def get(self, request, pk):
        try:
            lapso = Lapso.objects.get(pk=pk)
        except Lapso.DoesNotExist:
            return Response({'error': 'Lapso no encontrado.'}, status=404)
        return Response(LapsoSerializer(lapso).data)

    def put(self, request, pk):
        if not self._verificar_rol(request):
            return Response({'error': 'Sin permiso.'}, status=403)
        try:
            lapso = Lapso.objects.get(pk=pk)
        except Lapso.DoesNotExist:
            return Response({'error': 'Lapso no encontrado.'}, status=404)
        serializer = LapsoSerializer(lapso, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def delete(self, request, pk):
        """Cierra el lapso (activo=False). No elimina para preservar notas."""
        if not self._verificar_rol(request):
            return Response({'error': 'Sin permiso.'}, status=403)
        try:
            lapso = Lapso.objects.get(pk=pk)
        except Lapso.DoesNotExist:
            return Response({'error': 'Lapso no encontrado.'}, status=404)
        lapso.activo = False
        lapso.save()
        return Response({'mensaje': f'Lapso "{lapso.nombre}" cerrado correctamente.'})


# ─────────────────────────────────────────────
# INCIDENTES DISCIPLINARIOS
# ─────────────────────────────────────────────
class IncidentesListCreateView(APIView):
    """
    GET: lista incidentes. Secretaria+ ve todos (con filtros); docente ve solo
    los de las secciones donde tiene una materia activa asignada.
    POST: crea un incidente (multipart si incluye adjunto).
    """
    permission_classes = [permissions.IsAuthenticated]

    def _grado_seccion_objetivo(self, request):
        return request.data.get('grado_seccion') or request.query_params.get('grado_seccion')

    def get(self, request):
        rol = _get_rol(request)
        qs = IncidenteDisciplinario.objects.select_related('alumno', 'registrado_por').all()

        if not (request.user.is_superuser or IsSecretariaOrAbove().has_permission(request, self)):
            if rol != 'docente':
                return Response({'error': 'No tienes permisos para ver incidentes.'}, status=status.HTTP_403_FORBIDDEN)
            secciones = Materia.objects.filter(
                docente=request.user, activa=True
            ).values_list('grado_seccion', flat=True)
            qs = qs.filter(alumno__grado_seccion__in=list(secciones))

        filterset = IncidenteFilter(request.query_params, queryset=qs)
        if filterset.is_valid():
            qs = filterset.qs

        return Response(IncidenteDisciplinarioSerializer(qs, many=True).data)

    def post(self, request):
        """Roles permitidos: docente (solo alumnos de su sección), secretaria+."""
        alumno_id = request.data.get('alumno_id')
        try:
            alumno = Alumno.objects.get(pk=alumno_id)
        except (Alumno.DoesNotExist, TypeError, ValueError):
            return Response({'error': 'Alumno no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        if not IsSecretariaOrAbove().has_permission(request, self):
            if _get_rol(request) != 'docente' or not _docente_tiene_seccion(request.user, alumno.grado_seccion):
                return Response(
                    {'error': 'No tienes permisos para registrar incidentes de este alumno.'},
                    status=status.HTTP_403_FORBIDDEN
                )

        serializer = IncidenteDisciplinarioSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(registrado_por=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class IncidenteDetailView(APIView):
    """GET de un incidente puntual. Mismo scoping que la lista."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        try:
            incidente = IncidenteDisciplinario.objects.select_related('alumno', 'registrado_por').get(pk=pk)
        except IncidenteDisciplinario.DoesNotExist:
            return Response({'error': 'Incidente no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        if not IsSecretariaOrAbove().has_permission(request, self):
            if _get_rol(request) != 'docente' or not _docente_tiene_seccion(request.user, incidente.alumno.grado_seccion):
                return Response({'error': 'No tienes permisos para ver este incidente.'}, status=status.HTTP_403_FORBIDDEN)

        return Response(IncidenteDisciplinarioSerializer(incidente).data)


# ─────────────────────────────────────────────
# PORTAL DOCENTE — MIS MATERIAS
# ─────────────────────────────────────────────
class DocenteMisMateriasView(APIView):
    """
    GET /api/academico/docente/mis-materias/
    Retorna las materias activas asignadas al docente autenticado.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if _get_rol(request) != 'docente':
            return Response({'error': 'Solo docentes pueden consultar sus materias.'}, status=status.HTTP_403_FORBIDDEN)
        materias = Materia.objects.filter(docente=request.user, activa=True)
        return Response(MateriaDocenteSerializer(materias, many=True).data)


# ─────────────────────────────────────────────
# PORTAL DOCENTE — PRÓXIMAS EVALUACIONES (hero del dashboard)
# ─────────────────────────────────────────────
class DocenteProximasEvaluacionesView(APIView):
    """
    GET /api/academico/docente/proximas-evaluaciones/?limite=5
    Ítems de evaluación (de cualquier plan de evaluación de las materias del
    docente autenticado) con fecha hoy o futura, ordenados por fecha. Solo
    lectura — alimenta el slide "Evaluaciones próximas" del hero del
    dashboard del portal docente.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if _get_rol(request) != 'docente':
            return Response({'error': 'Solo docentes pueden consultar sus evaluaciones.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            limite = int(request.query_params.get('limite', 5))
        except (TypeError, ValueError):
            limite = 5

        hoy = date.today()
        items = (
            ItemEvaluacion.objects
            .filter(
                bloque__plan__materia__docente=request.user,
                fecha__gte=hoy,
            )
            .select_related('bloque', 'bloque__plan__materia')
            .order_by('fecha')[:limite]
        )

        data = [
            {
                'id': item.id,
                'nombre': item.nombre,
                'fecha': item.fecha,
                'materia_id': item.bloque.plan.materia_id,
                'materia_nombre': item.bloque.plan.materia.nombre,
                'bloque_nombre': item.bloque.nombre,
            }
            for item in items
        ]
        return Response(data)


# ─────────────────────────────────────────────
# PORTAL DOCENTE — MI HORARIO (próximas clases)
# ─────────────────────────────────────────────
class DocenteMiHorarioView(APIView):
    """
    GET /api/academico/docente/mi-horario/?limite=5
    Retorna las próximas clases del docente autenticado, ordenadas desde el
    momento actual hacia adelante en la semana (lunes-viernes).
    """
    permission_classes = [permissions.IsAuthenticated]
    DIAS_ORDEN = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes']

    def get(self, request):
        if _get_rol(request) != 'docente':
            return Response({'error': 'Solo docentes pueden consultar su horario.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            limite = int(request.query_params.get('limite', 5))
        except (TypeError, ValueError):
            limite = 5

        horarios = HorarioClase.objects.filter(
            materia__docente=request.user,
            materia__activa=True,
        ).select_related('materia')

        ahora = datetime.now()
        dia_actual_idx = ahora.weekday()  # lunes=0 ... domingo=6
        hora_actual = ahora.time()

        def posicion_en_semana(h):
            """Distancia (en días) desde hoy hasta la próxima ocurrencia de este horario."""
            dia_idx = self.DIAS_ORDEN.index(h.dia_semana)
            delta_dias = (dia_idx - dia_actual_idx) % 7
            if delta_dias == 0 and h.hora_inicio < hora_actual:
                delta_dias = 7  # ya pasó hoy, va a la semana siguiente
            return (delta_dias, h.hora_inicio)

        proximos = sorted(horarios, key=posicion_en_semana)[:limite]
        return Response(HorarioClaseSerializer(proximos, many=True).data)


# ─────────────────────────────────────────────
# PORTAL DOCENTE — ALERTAS DE RIESGO (hero del dashboard)
# ─────────────────────────────────────────────
class AlertasRiesgoDocenteView(APIView):
    """
    GET /api/academico/docente/alertas-riesgo/
    AlertaRendimiento activas de las materias del docente autenticado.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if _get_rol(request) != 'docente':
            return Response({'error': 'Solo docentes pueden consultar sus alertas.'}, status=status.HTTP_403_FORBIDDEN)
        return Response(calcular_alertas_riesgo_docente(request.user))


# ─────────────────────────────────────────────
# PORTAL DOCENTE — RADAR DE CIERRE DE LAPSO
# ─────────────────────────────────────────────
class RadarCierreLapsoView(APIView):
    """
    GET /api/academico/docente/radar-cierre-lapso/?dias_anticipacion=5
    Materias sin plan de evaluación e ítems vencidos/por vencer con alumnos
    sin nota cargada, del lapso activo del docente autenticado.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if _get_rol(request) != 'docente':
            return Response({'error': 'Solo docentes pueden consultar el radar de cierre.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            dias_anticipacion = int(request.query_params.get('dias_anticipacion', 5))
        except (TypeError, ValueError):
            dias_anticipacion = 5

        return Response(calcular_radar_cierre_lapso(request.user, dias_anticipacion))


# ─────────────────────────────────────────────
# PORTAL DOCENTE — COMPARACIÓN DE SECCIÓN
# ─────────────────────────────────────────────
class ComparacionMateriaView(APIView):
    """
    GET /api/academico/docente/comparacion-materia/<materia_id>/?lapso_id=
    % de aprobados de la sección del docente vs. el promedio de otras
    secciones que dictan la misma materia (mismo nombre), en el mismo lapso.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, materia_id):
        if _get_rol(request) != 'docente':
            return Response({'error': 'Solo docentes pueden consultar esta comparación.'}, status=status.HTTP_403_FORBIDDEN)

        lapso_id = request.query_params.get('lapso_id')
        if not lapso_id:
            return Response({'error': 'Se requiere el parámetro lapso_id.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            materia = Materia.objects.get(pk=materia_id)
        except Materia.DoesNotExist:
            return Response({'error': 'Materia no encontrada.'}, status=status.HTTP_404_NOT_FOUND)

        if materia.docente_id != request.user.id:
            return Response({'error': 'No tienes permisos para consultar esta materia.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            lapso = Lapso.objects.get(pk=lapso_id)
        except Lapso.DoesNotExist:
            return Response({'error': 'Lapso no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        return Response(calcular_comparacion_materia(materia, lapso))


# ─────────────────────────────────────────────
# PORTAL DOCENTE — MI PERFIL
# ─────────────────────────────────────────────
class DocenteMiPerfilView(APIView):
    """
    GET   /api/academico/docente/mi-perfil/ — perfil del docente autenticado.
    PATCH /api/academico/docente/mi-perfil/ — edita first_name/last_name/email.
    username, rol y foto no se pueden editar desde este endpoint (la foto
    tiene endpoint propio: DocenteFotoPerfilView).
    """
    permission_classes = [permissions.IsAuthenticated]
    CAMPOS_EDITABLES = ('first_name', 'last_name', 'email')

    def get(self, request):
        if _get_rol(request) != 'docente':
            return Response({'error': 'Solo docentes pueden consultar este perfil.'}, status=status.HTTP_403_FORBIDDEN)
        return Response(PerfilDocenteSerializer(request.user).data)

    def patch(self, request):
        if _get_rol(request) != 'docente':
            return Response({'error': 'Solo docentes pueden editar este perfil.'}, status=status.HTTP_403_FORBIDDEN)

        for campo in self.CAMPOS_EDITABLES:
            if campo in request.data:
                setattr(request.user, campo, request.data[campo])
        request.user.save(update_fields=list(self.CAMPOS_EDITABLES))

        return Response(PerfilDocenteSerializer(request.user).data)


class DocenteFotoPerfilView(APIView):
    """
    POST /api/academico/docente/mi-perfil/foto/ (multipart, campo 'foto')
    Reemplaza la foto de perfil del docente autenticado.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if _get_rol(request) != 'docente':
            return Response({'error': 'Solo docentes pueden actualizar su foto de perfil.'}, status=status.HTTP_403_FORBIDDEN)

        if not request.data.get('foto'):
            return Response({'error': "Debes adjuntar un archivo en el campo 'foto'."}, status=status.HTTP_400_BAD_REQUEST)

        perfil = request.user.perfil
        serializer = PerfilFotoSerializer(perfil, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(PerfilDocenteSerializer(request.user).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ─────────────────────────────────────────────
# EVENTOS DE CALENDARIO (personales, cualquier usuario autenticado)
# ─────────────────────────────────────────────
class EventosCalendarioView(APIView):
    """
    GET  /api/academico/eventos-calendario/?mes=8&anio=2026 — eventos propios del mes.
    POST /api/academico/eventos-calendario/ — crea un evento propio.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = EventoCalendario.objects.filter(propietario=request.user)
        mes = request.query_params.get('mes')
        anio = request.query_params.get('anio')
        mes_int = anio_int = None
        if mes and anio:
            try:
                mes_int, anio_int = int(mes), int(anio)
                qs = qs.filter(fecha__month=mes_int, fecha__year=anio_int)
            except ValueError:
                return Response({'error': 'mes/anio inválidos.'}, status=status.HTTP_400_BAD_REQUEST)

        data = list(EventoCalendarioSerializer(qs, many=True).data)

        # Sincronización de solo lectura: las fechas de evaluación del Plan
        # de Evaluación del docente se muestran como eventos en el calendario
        # (no son EventoCalendario reales, así que no se pueden borrar desde
        # aquí — se editan desde el Plan de Evaluación de la materia).
        if _get_rol(request) == 'docente':
            items_qs = ItemEvaluacion.objects.filter(
                bloque__plan__materia__docente=request.user,
                fecha__isnull=False,
            ).select_related('bloque', 'bloque__plan__materia')
            if mes_int and anio_int:
                items_qs = items_qs.filter(fecha__month=mes_int, fecha__year=anio_int)

            for item in items_qs:
                data.append({
                    'id': f'evaluacion-{item.id}',
                    'titulo': f'{item.nombre} — {item.bloque.plan.materia.nombre}',
                    'fecha': item.fecha,
                    'hora': None,
                    'descripcion': '',
                    'tipo': 'evaluacion',
                    'tipo_label': 'Evaluación',
                    'solo_lectura': True,
                })

        data.sort(key=lambda e: (str(e['fecha']), e['hora'] or ''))
        return Response(data)

    def post(self, request):
        serializer = EventoCalendarioSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(propietario=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class EventoCalendarioDetailView(APIView):
    """DELETE /api/academico/eventos-calendario/<pk>/ — solo el propietario del evento."""
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, pk):
        try:
            evento = EventoCalendario.objects.get(pk=pk, propietario=request.user)
        except EventoCalendario.DoesNotExist:
            return Response({'error': 'Evento no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        evento.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ─────────────────────────────────────────────
# MATERIAL DE ESTUDIO
# ─────────────────────────────────────────────
class MaterialEstudioListCreateView(APIView):
    """
    GET: lista material de estudio, filtrable por ?materia_id=. Cualquier autenticado.
    POST (multipart): crea material nuevo. Roles permitidos: docente dueño de la
    materia (Materia.docente = request.user), o secretaria+.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = MaterialEstudio.objects.select_related('materia', 'publicado_por').all()
        materia_id = request.query_params.get('materia_id')
        if materia_id:
            try:
                materia = Materia.objects.get(pk=materia_id)
            except (Materia.DoesNotExist, TypeError, ValueError):
                return Response({'error': 'Materia no encontrada.'}, status=status.HTTP_404_NOT_FOUND)

            if not IsSecretariaOrAbove().has_permission(request, self):
                if _get_rol(request) != 'docente' or materia.docente_id != request.user.id:
                    return Response(
                        {'error': 'No tienes permisos para consultar el material de esta materia.'},
                        status=status.HTTP_403_FORBIDDEN
                    )
            qs = qs.filter(materia_id=materia_id)
        elif not IsSecretariaOrAbove().has_permission(request, self):
            # Sin materia_id un docente vería material de todas las materias
            # del colegio — se restringe el listado a sus propias materias
            # en vez de exigir el parámetro, para no romper un listado general.
            if _get_rol(request) != 'docente':
                return Response(
                    {'error': 'No tienes permisos para consultar material de estudio.'},
                    status=status.HTTP_403_FORBIDDEN
                )
            qs = qs.filter(materia__docente=request.user)
        return Response(MaterialEstudioSerializer(qs, many=True).data)

    def post(self, request):
        materia_id = request.data.get('materia_id')
        try:
            materia = Materia.objects.get(pk=materia_id)
        except (Materia.DoesNotExist, TypeError, ValueError):
            return Response({'error': 'Materia no encontrada.'}, status=status.HTTP_404_NOT_FOUND)

        if not IsSecretariaOrAbove().has_permission(request, self):
            if _get_rol(request) != 'docente' or materia.docente_id != request.user.id:
                return Response(
                    {'error': 'No tienes permisos para publicar material en esta materia.'},
                    status=status.HTTP_403_FORBIDDEN
                )

        serializer = MaterialEstudioSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(publicado_por=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class MaterialEstudioDetailView(APIView):
    """GET de un material puntual. DELETE: docente dueño de la materia o secretaria+."""
    permission_classes = [permissions.IsAuthenticated]

    def _get_material(self, pk):
        try:
            return MaterialEstudio.objects.select_related('materia', 'publicado_por').get(pk=pk)
        except MaterialEstudio.DoesNotExist:
            return None

    def get(self, request, pk):
        material = self._get_material(pk)
        if not material:
            return Response({'error': 'Material no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        if not IsSecretariaOrAbove().has_permission(request, self):
            if _get_rol(request) != 'docente' or material.materia.docente_id != request.user.id:
                return Response(
                    {'error': 'No tienes permisos para consultar este material.'},
                    status=status.HTTP_403_FORBIDDEN
                )

        return Response(MaterialEstudioSerializer(material).data)

    def delete(self, request, pk):
        material = self._get_material(pk)
        if not material:
            return Response({'error': 'Material no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        if not IsSecretariaOrAbove().has_permission(request, self):
            if _get_rol(request) != 'docente' or material.materia.docente_id != request.user.id:
                return Response(
                    {'error': 'No tienes permisos para eliminar este material.'},
                    status=status.HTTP_403_FORBIDDEN
                )

        material.delete()
        return Response({'mensaje': 'Material eliminado correctamente.'}, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# RENDIMIENTO (Fase 4 — Seguimiento Gráfico, panel admin)
# ─────────────────────────────────────────────
class RendimientoAlumnoView(APIView):
    """GET — promedios por lapso/materia + asistencia de un alumno.
    Roles: director, sistemas, administrador."""
    permission_classes = [permissions.IsAuthenticated, IsAdminOrAbove]

    def get(self, request, alumno_id):
        try:
            alumno = Alumno.objects.get(pk=alumno_id)
        except Alumno.DoesNotExist:
            return Response({'error': 'Alumno no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(calcular_rendimiento_alumno(alumno))


class RendimientoSeccionView(APIView):
    """GET — % de aprobados por materia de una sección (mapa de calor).
    Roles: director, sistemas, administrador."""
    permission_classes = [permissions.IsAuthenticated, IsAdminOrAbove]

    def get(self, request, grado_seccion):
        lapso_id = request.query_params.get('lapso_id')
        lapso = None
        if lapso_id:
            try:
                lapso = Lapso.objects.get(pk=lapso_id)
            except Lapso.DoesNotExist:
                return Response({'error': 'Lapso no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(calcular_rendimiento_seccion(grado_seccion, lapso=lapso))


class AlertasRendimientoView(APIView):
    """GET — alumnos en riesgo académico (alertas activas).
    Roles: director, sistemas, administrador."""
    permission_classes = [permissions.IsAuthenticated, IsAdminOrAbove]

    def get(self, request):
        alertas = AlertaRendimiento.objects.filter(activa=True).select_related(
            'alumno', 'materia', 'lapso'
        ).order_by('alumno__grado_seccion', 'alumno__apellido')

        data = [{
            'id': a.id,
            'alumno_id': a.alumno_id,
            'alumno': f"{a.alumno.nombre} {a.alumno.apellido}",
            'grado_seccion': a.alumno.grado_seccion,
            'materia_id': a.materia_id,
            'materia': a.materia.nombre if a.materia else None,
            'lapso': a.lapso.nombre,
            'promedio_actual': float(a.promedio_actual),
            'umbral_minimo': float(a.umbral_minimo),
            'created_at': a.created_at,
        } for a in alertas]

        return Response(data)


# ─────────────────────────────────────────────
# PLAN DE EVALUACIÓN (sistema nuevo, opcional por materia+lapso)
# ─────────────────────────────────────────────
def _sync_plan_bloques(plan, bloques_data):
    """
    Sincroniza bloques+items de un PlanEvaluacion con el payload recibido
    (usado tanto por POST como por PATCH de PlanEvaluacionView):
      - Un bloque/item con 'id' que coincide con uno existente se ACTUALIZA
        en el mismo registro (conserva su PK).
      - Un bloque/item sin 'id' (o con un 'id' que ya no existe) se CREA.
      - Un bloque/item existente que NO aparece en el payload se ELIMINA.
    Se eligió sincronización por id (en vez de borrar-y-recrear todo en cada
    PATCH) para no destruir las notas ya cargadas (NotaItemEvaluacion cuelga
    de ItemEvaluacion): mientras el frontend reenvíe los ids de los items que
    no cambiaron, esas notas sobreviven a la edición del plan.
    """
    bloques_existentes = {b.id: b for b in plan.bloques.prefetch_related('items').all()}
    bloques_vistos = set()

    for orden_b, b_data in enumerate(bloques_data):
        b_id = b_data.get('id')
        items_data = b_data.get('items', [])
        campos_bloque = {
            'nombre': b_data['nombre'],
            'total_puntos': b_data.get('total_puntos'),
            'modo': b_data.get('modo') or 'puntos',
            'orden': b_data.get('orden', orden_b),
        }

        if b_id and b_id in bloques_existentes:
            bloque = bloques_existentes[b_id]
            for campo, valor in campos_bloque.items():
                setattr(bloque, campo, valor)
            bloque.save()
            bloques_vistos.add(b_id)
            items_existentes = {i.id: i for i in bloque.items.all()}
        else:
            bloque = BloqueEvaluacion.objects.create(plan=plan, **campos_bloque)
            items_existentes = {}

        items_vistos = set()
        for orden_i, i_data in enumerate(items_data):
            i_id = i_data.get('id')
            campos_item = {
                'nombre': i_data['nombre'],
                'fecha': i_data.get('fecha'),
                'valor_maximo': i_data.get('valor_maximo'),
                'orden': i_data.get('orden', orden_i),
            }
            if i_id and i_id in items_existentes:
                item = items_existentes[i_id]
                for campo, valor in campos_item.items():
                    setattr(item, campo, valor)
                item.save()
                items_vistos.add(i_id)
            else:
                ItemEvaluacion.objects.create(bloque=bloque, **campos_item)

        # Items que ya no vienen en el payload: se eliminan (junto con sus
        # NotaItemEvaluacion vía CASCADE — el item deja de existir en el plan).
        for old_id, old_item in items_existentes.items():
            if old_id not in items_vistos:
                old_item.delete()

    for old_id, old_bloque in bloques_existentes.items():
        if old_id not in bloques_vistos:
            old_bloque.delete()


class PlanEvaluacionView(APIView):
    """
    GET/POST/PATCH /api/academico/docente/plan-evaluacion/?materia_id=&lapso_id=

    GET   : devuelve el plan (con bloques e items anidados) o `null` (200)
            si la materia+lapso todavía no tiene plan configurado.
    POST  : crea el plan con su árbol completo de bloques+items en un solo
            payload. 409 si ya existe un plan para esa materia+lapso.
    PATCH : sincroniza bloques+items del plan existente (upsert por 'id' +
            elimina lo que no venga en el payload — ver _sync_plan_bloques).
            404 si el plan aún no existe (usar POST primero).

    Permiso (mismo criterio que NotasGradoView/MaterialEstudioListCreateView):
    secretaria+ sin restricciones, o docente dueño de la materia
    (Materia.docente_id == request.user.id).
    """
    permission_classes = [permissions.IsAuthenticated]

    def _resolver_materia_lapso(self, request):
        """Retorna (materia, lapso, error_response). error_response es None
        si todo resolvió correctamente."""
        materia_id = request.query_params.get('materia_id')
        lapso_id   = request.query_params.get('lapso_id')
        if not materia_id or not lapso_id:
            return None, None, Response(
                {'error': 'Se requieren los parámetros materia_id y lapso_id.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        try:
            materia = Materia.objects.get(pk=materia_id)
        except Materia.DoesNotExist:
            return None, None, Response({'error': 'Materia no encontrada.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            lapso = Lapso.objects.get(pk=lapso_id)
        except Lapso.DoesNotExist:
            return None, None, Response({'error': 'Lapso no encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        return materia, lapso, None

    def _verificar_permiso(self, request, materia):
        if IsSecretariaOrAbove().has_permission(request, self):
            return None
        if _get_rol(request) != 'docente' or materia.docente_id != request.user.id:
            return Response(
                {'error': 'No tienes permisos sobre el plan de evaluación de esta materia.'},
                status=status.HTTP_403_FORBIDDEN
            )
        return None

    def _verificar_lapso_activo(self, lapso):
        if not lapso.activo:
            return Response(
                {'error': 'El lapso está cerrado — no se puede crear ni editar el plan de evaluación.'},
                status=status.HTTP_409_CONFLICT
            )
        return None

    def get(self, request):
        materia, lapso, error = self._resolver_materia_lapso(request)
        if error:
            return error

        # GET también valida ownership: el plan expone la estructura completa
        # de evaluación de la materia (bloques, ítems, valores máximos) — un
        # docente no debe poder leer la de una materia ajena solo cambiando
        # materia_id en la URL.
        error = self._verificar_permiso(request, materia)
        if error:
            return error

        plan = PlanEvaluacion.objects.filter(materia=materia, lapso=lapso).prefetch_related(
            'bloques__items'
        ).first()
        if plan is None:
            # Decisión documentada: 200 con body null (no 404) — el frontend
            # trata "sin plan configurado" como un estado válido, no un error.
            return Response(None, status=status.HTTP_200_OK)
        return Response(PlanEvaluacionSerializer(plan).data)

    def post(self, request):
        materia, lapso, error = self._resolver_materia_lapso(request)
        if error:
            return error

        error = self._verificar_permiso(request, materia)
        if error:
            return error

        error = self._verificar_lapso_activo(lapso)
        if error:
            return error

        if PlanEvaluacion.objects.filter(materia=materia, lapso=lapso).exists():
            return Response(
                {'error': 'Ya existe un plan de evaluación para esta materia y lapso. Use PATCH para editarlo.'},
                status=status.HTTP_409_CONFLICT
            )

        serializer = PlanEvaluacionInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        plan = PlanEvaluacion.objects.create(materia=materia, lapso=lapso)
        _sync_plan_bloques(plan, serializer.validated_data['bloques'])

        plan = PlanEvaluacion.objects.filter(pk=plan.pk).prefetch_related('bloques__items').first()
        return Response(PlanEvaluacionSerializer(plan).data, status=status.HTTP_201_CREATED)

    def patch(self, request):
        materia, lapso, error = self._resolver_materia_lapso(request)
        if error:
            return error

        error = self._verificar_permiso(request, materia)
        if error:
            return error

        error = self._verificar_lapso_activo(lapso)
        if error:
            return error

        plan = PlanEvaluacion.objects.filter(materia=materia, lapso=lapso).first()
        if plan is None:
            return Response(
                {'error': 'No existe un plan de evaluación para esta materia y lapso. Use POST para crearlo.'},
                status=status.HTTP_404_NOT_FOUND
            )

        serializer = PlanEvaluacionInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        _sync_plan_bloques(plan, serializer.validated_data['bloques'])

        plan = PlanEvaluacion.objects.filter(pk=plan.pk).prefetch_related('bloques__items').first()
        return Response(PlanEvaluacionSerializer(plan).data, status=status.HTTP_200_OK)


class PlanEvaluacionNotasView(APIView):
    """
    GET/POST /api/academico/docente/plan-evaluacion/notas/?materia_id=&lapso_id=

    GET : por cada alumno del grado_seccion de la materia, devuelve el
          desglose de bloques (con su total ya calculado según las reglas de
          negocio — ver services.calcular_plan_notas) y el total final de la
          materia, incluyendo el aporte de otras materias con
          aporta_a_todas_las_materias=True del mismo grado_seccion+lapso.
          404 si la materia+lapso no tiene PlanEvaluacion configurado.
    POST: guarda notas por ítem en bloque. Body:
          {materia_id, lapso_id, notas: [{item_id, alumno_id, valor_numerico|valor_letra}]}
          Mismo estilo bulk que NotasGradoView/AsistenciaView (reporta
          guardadas/errores en vez de fallar todo el request).

    Permiso: igual que PlanEvaluacionView (secretaria+ o docente dueño).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        materia_id = request.query_params.get('materia_id')
        lapso_id   = request.query_params.get('lapso_id')
        if not materia_id or not lapso_id:
            return Response(
                {'error': 'Se requieren los parámetros materia_id y lapso_id.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            materia = Materia.objects.get(pk=materia_id)
        except Materia.DoesNotExist:
            return Response({'error': 'Materia no encontrada.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            lapso = Lapso.objects.get(pk=lapso_id)
        except Lapso.DoesNotExist:
            return Response({'error': 'Lapso no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        # Mismo criterio de ownership que PlanEvaluacionView: esto expone
        # notas reales de alumnos, no solo estructura — un docente no debe
        # poder leer las de una materia que no es suya.
        if not IsSecretariaOrAbove().has_permission(request, self):
            if _get_rol(request) != 'docente' or materia.docente_id != request.user.id:
                return Response(
                    {'error': 'No tienes permisos para consultar las notas de esta materia.'},
                    status=status.HTTP_403_FORBIDDEN
                )

        plan, alumnos_data = calcular_plan_notas(materia, lapso)
        if plan is None:
            return Response(
                {'error': 'No hay un plan de evaluación configurado para esta materia y lapso.'},
                status=status.HTTP_404_NOT_FOUND
            )

        return Response({
            'plan_id':          plan.id,
            'materia_id':       materia.id,
            'materia_nombre':   materia.nombre,
            'tipo_evaluacion':  materia.tipo_evaluacion,
            'lapso_id':         lapso.id,
            'lapso_nombre':     str(lapso),
            'alumnos':          alumnos_data,
        })

    def post(self, request):
        serializer = NotaItemBulkSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        datos      = serializer.validated_data
        materia_id = datos['materia_id']
        lapso_id   = datos['lapso_id']
        notas_data = datos['notas']

        try:
            materia = Materia.objects.get(pk=materia_id)
        except Materia.DoesNotExist:
            return Response({'error': 'Materia no encontrada.'}, status=status.HTTP_404_NOT_FOUND)

        if not IsSecretariaOrAbove().has_permission(request, self):
            if _get_rol(request) != 'docente' or materia.docente_id != request.user.id:
                return Response(
                    {'error': 'No tienes permisos para registrar notas en esta materia.'},
                    status=status.HTTP_403_FORBIDDEN
                )

        try:
            lapso = Lapso.objects.get(pk=lapso_id)
        except Lapso.DoesNotExist:
            return Response({'error': 'Lapso no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        if not lapso.activo:
            return Response(
                {'error': 'El lapso está cerrado — no se pueden registrar ni editar notas.'},
                status=status.HTTP_409_CONFLICT
            )

        item_ids   = [item['item_id'] for item in notas_data]
        alumno_ids = [item['alumno_id'] for item in notas_data]
        items_map  = {
            i.id: i for i in ItemEvaluacion.objects.filter(pk__in=item_ids).select_related(
                'bloque__plan'
            )
        }
        alumnos_map = {a.id: a for a in Alumno.objects.filter(pk__in=alumno_ids)}

        guardadas = []
        errores   = []

        # Igual que NotasGradoView: todo el bloque de guardado corre en una
        # única transacción para evitar guardados parciales del plan si una
        # fila falla a mitad de camino.
        with transaction.atomic():
            for item_data in notas_data:
                item_id   = item_data['item_id']
                alumno_id = item_data['alumno_id']

                item = items_map.get(item_id)
                if item is None:
                    errores.append({'item_id': item_id, 'alumno_id': alumno_id, 'error': 'Ítem no encontrado.'})
                    continue

                alumno = alumnos_map.get(alumno_id)
                if alumno is None:
                    errores.append({'item_id': item_id, 'alumno_id': alumno_id, 'error': 'Alumno no encontrado.'})
                    continue

                # El item debe pertenecer al plan de la materia/lapso solicitados
                # — evita que, vía item_id, se escriban notas de otra materia.
                if item.bloque.plan.materia_id != materia.id or item.bloque.plan.lapso_id != lapso.id:
                    errores.append({
                        'item_id': item_id, 'alumno_id': alumno_id,
                        'error': 'El ítem no pertenece al plan de evaluación de esta materia/lapso.',
                    })
                    continue

                nota_item, _ = NotaItemEvaluacion.objects.update_or_create(
                    item=item,
                    alumno=alumno,
                    defaults={
                        'valor_numerico': item_data.get('valor_numerico'),
                        'valor_letra':    item_data.get('valor_letra'),
                    }
                )
                guardadas.append({
                    'item_id':        item.id,
                    'alumno_id':      alumno.id,
                    'valor_numerico': nota_item.valor_numerico,
                    'valor_letra':    nota_item.valor_letra,
                })

        return Response({
            'guardadas': guardadas,
            'errores':   errores,
        }, status=status.HTTP_200_OK)
