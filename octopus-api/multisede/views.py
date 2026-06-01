from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework import permissions
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status

from .models import Sede, PermisoSede
from .serializers import (
    SedeSerializer, PermisoSedeSerializer,
    SedeResumenSerializer, DashboardConsolidadoSerializer,
)


# ─────────────────────────────────────────────
# HELPERS: queries que respetan registros sin sede
# ─────────────────────────────────────────────
def _get_alumnos_de_sede(sede, total_sedes):
    """
    Retorna QuerySet de alumnos de una sede.
    Si es la única sede, incluye también los que tienen sede=null
    (datos históricos migrados).
    """
    from secretaria.models import Alumno
    if total_sedes == 1:
        # Única sede: todos los alumnos (con o sin sede asignada)
        return Alumno.todos.filter(
            Q(sede=sede) | Q(sede__isnull=True),
            activo=True
        )
    return Alumno.todos.filter(sede=sede, activo=True)


def _get_pagos_de_sede(sede, total_sedes, mes=None, anio=None):
    """
    Retorna QuerySet de pagos completados de una sede.
    Si es la única sede, incluye también los que tienen sede=null
    (datos históricos migrados).
    """
    from cobranza.models import Pago
    if total_sedes == 1:
        qs = Pago.objects.filter(Q(sede=sede) | Q(sede__isnull=True), estatus='completado')
    else:
        qs = Pago.objects.filter(sede=sede, estatus='completado')

    if mes and anio:
        qs = qs.filter(fecha_pago__month=mes, fecha_pago__year=anio)
    elif anio:
        qs = qs.filter(fecha_pago__year=anio)
    return qs


# ─────────────────────────────────────────────
# HELPER: verificar acceso a una sede
# ─────────────────────────────────────────────
def _verificar_acceso_sede(user, sede_id):
    """
    Retorna (tiene_acceso: bool, es_directivo_red: bool).
    Es directivo_red si su PerfilUsuario.rol == 'directivo_red'
    o si tiene algún PermisoSede activo con rol 'directivo_red'.
    """
    # Verificar rol en perfil de usuario
    es_directivo_red = False
    try:
        if user.perfil.rol == 'directivo_red':
            es_directivo_red = True
    except Exception:
        pass

    # También verificar en PermisoSede
    if not es_directivo_red:
        es_directivo_red = PermisoSede.objects.filter(
            user=user, rol='directivo_red', activo=True
        ).exists()

    if es_directivo_red:
        tiene_acceso = Sede.objects.filter(pk=sede_id).exists()
        return tiene_acceso, True

    tiene_acceso = PermisoSede.objects.filter(
        user=user, sede_id=sede_id, activo=True
    ).exists()
    return tiene_acceso, False


def _sedes_accesibles(user):
    """Retorna queryset de sedes accesibles para el usuario."""
    try:
        if user.perfil.rol == 'directivo_red':
            return Sede.objects.all()
    except Exception:
        pass

    if PermisoSede.objects.filter(user=user, rol='directivo_red', activo=True).exists():
        return Sede.objects.all()

    sede_ids = PermisoSede.objects.filter(user=user, activo=True).values_list('sede_id', flat=True)
    return Sede.objects.filter(pk__in=sede_ids)


# ─────────────────────────────────────────────
# SEDES — lista y creación
# ─────────────────────────────────────────────
class SedesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        sedes = _sedes_accesibles(request.user)
        serializer = SedeSerializer(sedes, many=True)
        return Response(serializer.data)

    def post(self, request):
        # Solo directivo_red o director pueden crear sedes
        _, es_directivo_red = _verificar_acceso_sede(request.user, 0)
        rol_perfil = ''
        try:
            rol_perfil = request.user.perfil.rol
        except Exception:
            pass

        if not es_directivo_red and rol_perfil not in ('director', 'directivo_red'):
            return Response(
                {'detail': 'No tiene permisos para crear sedes.'},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = SedeSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ─────────────────────────────────────────────
# SEDE — detalle, edición y soft-delete
# ─────────────────────────────────────────────
class SedeDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_sede(self, pk):
        try:
            return Sede.objects.get(pk=pk)
        except Sede.DoesNotExist:
            return None

    def get(self, request, pk):
        tiene_acceso, _ = _verificar_acceso_sede(request.user, pk)
        if not tiene_acceso:
            return Response({'detail': 'No tiene acceso a esta sede.'}, status=status.HTTP_403_FORBIDDEN)

        sede = self._get_sede(pk)
        if not sede:
            return Response({'detail': 'Sede no encontrada.'}, status=status.HTTP_404_NOT_FOUND)

        return Response(SedeSerializer(sede).data)

    def put(self, request, pk):
        tiene_acceso, es_directivo_red = _verificar_acceso_sede(request.user, pk)
        if not tiene_acceso:
            return Response({'detail': 'No tiene acceso a esta sede.'}, status=status.HTTP_403_FORBIDDEN)

        # Solo directivo_red o director de esa sede puede editar
        es_director_sede = PermisoSede.objects.filter(
            user=request.user, sede_id=pk, rol__in=('director', 'directivo_red'), activo=True
        ).exists()
        if not es_directivo_red and not es_director_sede:
            return Response({'detail': 'No tiene permisos para editar esta sede.'}, status=status.HTTP_403_FORBIDDEN)

        sede = self._get_sede(pk)
        if not sede:
            return Response({'detail': 'Sede no encontrada.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = SedeSerializer(sede, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        tiene_acceso, es_directivo_red = _verificar_acceso_sede(request.user, pk)
        if not tiene_acceso or not es_directivo_red:
            return Response({'detail': 'No tiene permisos para desactivar esta sede.'}, status=status.HTTP_403_FORBIDDEN)

        sede = self._get_sede(pk)
        if not sede:
            return Response({'detail': 'Sede no encontrada.'}, status=status.HTTP_404_NOT_FOUND)

        # Soft delete: marcar como inactiva
        sede.activa = False
        sede.save(update_fields=['activa'])
        return Response({'detail': f'Sede "{sede.nombre}" desactivada correctamente.'})


# ─────────────────────────────────────────────
# USUARIOS DE SEDE
# ─────────────────────────────────────────────
class UsuariosSedeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, sede_id, user_id=None):
        tiene_acceso, _ = _verificar_acceso_sede(request.user, sede_id)
        if not tiene_acceso:
            return Response({'detail': 'No tiene acceso a esta sede.'}, status=status.HTTP_403_FORBIDDEN)

        permisos = PermisoSede.objects.filter(sede_id=sede_id).select_related('user', 'sede')
        return Response(PermisoSedeSerializer(permisos, many=True).data)

    def post(self, request, sede_id, user_id=None):
        tiene_acceso, es_directivo_red = _verificar_acceso_sede(request.user, sede_id)
        es_director_sede = PermisoSede.objects.filter(
            user=request.user, sede_id=sede_id, rol__in=('director', 'directivo_red'), activo=True
        ).exists()
        if not tiene_acceso or (not es_directivo_red and not es_director_sede):
            return Response({'detail': 'No tiene permisos para asignar usuarios en esta sede.'}, status=status.HTTP_403_FORBIDDEN)

        uid      = request.data.get('user_id')
        username = request.data.get('username')
        rol      = request.data.get('rol')

        # Aceptar user_id numérico o username como identificador
        if not uid and username:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            try:
                uid = User.objects.get(username=username).pk
            except User.DoesNotExist:
                return Response({'detail': f'Usuario "{username}" no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        if not uid or not rol:
            return Response({'detail': 'Se requieren user_id (o username) y rol.'}, status=status.HTTP_400_BAD_REQUEST)

        permiso, creado = PermisoSede.objects.get_or_create(
            user_id=uid, sede_id=sede_id,
            defaults={'rol': rol, 'activo': True}
        )
        if not creado:
            permiso.rol    = rol
            permiso.activo = True
            permiso.save(update_fields=['rol', 'activo'])

        return Response(PermisoSedeSerializer(permiso).data, status=status.HTTP_201_CREATED if creado else status.HTTP_200_OK)

    def delete(self, request, sede_id, user_id):
        tiene_acceso, es_directivo_red = _verificar_acceso_sede(request.user, sede_id)
        es_director_sede = PermisoSede.objects.filter(
            user=request.user, sede_id=sede_id, rol__in=('director', 'directivo_red'), activo=True
        ).exists()
        if not tiene_acceso or (not es_directivo_red and not es_director_sede):
            return Response({'detail': 'No tiene permisos para revocar usuarios en esta sede.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            permiso = PermisoSede.objects.get(user_id=user_id, sede_id=sede_id)
        except PermisoSede.DoesNotExist:
            return Response({'detail': 'Permiso no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        permiso.activo = False
        permiso.save(update_fields=['activo'])
        return Response({'detail': 'Acceso revocado correctamente.'})


# ─────────────────────────────────────────────
# DASHBOARD CONSOLIDADO
# ─────────────────────────────────────────────
class DashboardConsolidadoView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from secretaria.models import Alumno
        from cobranza.models import Mensualidad

        sedes = _sedes_accesibles(request.user)
        ahora = timezone.now()
        total_sedes = sedes.filter(activa=True).count()

        # Pasar total_sedes al serializer via contexto
        resumen_sedes = SedeResumenSerializer(
            sedes, many=True, context={'total_sedes': total_sedes}
        ).data

        # Totales globales usando helpers que respetan registros sin sede
        total_alumnos    = 0
        total_deuda      = 0
        total_pagos_mes  = 0
        total_morosos    = 0

        for sede in sedes:
            alumnos_qs = _get_alumnos_de_sede(sede, total_sedes)
            total_alumnos   += alumnos_qs.count()
            total_morosos   += alumnos_qs.filter(estatus_financiero='mora').count()

            deuda_sede = Mensualidad.objects.filter(
                alumno__in=alumnos_qs, pagado=False
            ).aggregate(total=Sum('monto_usd'))['total'] or 0
            total_deuda += deuda_sede

            pagos_sede = _get_pagos_de_sede(
                sede, total_sedes, mes=ahora.month, anio=ahora.year
            ).aggregate(total=Sum('monto_usd'))['total'] or 0
            total_pagos_mes += pagos_sede

        nota_datos_historicos = (total_sedes == 1)

        totales = {
            'alumnos_activos':       total_alumnos,
            'deuda_total_usd':       float(total_deuda),
            'pagos_mes_actual':      float(total_pagos_mes),
            'morosos':               total_morosos,
            'sedes_activas':         total_sedes,
            'nota_datos_historicos': nota_datos_historicos,
        }

        return Response({
            'sedes':   resumen_sedes,
            'totales': totales,
        })


# ─────────────────────────────────────────────
# DASHBOARD POR SEDE (detalle)
# ─────────────────────────────────────────────
class DashboardSedeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, sede_id):
        from secretaria.models import Alumno
        from cobranza.models import Pago, Mensualidad
        from academico.models import Asistencia

        tiene_acceso, _ = _verificar_acceso_sede(request.user, sede_id)
        if not tiene_acceso:
            return Response({'detail': 'No tiene acceso a esta sede.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            sede = Sede.objects.get(pk=sede_id)
        except Sede.DoesNotExist:
            return Response({'detail': 'Sede no encontrada.'}, status=status.HTTP_404_NOT_FOUND)

        ahora = timezone.now()
        hoy   = ahora.date()

        # Determinar total de sedes activas para aplicar lógica de datos históricos
        total_sedes = Sede.objects.filter(activa=True).count()
        nota_datos_historicos = (total_sedes == 1)

        # Métricas generales usando helpers que respetan registros sin sede
        alumnos_qs      = _get_alumnos_de_sede(sede, total_sedes)
        alumnos_activos = alumnos_qs.count()

        deuda_total = Mensualidad.objects.filter(
            alumno__in=alumnos_qs, pagado=False
        ).aggregate(total=Sum('monto_usd'))['total'] or 0

        pagos_mes = _get_pagos_de_sede(
            sede, total_sedes, mes=ahora.month, anio=ahora.year
        ).aggregate(total=Sum('monto_usd'))['total'] or 0

        # Últimos 5 pagos
        ultimos_pagos = _get_pagos_de_sede(sede, total_sedes).order_by('-fecha_pago')[:5]
        pagos_data = [
            {
                'id':          p.pk,
                'factura_id':  p.factura_id,
                'alumno':      f"{p.alumno.nombre} {p.alumno.apellido}",
                'monto_usd':   float(p.monto_usd),
                'metodo_pago': p.metodo_pago,
                'fecha_pago':  p.fecha_pago,
            }
            for p in ultimos_pagos
        ]

        # Alumnos por grado
        from django.db.models import Count
        por_grado = (
            alumnos_qs
            .values('grado_seccion')
            .annotate(total=Count('id'))
            .order_by('grado_seccion')
        )

        # Morosos con nombre
        morosos_qs = alumnos_qs.filter(estatus_financiero='mora').values(
            'id', 'nombre', 'apellido', 'grado_seccion'
        )[:20]

        # Porcentaje de asistencia hoy — incluir asistencias de alumnos sin sede si corresponde
        if nota_datos_historicos:
            asistencia_filter = Q(alumno__sede=sede) | Q(alumno__sede__isnull=True)
        else:
            asistencia_filter = Q(alumno__sede=sede)
        total_hoy     = Asistencia.objects.filter(asistencia_filter, fecha=hoy).count()
        presentes_hoy = Asistencia.objects.filter(asistencia_filter, fecha=hoy, presente=True).count()
        pct_asistencia = round((presentes_hoy / total_hoy * 100), 1) if total_hoy > 0 else None

        return Response({
            'sede': SedeSerializer(sede).data,
            'metricas': {
                'alumnos_activos':           alumnos_activos,
                'deuda_total_usd':           float(deuda_total),
                'pagos_mes_actual':          float(pagos_mes),
                'morosos':                   morosos_qs.count(),
                'porcentaje_asistencia_hoy': pct_asistencia,
            },
            'ultimos_pagos':         pagos_data,
            'alumnos_por_grado':     list(por_grado),
            'morosos_detalle':       list(morosos_qs),
            'nota_datos_historicos': nota_datos_historicos,
        })


# ─────────────────────────────────────────────
# ASIGNAR SEDE EN MASA A REGISTROS SIN SEDE
# ─────────────────────────────────────────────
class AsignarSedeExistenteView(APIView):
    """
    Asigna una sede a todos los registros (alumnos, pagos, materias) que tienen sede=null.
    Útil al configurar multi-sede por primera vez.
    Solo directivo_red o director.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        rol = getattr(getattr(request.user, 'perfil', None), 'rol', '')
        if rol not in ('directivo_red', 'director'):
            return Response({'error': 'Sin permiso.'}, status=403)

        sede_id = request.data.get('sede_id')
        if not sede_id:
            return Response({'error': 'sede_id es requerido.'}, status=400)

        try:
            sede = Sede.objects.get(id=sede_id, activa=True)
        except Sede.DoesNotExist:
            return Response({'error': 'Sede no encontrada.'}, status=404)

        from secretaria.models import Alumno
        from cobranza.models import Pago
        from academico.models import Materia

        alumnos   = Alumno.todos.filter(sede__isnull=True).update(sede=sede)
        pagos     = Pago.objects.filter(sede__isnull=True).update(sede=sede)
        materias  = Materia.objects.filter(sede__isnull=True).update(sede=sede)

        return Response({
            'mensaje':              f'Registros asignados a {sede.nombre}.',
            'alumnos_actualizados': alumnos,
            'pagos_actualizados':   pagos,
            'materias_actualizadas': materias,
        })
