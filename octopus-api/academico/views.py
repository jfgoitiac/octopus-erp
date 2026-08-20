from collections import defaultdict
from datetime import date, datetime

from django.db import transaction
from django.db.models import Q
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.serializers import PerfilDocenteSerializer, PerfilFotoSerializer
from secretaria.models import Alumno, ConfiguracionSistema
from .filters import AsistenciaFilter, IncidenteFilter, NotaFilter
from .models import (
    AlertaRendimiento,
    Asistencia,
    BloqueEvaluacion,
    EventoCalendario,
    HorarioClase,
    IncidenteDisciplinario,
    ItemEvaluacion,
    Lapso,
    Materia,
    MaterialEstudio,
    Nota,
    NotaItemEvaluacion,
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
    PlanEvaluacionInputSerializer,
    PlanEvaluacionSerializer,
)


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
    """Permite acceso a director, sistemas y administrador."""

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


class IsSecretariaOrAbove(permissions.BasePermission):
    """Permite acceso a secretaria, director, sistemas y administrador."""

    ROLES_PERMITIDOS = ['director', 'sistemas', 'administrador', 'secretaria']

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
class HorariosView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        """
        Retorna el horario semanal de un grado, agrupado por día.
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

        # Agrupar por día de la semana
        dias_orden = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes']
        agrupado   = defaultdict(list)
        for h in horarios:
            agrupado[h.dia_semana].append(HorarioClaseSerializer(h).data)

        resultado = {
            dia: agrupado.get(dia, []) for dia in dias_orden
        }
        return Response(resultado)

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


def _calcular_bloques(hora_inicio_str, hora_fin_str, duracion_min, recreo_hora_str, recreo_duracion_min):
    """
    Calcula la lista de bloques horarios disponibles en el día,
    excluyendo el bloque de recreo.
    Retorna: [{'inicio': 'HH:MM', 'fin': 'HH:MM'}, ...]
    """
    fmt = '%H:%M'
    inicio = datetime.strptime(hora_inicio_str, fmt)
    fin    = datetime.strptime(hora_fin_str, fmt)
    recreo_inicio = datetime.strptime(recreo_hora_str, fmt)
    recreo_fin    = recreo_inicio + timedelta(minutes=recreo_duracion_min)
    duracion      = timedelta(minutes=duracion_min)

    bloques = []
    cursor  = inicio
    while cursor + duracion <= fin:
        bloque_fin = cursor + duracion
        # Omitir bloques que se solapen con el recreo
        solapa = cursor < recreo_fin and bloque_fin > recreo_inicio
        if not solapa:
            bloques.append({
                'inicio': cursor.strftime(fmt),
                'fin':    bloque_fin.strftime(fmt),
            })
        # Si el cursor está antes del recreo y el bloque llegaría al recreo, saltar al final del recreo
        elif cursor < recreo_inicio:
            cursor = recreo_fin
            continue
        cursor += duracion

    return bloques


def _ejecutar_algoritmo(grado_seccion, config):
    """
    Algoritmo de distribución de materias en la grilla horaria.
    Cada materia se asigna exactamente materia.horas_academicas veces en la semana
    (1 hora académica = 1 bloque de 45 min).
    Retorna (asignaciones, advertencias).
    asignaciones: [{'materia': <Materia>, 'dia': str, 'bloque': {'inicio': str, 'fin': str}}]
    """
    materias = list(Materia.objects.filter(grado_seccion=grado_seccion, activa=True))
    if not materias:
        return [], ['No hay materias activas para este grado.']

    dias    = config.get('dias', ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'])
    bloques = _calcular_bloques(
        config['hora_inicio'],
        config['hora_fin'],
        config['duracion_clase_min'],
        config['recreo_hora'],
        config['recreo_duracion_min'],
    )

    if not bloques:
        return [], ['No se pudieron calcular bloques horarios con la configuración dada.']

    # Índice de conflictos de docentes en otros grados: {(docente_id, dia, hora_inicio): True}
    horarios_otros = HorarioClase.objects.exclude(
        materia__grado_seccion=grado_seccion
    ).select_related('materia')
    conflictos_docente = {}
    for h in horarios_otros:
        if h.materia.docente_id:
            conflictos_docente[(h.materia.docente_id, h.dia_semana, str(h.hora_inicio)[:5])] = True

    random.seed(42)

    # Grilla: dia -> [bloques disponibles] (copia por día)
    grilla = {dia: list(bloques) for dia in dias}

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
                # Verificar conflicto de docente
                if materia.docente_id:
                    clave = (materia.docente_id, dia, bloque['inicio'])
                    if conflictos_docente.get(clave):
                        advertencias.append(
                            f"Conflicto de docente: '{materia.nombre}' el {dia} a las {bloque['inicio']} — se intentará otro bloque."
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
            advertencias.append(
                f"No se pudo ubicar todas las horas de '{materia.nombre}' "
                f"({materia.horas_academicas} h/sem) por falta de bloques o conflictos de docente."
            )

    return asignaciones, advertencias


class GenerarHorarioView(APIView):
    """
    POST /api/academico/horarios/generar/
    Genera automáticamente el horario de un grado usando un algoritmo de
    constraint satisfaction con distribución equilibrada de materias.
    Roles permitidos: director, sistemas, administrador.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdminOrAbove]

    def post(self, request):
        if not IsAdminOrAbove().has_permission(request, self):
            return Response(
                {'error': 'No tienes permisos para generar horarios.'},
                status=status.HTTP_403_FORBIDDEN
            )

        # ── Validar body ──────────────────────────────────────────────────────
        grado_seccion        = request.data.get('grado_seccion', '').strip()
        horas_por_dia        = request.data.get('horas_por_dia', 6)
        hora_inicio          = request.data.get('hora_inicio', '07:00')
        hora_fin             = request.data.get('hora_fin', '13:00')
        duracion_clase_min   = int(request.data.get('duracion_clase_min', 60))
        dias                 = request.data.get('dias', ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'])
        recreo_hora          = request.data.get('recreo_hora', '09:00')
        recreo_duracion_min  = int(request.data.get('recreo_duracion_min', 20))
        reemplazar_existente = request.data.get('reemplazar_existente', False)

        if not grado_seccion:
            return Response(
                {'error': 'El campo grado_seccion es requerido.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # ── Verificar si ya existe horario ────────────────────────────────────
        tiene_horario = HorarioClase.objects.filter(
            materia__grado_seccion=grado_seccion,
            materia__activa=True,
        ).exists()

        if tiene_horario and not reemplazar_existente:
            return Response(
                {
                    'error': f"El grado '{grado_seccion}' ya tiene un horario generado. "
                             "Activa 'reemplazar_existente' para sobreescribirlo."
                },
                status=status.HTTP_409_CONFLICT
            )

        # ── Ejecutar algoritmo ────────────────────────────────────────────────
        config = {
            'hora_inicio':         hora_inicio,
            'hora_fin':            hora_fin,
            'duracion_clase_min':  duracion_clase_min,
            'dias':                dias,
            'recreo_hora':         recreo_hora,
            'recreo_duracion_min': recreo_duracion_min,
        }

        asignaciones, advertencias = _ejecutar_algoritmo(grado_seccion, config)

        if not asignaciones:
            return Response(
                {
                    'error': 'No se pudo generar el horario.',
                    'advertencias': advertencias,
                },
                status=status.HTTP_422_UNPROCESSABLE_ENTITY
            )

        # ── Persistir resultado ───────────────────────────────────────────────
        if reemplazar_existente and tiene_horario:
            HorarioClase.objects.filter(
                materia__grado_seccion=grado_seccion
            ).delete()

        creados = []
        for asig in asignaciones:
            try:
                hc = HorarioClase.objects.create(
                    materia    = asig['materia'],
                    dia_semana = asig['dia'],
                    hora_inicio= asig['bloque']['inicio'],
                    hora_fin   = asig['bloque']['fin'],
                    aula       = '',
                )
                creados.append(hc)
            except Exception as e:
                advertencias.append(f"Error al guardar clase de '{asig['materia'].nombre}': {str(e)}")

        # Deduplicar advertencias
        advertencias_unicas = list(dict.fromkeys(advertencias))

        return Response({
            'generado':       True,
            'clases_creadas': len(creados),
            'advertencias':   advertencias_unicas,
            'horario':        HorarioClaseSerializer(creados, many=True).data,
        }, status=status.HTTP_201_CREATED)


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
