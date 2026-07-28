from collections import defaultdict
from datetime import date

from django.db.models import Q
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from secretaria.models import Alumno, ConfiguracionSistema
from .filters import AsistenciaFilter, IncidenteFilter, NotaFilter
from .models import (
    AlertaRendimiento,
    Asistencia,
    HorarioClase,
    IncidenteDisciplinario,
    Lapso,
    Materia,
    MaterialEstudio,
    Nota,
)
from .services import calcular_rendimiento_alumno, calcular_rendimiento_seccion
from .serializers import (
    AsistenciaBulkSerializer,
    AsistenciaSerializer,
    HorarioClaseSerializer,
    IncidenteDisciplinarioSerializer,
    LapsoSerializer,
    MateriaDocenteSerializer,
    MateriaSerializer,
    MaterialEstudioSerializer,
    NotaBulkSerializer,
    NotaSerializer,
)


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
        return request.data.get('grado_seccion')

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

        # Notas del alumno en este lapso
        notas_qs = Nota.objects.filter(
            alumno=alumno, lapso=lapso
        ).select_related('materia')

        materias_notas = []
        for nota in notas_qs:
            materias_notas.append({
                'materia_id':    nota.materia.id,
                'materia_nombre': nota.materia.nombre,
                'evaluacion_1':  nota.evaluacion_1,
                'evaluacion_2':  nota.evaluacion_2,
                'evaluacion_3':  nota.evaluacion_3,
                'evaluacion_4':  nota.evaluacion_4,
                'definitiva':    nota.definitiva,
                'aprobado':      nota.aprobado,
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
            qs = qs.filter(materia_id=materia_id)
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
