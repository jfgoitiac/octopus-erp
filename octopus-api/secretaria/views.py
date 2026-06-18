from datetime import date
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db import models
from django.db.models import F
from rest_framework.response import Response
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.views import APIView
from .models import (
    Alumno, BienNacional, ConfiguracionGrado, ConfiguracionSistema,
    Inscripcion, Representante
)
from .services import generate_temporary_cedula_escolar
from authentication.views import IsSystemAdminOrDirector
from usuarios.models import LogAuditoria
from django.db.models import Count
from .serializers import (
    AlumnoRetirarSerializer, AlumnoSerializer, AlumnoUpdateSerializer,
    AsignarGradoSerializer, BienNacionalSerializer, ConfiguracionGradoSerializer,
    ConfiguracionSistemaSerializer, InscripcionSerializer, RepresentanteSerializer,
    RepresentanteCRUDSerializer, LogAuditoriaSerializer,
)


# ─────────────────────────────────────────────
# PERMISO PERSONALIZADO PARA DOCENTES
# ─────────────────────────────────────────────
class IsSecretariaOrAbove(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # El superusuario siempre tiene acceso total por diseño
        if request.user.is_superuser:
            return True
            
        try:
            return (
                request.user.perfil.esta_activo and
                request.user.perfil.rol in ['director', 'sistemas', 'administrador', 'secretaria']
            )
        except Exception:
            return False


class IsDocenteOrAbove(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.is_superuser:
            return True

        try:
            return (
                request.user.perfil.esta_activo and
                request.user.perfil.rol in ['director', 'sistemas', 'administrador', 'secretaria', 'docente']
            )
        except Exception:
            return False


# ─────────────────────────────────────────────
# CONFIGURACIÓN DEL SISTEMA (NUEVO)
# ─────────────────────────────────────────────
class ConfiguracionSistemaView(APIView):
    permission_classes = [IsSystemAdminOrDirector]

    def get(self, request):
        config = ConfiguracionSistema.objects.first()
        if not config:
            return Response({}, status=status.HTTP_200_OK)
        serializer = ConfiguracionSistemaSerializer(config)
        return Response(serializer.data)

    def post(self, request):
        config = ConfiguracionSistema.objects.first()
        if config:
            serializer = ConfiguracionSistemaSerializer(config, data=request.data, partial=True)
        else:
            serializer = ConfiguracionSistemaSerializer(data=request.data)

        serializer.is_valid(raise_exception=True)
        config = serializer.save()

        LogAuditoria.objects.create(
            usuario=request.user,
            accion="ACTUALIZACION_CONFIGURACION",
            modulo="SISTEMAS",
            detalles={
                "periodo_activo":              config.periodo_escolar_activo,
                "fecha_inicio_inscripciones":  str(config.fecha_inicio_inscripciones),
                "fecha_fin_inscripciones":     str(config.fecha_fin_inscripciones),
                "dia_limite_pago":             config.dia_limite_pago,
            }
        )
        return Response(ConfiguracionSistemaSerializer(config).data)


# ─────────────────────────────────────────────
# PROMOCIÓN AUTOMÁTICA DE ALUMNOS (NUEVO)
# ─────────────────────────────────────────────
class PromocionAlumnosView(APIView):
    permission_classes = [IsSystemAdminOrDirector]

    # Mapa de promoción de grados
    MAPA_GRADOS = {
        '1er Grado': '2do Grado',
        '2do Grado': '3er Grado',
        '3er Grado': '4to Grado',
        '4to Grado': '5to Grado',
        '5to Grado': '6to Grado',
        '6to Grado': '1er Año',  # Transición Primaria -> Media General
        '1er Año':   '2do Año',
        '2do Año':   '3er Año',
        '3er Año':   '4to Año',
        '4to Año':   '5to Año',
    }
    @transaction.atomic
    def post(self, request):
        config = ConfiguracionSistema.objects.first()
        periodo_origen  = config.periodo_escolar_activo if config else "2024-2025"
        periodo_destino = request.data.get('periodo_destino', '2025-2026')

        alumnos_activos = Alumno.objects.filter(activo=True).exclude(grado_seccion=None)
        promovidos      = []
        no_mapeados     = []

        alumnos_a_promover = []
        for alumno in alumnos_activos:
            grado_actual = alumno.grado_seccion or ''
            # Extraer solo el nombre del grado (sin la sección)
            partes = grado_actual.split(' - ')
            nombre_grado = partes[0].strip()
            seccion      = f" - {partes[1].strip()}" if len(partes) > 1 else ''

            nuevo_grado_nombre = self.MAPA_GRADOS.get(nombre_grado)
            if nuevo_grado_nombre:
                alumno.grado_seccion = f"{nuevo_grado_nombre}{seccion}"
                alumnos_a_promover.append(alumno)
                promovidos.append(alumno.id)
            else:
                no_mapeados.append({
                    "alumno_id": alumno.id,
                    "nombre":    f"{alumno.nombre} {alumno.apellido}",
                    "grado":     grado_actual
                })

        # Optimización 1: Promoción en lote (Bulk Update). 
        # Reduce O(N) queries a 1 sola query de actualización masiva.
        if alumnos_a_promover:
            Alumno.objects.bulk_update(alumnos_a_promover, ['grado_seccion'], batch_size=500)

        # Actualizar período activo
        if config:
            config.periodo_escolar_activo = periodo_destino
            config.save(update_fields=['periodo_escolar_activo'])

        # Sincronizar contadores de cupos tras el movimiento masivo de forma precisa
        from django.db.models import Count
        
        # 1. Obtener los conteos actuales de alumnos activos por grado_seccion
        #    Esto incluye todos los grados donde hay alumnos, post-promoción.
        conteos_alumnos_por_grado = Alumno.objects.filter(activo=True) \
                                            .values('grado_seccion') \
                                            .annotate(total=Count('id')) \
                                            .filter(grado_seccion__isnull=False) # Solo contar si grado_seccion no es nulo
        
        # Convertir a un mapa para acceso rápido: {'grado_seccion': count}
        conteos_map = {item['grado_seccion']: item['total'] for item in conteos_alumnos_por_grado}

        # 2. Obtener todas las configuraciones de grado existentes
        all_config_grados = ConfiguracionGrado.objects.all()
        
        # Lista para bulk_update
        config_grados_to_update = []

        # 3. Actualizar cupos_utilizados para cada configuración de grado
        for config_grado in all_config_grados:
            new_cupos_utilizados = conteos_map.get(config_grado.grado_seccion, 0)
            if config_grado.cupos_utilizados != new_cupos_utilizados:
                config_grado.cupos_utilizados = new_cupos_utilizados
                config_grados_to_update.append(config_grado)

        # 4. Realizar la actualización en lote
        if config_grados_to_update:
            ConfiguracionGrado.objects.bulk_update(config_grados_to_update, ['cupos_utilizados'])

        LogAuditoria.objects.create(
            usuario=request.user,
            accion="PROMOCION_ALUMNOS",
            modulo="SISTEMAS",
            detalles={
                "total_promovidos": len(promovidos),
                "periodo_origen":   periodo_origen,
                "periodo_destino":  periodo_destino,
                "alumnos_ids":      promovidos,
                "no_mapeados":      len(no_mapeados),
            }
        )

        return Response({
            "mensaje":          f"Se promovieron {len(promovidos)} alumnos correctamente.",
            "total_promovidos": len(promovidos),
            "no_mapeados":      no_mapeados,
            "periodo_destino":  periodo_destino,
        }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# BIEN NACIONAL
# ─────────────────────────────────────────────
class BienNacionalViewSet(viewsets.ModelViewSet):
    queryset           = BienNacional.objects.select_related('responsable_asignado').all()
    serializer_class   = BienNacionalSerializer
    permission_classes = [permissions.IsAuthenticated, IsSystemAdminOrDirector]

    def perform_create(self, serializer):
        instance = serializer.save()
        LogAuditoria.objects.create(
            usuario=self.request.user,
            accion="REGISTRO_BIEN_NACIONAL",
            modulo="INVENTARIO",
            detalles={
                "codigo":      instance.codigo_inventario,
                "descripcion": instance.descripcion,
                "ubicacion":   instance.ubicacion,
            }
        )


# ─────────────────────────────────────────────
# ALUMNOS
# ─────────────────────────────────────────────
class AlumnoListView(viewsets.ModelViewSet):
    serializer_class   = AlumnoSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Docentes y secretaria ven solo activos
        # Con ?todos=true los admins pueden ver retirados también
        mostrar_todos = self.request.query_params.get('todos', 'false').lower() == 'true'
        try:
            rol = self.request.user.perfil.rol
        except Exception:
            rol = ''

        if mostrar_todos and rol in ['director', 'administrador', 'sistemas']:
            qs = Alumno.todos.select_related('representante').all()
        else:
            qs = Alumno.objects.select_related('representante').all()

        # Filtro específico por cédula escolar (para validaciones de duplicados)
        cedula = self.request.query_params.get('cedula', '')
        if cedula:
            qs = Alumno.todos.filter(cedula_escolar=cedula)

        # Filtro por estatus financiero (mora, solvente, becado)
        estatus = self.request.query_params.get('estatus', '')
        if estatus:
            qs = qs.filter(estatus_financiero=estatus)

        # Búsqueda por nombre, cédula o representante
        buscar = self.request.query_params.get('buscar', '')
        if buscar:
            qs = qs.filter(
                models.Q(nombre__icontains=buscar) |
                models.Q(apellido__icontains=buscar) |
                models.Q(cedula_escolar__icontains=buscar) |
                models.Q(representante__nombre__icontains=buscar) |
                models.Q(representante__cedula__icontains=buscar)
            )
        return qs

    def get_permissions(self):
        # Crear/editar: secretaria o superior
        # Listar/ver: docente o superior
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsSecretariaOrAbove()]
        return [IsDocenteOrAbove()]

    def perform_create(self, serializer):
        alumno = serializer.save()
        LogAuditoria.objects.create(
            usuario=self.request.user,
            accion="REGISTRO_ALUMNO",
            modulo="SECRETARIA",
            detalles={
                "alumno_id":      alumno.id,
                "nombre":         f"{alumno.nombre} {alumno.apellido}",
                "cedula_escolar": alumno.cedula_escolar,
            }
        )

    @action(detail=True, methods=['patch'])
    @transaction.atomic
    def update_info(self, request, pk=None):
        alumno     = self.get_object()
        serializer = AlumnoUpdateSerializer(alumno, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        cambios_detectados = []
        for attr, value in serializer.validated_data.items():
            if attr == 'representante':
                rep_instance = alumno.representante
                for rep_attr, rep_value in value.items():
                    valor_actual = getattr(rep_instance, rep_attr, None)
                    if str(valor_actual) != str(rep_value):
                        cambios_detectados.append(f"Rep.{rep_attr}: {valor_actual} -> {rep_value}")
            else:
                valor_actual = getattr(alumno, attr, None)
                if str(valor_actual) != str(value):
                    cambios_detectados.append(f"Alu.{attr}: {valor_actual} -> {value}")

        serializer.save()
        alumno.refresh_from_db()

        LogAuditoria.objects.create(
            usuario=request.user,
            accion="ACTUALIZACION_DATOS_ALUMNO",
            modulo="SECRETARIA",
            detalles={
                "alumno_id": alumno.id,
                "nombre":    f"{alumno.nombre} {alumno.apellido}",
                "cambios":   cambios_detectados
            }
        )
        return Response(AlumnoSerializer(alumno).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])  # NUEVO
    def asignar_grado(self, request, pk=None):
        """Asigna o cambia el grado de un alumno del banco."""
        alumno     = self.get_object()
        serializer = AsignarGradoSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        grado_nuevo = serializer.validated_data['grado_seccion']

        # Verificar cupos disponibles
        try:
            config = ConfiguracionGrado.objects.get(grado_seccion=grado_nuevo)
            if config.cupos_disponibles <= 0:
                return Response(
                    {"error": f"No hay cupos disponibles en {grado_nuevo}."},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except ConfiguracionGrado.DoesNotExist:
            return Response(
                {"error": f"El grado {grado_nuevo} no está configurado en el sistema."},
                status=status.HTTP_400_BAD_REQUEST
            )

        grado_anterior        = alumno.grado_seccion
        alumno.grado_seccion  = grado_nuevo
        alumno.save(update_fields=['grado_seccion'])

        LogAuditoria.objects.create(
            usuario=request.user,
            accion="ASIGNACION_GRADO",
            modulo="SECRETARIA",
            detalles={
                "alumno_id":      alumno.id,
                "nombre":         f"{alumno.nombre} {alumno.apellido}",
                "grado_anterior": grado_anterior,
                "grado_nuevo":    grado_nuevo,
            }
        )
        return Response(
            {"mensaje": f"Grado asignado: {grado_nuevo}"},
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])  # NUEVO
    def retirar(self, request, pk=None):
        """Soft delete — retira sin eliminar historial."""
        alumno = self.get_object()
        if not alumno.activo:
            return Response(
                {"error": "El alumno ya está retirado."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = AlumnoRetirarSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        motivo = serializer.validated_data.get('motivo', '')
        alumno.retirar(motivo=motivo)

        LogAuditoria.objects.create(
            usuario=request.user,
            accion="RETIRO_ALUMNO",
            modulo="SECRETARIA",
            detalles={
                "alumno_id":      alumno.id,
                "nombre":         f"{alumno.nombre} {alumno.apellido}",
                "cedula_escolar": alumno.cedula_escolar,
                "motivo":         motivo,
            }
        )
        return Response(
            {"mensaje": f"Alumno {alumno.nombre} {alumno.apellido} retirado."},
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])  # NUEVO
    def reactivar(self, request, pk=None):
        """Reactiva un alumno retirado."""
        try:
            alumno = Alumno.todos.get(pk=pk)
        except Alumno.DoesNotExist:
            return Response({"error": "Alumno no encontrado."}, status=status.HTTP_404_NOT_FOUND)

        if alumno.activo:
            return Response({"error": "El alumno ya está activo."}, status=status.HTTP_400_BAD_REQUEST)

        alumno.reactivar()

        LogAuditoria.objects.create(
            usuario=request.user,
            accion="REACTIVACION_ALUMNO",
            modulo="SECRETARIA",
            detalles={
                "alumno_id": alumno.id,
                "nombre":    f"{alumno.nombre} {alumno.apellido}",
            }
        )
        return Response(
            {"mensaje": f"Alumno {alumno.nombre} {alumno.apellido} reactivado."},
            status=status.HTTP_200_OK
        )

    def perform_destroy(self, instance):
        """Sobreescribir DELETE para usar soft delete."""
        LogAuditoria.objects.create(
            usuario=self.request.user, # Log the user performing the action
            accion="RETIRO_ALUMNO",
            modulo="SECRETARIA",
            detalles={
                "alumno_id":      instance.id,
                "nombre":         f"{instance.nombre} {instance.apellido}",
                "cedula_escolar": instance.cedula_escolar,
                "motivo":         "Eliminación desde interfaz",
            }
        )
        instance.retirar(motivo="Eliminación desde interfaz")


# ─────────────────────────────────────────────
# INSCRIPCIÓN
# ─────────────────────────────────────────────
class InscripcionNuevaView(APIView):
    """Inscribe a un alumno ya registrado en el banco."""
    permission_classes = [permissions.IsAuthenticated]
    serializer_class   = InscripcionSerializer

    def post(self, request):
        # El serializador ahora maneja la atomicidad y la lógica de negocio
        serializer = self.serializer_class(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        inscripcion = serializer.save()
        
        LogAuditoria.objects.create(
            usuario=request.user,
            accion="INSCRIPCION_NUEVO_INGRESO",
            modulo="SECRETARIA",
            detalles={
                "alumno_id":        inscripcion.alumno.id,
                "nombre":           f"{inscripcion.alumno.nombre} {inscripcion.alumno.apellido}",
                "grado_seccion":    inscripcion.grado_seccion,
                "inscripcion_id":   inscripcion.id,
            }
        )

        return Response(
            {
                "mensaje":        "Inscripción exitosa",
                "alumno_id":      inscripcion.alumno.id,
                "inscripcion_id": inscripcion.id,
            },
            status=status.HTTP_201_CREATED
        )


# ─────────────────────────────────────────────
# COMPROBANTE DE INSCRIPCIÓN PDF (NUEVO)
# ─────────────────────────────────────────────
class ComprobanteInscripcionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        try:
            from django.http import FileResponse
            from cobranza.utils import generar_pdf_inscripcion
            inscripcion = Inscripcion.objects.select_related('alumno', 'usuario_registro').get(pk=pk)
            pdf_buffer  = generar_pdf_inscripcion(inscripcion)
            return FileResponse(
                pdf_buffer,
                as_attachment=False,
                filename=f"Comprobante_Inscripcion_{pk}.pdf",
                content_type='application/pdf'
            )
        except Inscripcion.DoesNotExist:
            return Response({"error": "Inscripción no encontrada."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ─────────────────────────────────────────────
# EXPORTAR ALUMNOS A EXCEL
# ─────────────────────────────────────────────
class ExportarAlumnosExcelView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from cobranza.exports import ExcelExporter
        from django.db.models import Q as DQ

        estatus = request.query_params.get('estatus', '')
        buscar  = request.query_params.get('buscar', '')

        qs = Alumno.objects.filter(activo=True).select_related('representante').order_by('apellido', 'nombre')
        if estatus:
            qs = qs.filter(estatus_financiero=estatus)
        if buscar:
            qs = qs.filter(
                DQ(nombre__icontains=buscar) |
                DQ(apellido__icontains=buscar) |
                DQ(cedula_escolar__icontains=buscar)
            )

        columns = [
            ('Nombre',          'nombre'),
            ('Apellido',        'apellido'),
            ('Cédula Escolar',  'cedula_escolar'),
            ('Grado / Sección', 'grado_seccion'),
            ('Género',          'genero'),
            ('Estatus',         'estatus_financiero'),
            ('Representante',   lambda x: f"{x.representante.nombre} {x.representante.apellido}" if x.representante else ''),
            ('Tel. Rep.',       lambda x: x.representante.telefono if x.representante else ''),
        ]

        return ExcelExporter.export(qs, columns, 'lista_alumnos')


class ExportarRepresentantesExcelView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from cobranza.exports import ExcelExporter
        from django.db.models import Q as DQ

        buscar    = request.query_params.get('buscar', '').strip()
        min_hijos = request.query_params.get('min_hijos', '')

        qs = Representante.objects.annotate(
            cantidad_alumnos=Count('alumnos', filter=models.Q(alumnos__activo=True))
        ).order_by('apellido', 'nombre')

        if buscar:
            qs = qs.filter(
                DQ(cedula__icontains=buscar)   |
                DQ(nombre__icontains=buscar)   |
                DQ(apellido__icontains=buscar) |
                DQ(correo__icontains=buscar)
            )
        if min_hijos:
            try:
                qs = qs.filter(cantidad_alumnos__gte=int(min_hijos))
            except ValueError:
                pass

        columns = [
            ('Cédula',          'cedula'),
            ('Nombre',          'nombre'),
            ('Apellido',        'apellido'),
            ('Teléfono',        'telefono'),
            ('Correo',          'correo'),
            ('Dirección',       'direccion'),
            ('Alumnos activos', lambda x: x.cantidad_alumnos),
        ]

        return ExcelExporter.export(qs, columns, 'lista_representantes')


# ─────────────────────────────────────────────
# REPRESENTANTE
# ─────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def buscar_representante_por_cedula(request, cedula):
    try:
        representante = Representante.objects.get(cedula=cedula)
        return Response({
            "id":        representante.id,
            "nombre":    representante.nombre,
            "apellido":  representante.apellido,
            "cedula":    representante.cedula,
            "telefono":  representante.telefono,
            "correo":    representante.correo,
            "direccion": representante.direccion,
            "existe":    True
        }, status=status.HTTP_200_OK)
    except Representante.DoesNotExist:
        return Response({"existe": False}, status=status.HTTP_200_OK)

class RepresentanteAlumnosView(APIView):
    """
    Busca un representante por cédula y devuelve su información junto 
    con la lista de alumnos asociados.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, cedula):
        try:
            representante = Representante.objects.get(cedula=cedula)
            alumnos = Alumno.objects.filter(representante=representante)
            
            return Response({
                "representante": RepresentanteSerializer(representante).data,
                "alumnos": AlumnoSerializer(alumnos, many=True).data
            }, status=status.HTTP_200_OK)
        except Representante.DoesNotExist:
            return Response(
                {"error": "No se encontró el representante en la base de datos."}, 
                status=status.HTTP_404_NOT_FOUND
            )

class InscripcionExistenteView(APIView):
    """
    Procesa la inscripción de un alumno que ya existe en el sistema.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        # Refactorizado para usar el serializador y unificar validaciones de cupos/duplicados
        serializer = InscripcionSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        inscripcion = serializer.save()

        LogAuditoria.objects.create(
            usuario=request.user,
            accion="INSCRIPCION_EXISTENTE",
            modulo="SECRETARIA",
            detalles={
                "alumno": f"{inscripcion.alumno.nombre} {inscripcion.alumno.apellido}",
                "grado": inscripcion.grado_seccion,
                "periodo": inscripcion.periodo_escolar
            }
        )
        return Response({"mensaje": "Inscripción exitosa", "inscripcion_id": inscripcion.id}, status=status.HTTP_201_CREATED)

# ─────────────────────────────────────────────
# CONFIGURACIÓN DE GRADOS
# ─────────────────────────────────────────────
class ConfiguracionGradoViewSet(viewsets.ModelViewSet):
    queryset           = ConfiguracionGrado.objects.all()
    serializer_class   = ConfiguracionGradoSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_update(self, serializer):
        instance = serializer.save()
        LogAuditoria.objects.create(
            usuario=self.request.user,
            accion="AJUSTE_CUPOS",
            modulo="SECRETARIA",
            detalles={
                "grado_seccion":  instance.grado_seccion,
                "cupos_maximos":  instance.cupos_maximos,
                "cupos_actuales": instance.cupos_utilizados,
            }
        )


# ─────────────────────────────────────────────
# AUDITORÍA
# ─────────────────────────────────────────────
class LogAuditoriaListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSystemAdminOrDirector]

    def get(self, request):
        logs = LogAuditoria.objects.select_related('usuario').all().order_by('-id')[:200]
        serializer = LogAuditoriaSerializer(logs, many=True)
        return Response(serializer.data)


# ─────────────────────────────────────────────
# MÓDULO DE GRADOS / MATRÍCULA POR GRADO
# ─────────────────────────────────────────────
_NOMBRES_GRADO = {
    '1er Grado': 'Primer Grado',
    '2do Grado': 'Segundo Grado',
    '3er Grado': 'Tercer Grado',
    '4to Grado': 'Cuarto Grado',
    '5to Grado': 'Quinto Grado',
    '6to Grado': 'Sexto Grado',
    '1er Año':   'Primer Año',
    '2do Año':   'Segundo Año',
    '3er Año':   'Tercer Año',
    '4to Año':   'Cuarto Año',
    '5to Año':   'Quinto Año',
}

def _nombre_grado_completo(grado_seccion):
    """Devuelve el nombre completo del grado, conservando la sección si existe."""
    partes = grado_seccion.split(' - ', 1)
    nombre = _NOMBRES_GRADO.get(partes[0].strip(), partes[0].strip())
    return f"{nombre} - {partes[1].strip()}" if len(partes) > 1 else nombre


class GradosListView(APIView):
    """Lista todos los grados activos con cantidad de alumnos inscritos."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        grados = (
            Alumno.objects
            .filter(activo=True)
            .exclude(grado_seccion__isnull=True)
            .exclude(grado_seccion='')
            .values('grado_seccion')
            .annotate(total_alumnos=Count('id'))
            .order_by('grado_seccion')
        )
        return Response(list(grados))


class MatriculaGradoView(APIView):
    """Devuelve la lista de alumnos de un grado con orden configurable."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        grado  = request.query_params.get('grado', '').strip()
        orden  = request.query_params.get('orden', 'apellido')  # 'apellido' | 'cedula'

        if not grado:
            return Response({"error": "Debe especificar el parámetro 'grado'."}, status=status.HTTP_400_BAD_REQUEST)

        qs = (
            Alumno.objects
            .filter(activo=True, grado_seccion=grado)
            .select_related('representante')
        )

        if orden == 'cedula':
            qs = qs.order_by('cedula_escolar')
        else:
            qs = qs.order_by('apellido', 'nombre')

        data = [
            {
                'id':               a.id,
                'cedula_escolar':   a.cedula_escolar,
                'nombre':           a.nombre,
                'apellido':         a.apellido,
                'genero':           a.genero,
                'grado_seccion':    a.grado_seccion,
                'estatus_financiero': a.estatus_financiero,
                'representante_nombre': f"{a.representante.nombre} {a.representante.apellido}" if a.representante else '',
                'representante_telefono': a.representante.telefono if a.representante else '',
            }
            for a in qs
        ]
        return Response({'grado': grado, 'total': len(data), 'alumnos': data})


class ExportarMatriculaGradoExcelView(APIView):
    """Exporta la matrícula de un grado a Excel."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from cobranza.exports import ExcelExporter

        grado = request.query_params.get('grado', '').strip()
        orden = request.query_params.get('orden', 'apellido')

        if not grado:
            return Response({"error": "Debe especificar el parámetro 'grado'."}, status=status.HTTP_400_BAD_REQUEST)

        qs = Alumno.objects.filter(activo=True, grado_seccion=grado).select_related('representante')
        qs = qs.order_by('cedula_escolar') if orden == 'cedula' else qs.order_by('apellido', 'nombre')

        # Construir manualmente para agregar numeración y encabezado de grado
        from openpyxl import Workbook
        from openpyxl.styles import Font, Alignment, PatternFill
        from django.http import HttpResponse
        from django.utils import timezone

        nombre_completo = _nombre_grado_completo(grado)

        wb = Workbook()
        ws = wb.active
        ws.title = "Matrícula"

        title_font  = Font(bold=True, size=13)
        header_font = Font(bold=True, color="FFFFFF")
        header_fill = PatternFill("solid", fgColor="1E3A5F")
        center      = Alignment(horizontal="center")

        ws.merge_cells('A1:D1')
        ws['A1'] = f"Matrícula — {nombre_completo}"
        ws['A1'].font      = title_font
        ws['A1'].alignment = center

        ws.merge_cells('A2:D2')
        ws['A2'] = f"Generado: {timezone.now().strftime('%d/%m/%Y %H:%M')}"
        ws['A2'].alignment = center

        headers = ['N°', 'Cédula Escolar', 'Nombres', 'Apellidos']
        ws.append([])
        ws.append(headers)
        header_row = ws.max_row
        for cell in ws[header_row]:
            cell.font      = header_font
            cell.fill      = header_fill
            cell.alignment = center

        for idx, alumno in enumerate(qs, start=1):
            ws.append([
                idx,
                alumno.cedula_escolar,
                alumno.nombre,
                alumno.apellido,
            ])

        col_widths = [5, 18, 24, 24]
        for i, w in enumerate(col_widths, start=1):
            ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = w

        response = HttpResponse(content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        nombre_archivo = grado.replace(' ', '_').replace('/', '-')
        timestamp = timezone.now().strftime('%Y-%m-%d_%H%M')
        response['Content-Disposition'] = f'attachment; filename="matricula_{nombre_archivo}_{timestamp}.xlsx"'
        wb.save(response)
        return response


class ExportarMatriculaGradoPDFView(APIView):
    """Exporta la matrícula de un grado a PDF con reportlab."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from reportlab.lib.pagesizes import letter, landscape
        from reportlab.lib import colors
        from reportlab.lib.units import cm
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.enums import TA_CENTER, TA_LEFT
        from django.http import HttpResponse
        from django.utils import timezone
        import io

        grado = request.query_params.get('grado', '').strip()
        orden = request.query_params.get('orden', 'apellido')

        if not grado:
            return Response({"error": "Debe especificar el parámetro 'grado'."}, status=status.HTTP_400_BAD_REQUEST)

        qs = Alumno.objects.filter(activo=True, grado_seccion=grado).select_related('representante')
        qs = qs.order_by('cedula_escolar') if orden == 'cedula' else qs.order_by('apellido', 'nombre')

        nombre_completo = _nombre_grado_completo(grado)

        buffer = io.BytesIO()
        doc    = SimpleDocTemplate(buffer, pagesize=letter, topMargin=1.5*cm, bottomMargin=1.5*cm, leftMargin=2*cm, rightMargin=2*cm)

        styles = getSampleStyleSheet()
        title_style = ParagraphStyle('title', parent=styles['Title'], fontSize=14, spaceAfter=4, alignment=TA_CENTER)
        sub_style   = ParagraphStyle('sub',   parent=styles['Normal'], fontSize=9, spaceAfter=12, alignment=TA_CENTER, textColor=colors.HexColor('#666666'))

        primary_color = colors.HexColor('#1E3A5F')

        elements = [
            Paragraph(f"Lista de Matrícula — {nombre_completo}", title_style),
            Paragraph(f"Orden: {'Por Cédula' if orden == 'cedula' else 'Alfabético'} &nbsp;|&nbsp; Generado: {timezone.now().strftime('%d/%m/%Y %H:%M')}", sub_style),
            Spacer(1, 0.3*cm),
        ]

        table_data = [['N°', 'Cédula Escolar', 'Nombres', 'Apellidos']]
        for idx, alumno in enumerate(qs, start=1):
            table_data.append([
                str(idx),
                alumno.cedula_escolar or '',
                alumno.nombre,
                alumno.apellido,
            ])

        col_widths = [1.2*cm, 4*cm, 6.5*cm, 6.5*cm]
        table = Table(table_data, colWidths=col_widths, repeatRows=1)
        table.setStyle(TableStyle([
            # Encabezado
            ('BACKGROUND',   (0, 0), (-1, 0),  primary_color),
            ('TEXTCOLOR',    (0, 0), (-1, 0),  colors.white),
            ('FONTNAME',     (0, 0), (-1, 0),  'Helvetica-Bold'),
            ('FONTSIZE',     (0, 0), (-1, 0),  9),
            ('ALIGN',        (0, 0), (-1, 0),  'CENTER'),
            ('BOTTOMPADDING',(0, 0), (-1, 0),  7),
            ('TOPPADDING',   (0, 0), (-1, 0),  7),
            # Filas de datos
            ('FONTNAME',     (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE',     (0, 1), (-1, -1), 9),
            ('ALIGN',        (0, 1), (0, -1),  'CENTER'),
            ('ALIGN',        (1, 1), (1, -1),  'CENTER'),
            ('VALIGN',       (0, 0), (-1, -1), 'MIDDLE'),
            ('ROWBACKGROUNDS',(0, 1), (-1, -1), [colors.white, colors.HexColor('#F4F7FB')]),
            ('TOPPADDING',   (0, 1), (-1, -1), 5),
            ('BOTTOMPADDING',(0, 1), (-1, -1), 5),
            ('GRID',         (0, 0), (-1, -1), 0.4, colors.HexColor('#CCCCCC')),
        ]))
        elements.append(table)

        # Pie de página con total
        elements.append(Spacer(1, 0.5*cm))
        elements.append(Paragraph(f"Total de alumnos: {len(table_data) - 1}", sub_style))

        doc.build(elements)
        buffer.seek(0)

        nombre_archivo = grado.replace(' ', '_').replace('/', '-')
        response = HttpResponse(buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="matricula_{nombre_archivo}.pdf"'
        return response


# ─────────────────────────────────────────────
# REPRESENTANTES — CRUD COMPLETO
# ─────────────────────────────────────────────
class RepresentanteViewSet(viewsets.ModelViewSet):
    """CRUD completo de representantes con búsqueda y conteo de alumnos vinculados."""
    serializer_class   = RepresentanteCRUDSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = Representante.objects.annotate(
            cantidad_alumnos=Count('alumnos', filter=models.Q(alumnos__activo=True))
        )
        buscar = self.request.query_params.get('buscar', '').strip()
        if buscar:
            qs = qs.filter(
                models.Q(cedula__icontains=buscar) |
                models.Q(nombre__icontains=buscar)  |
                models.Q(apellido__icontains=buscar) |
                models.Q(correo__icontains=buscar)
            )
        min_hijos = self.request.query_params.get('min_hijos')
        if min_hijos is not None:
            qs = qs.filter(cantidad_alumnos__gte=int(min_hijos))
        return qs.order_by('apellido', 'nombre')

    def get_permissions(self):
        if self.action in ['destroy', 'create', 'update', 'partial_update']:
            return [permissions.IsAuthenticated(), IsSystemAdminOrDirector()]
        return [permissions.IsAuthenticated()]

    def destroy(self, request, *args, **kwargs):
        rep = self.get_object()
        tiene_alumnos = rep.alumnos.filter(activo=True).exists()
        if tiene_alumnos:
            return Response(
                {"error": "No se puede eliminar un representante con alumnos activos vinculados."},
                status=status.HTTP_400_BAD_REQUEST
            )
        rep.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)