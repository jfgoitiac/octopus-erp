from django.contrib.auth import get_user_model
from rest_framework import serializers
from secretaria.models import Alumno
from .models import (
    Materia, Lapso, Nota, Asistencia, HorarioClase, IncidenteDisciplinario,
    MaterialEstudio, EventoCalendario,
    PlanEvaluacion, BloqueEvaluacion, ItemEvaluacion, NotaItemEvaluacion,
)
from .services import calcular_rendimiento_seccion


# ─────────────────────────────────────────────
# MATERIA
# ─────────────────────────────────────────────
class MateriaSerializer(serializers.ModelSerializer):
    # Mostrar id y username del docente en GET; aceptar id (o null) en escritura
    docente_id       = serializers.PrimaryKeyRelatedField(
        source='docente', queryset=get_user_model().objects.all(),
        required=False, allow_null=True,
    )
    docente_username = serializers.SerializerMethodField()

    class Meta:
        model  = Materia
        fields = [
            'id', 'nombre', 'codigo', 'grado_seccion', 'docente_id', 'docente_username',
            'activa', 'horas_academicas',
            # Plan de Evaluación (sistema nuevo) — editables solo por admin/control de estudios
            'tipo_evaluacion', 'aporta_a_todas_las_materias', 'cuenta_para_promedio',
        ]

    def get_docente_username(self, obj):
        if obj.docente:
            return obj.docente.username
        return None

    def validate_docente_id(self, value):
        # Solo se puede asignar como docente a un usuario cuyo perfil tenga rol 'docente'.
        if value is None:
            return value
        rol = getattr(getattr(value, 'perfil', None), 'rol', None)
        if rol != 'docente':
            raise serializers.ValidationError(
                'El usuario seleccionado no tiene rol "docente" y no puede ser asignado como docente de una materia.'
            )
        return value


# ─────────────────────────────────────────────
# LAPSO
# ─────────────────────────────────────────────
class LapsoSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Lapso
        fields = '__all__'


# ─────────────────────────────────────────────
# NOTA
# ─────────────────────────────────────────────
class NotaSerializer(serializers.ModelSerializer):
    alumno_nombre  = serializers.SerializerMethodField()
    materia_nombre = serializers.SerializerMethodField()
    lapso_nombre   = serializers.SerializerMethodField()
    aprobado       = serializers.SerializerMethodField()

    class Meta:
        model  = Nota
        fields = [
            'id',
            'alumno_id', 'alumno_nombre',
            'materia_id', 'materia_nombre',
            'lapso_id', 'lapso_nombre',
            'evaluacion_1', 'evaluacion_2', 'evaluacion_3', 'evaluacion_4',
            'definitiva', 'aprobado',
            'observaciones',
        ]

    def get_alumno_nombre(self, obj):
        return f"{obj.alumno.nombre} {obj.alumno.apellido}"

    def get_materia_nombre(self, obj):
        return obj.materia.nombre

    def get_lapso_nombre(self, obj):
        return str(obj.lapso)

    def get_aprobado(self, obj):
        return obj.aprobado


# ─────────────────────────────────────────────
# NOTA — escritura individual (usado internamente)
# ─────────────────────────────────────────────
class NotaWriteSerializer(serializers.Serializer):
    """Serializer para una sola nota dentro del bulk de NotasGradoView."""
    alumno_id     = serializers.IntegerField()
    evaluacion_1  = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)
    evaluacion_2  = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)
    evaluacion_3  = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)
    evaluacion_4  = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)
    observaciones = serializers.CharField(required=False, allow_blank=True, default='')

    def validate(self, data):
        # Validar rango 0-20 para cada evaluación presente
        for campo in ['evaluacion_1', 'evaluacion_2', 'evaluacion_3', 'evaluacion_4']:
            valor = data.get(campo)
            if valor is not None and not (0 <= valor <= 20):
                raise serializers.ValidationError(
                    {campo: 'La nota debe estar entre 0 y 20.'}
                )
        return data


# ─────────────────────────────────────────────
# NOTA — BULK (lista de notas para un grado)
# ─────────────────────────────────────────────
class NotaBulkSerializer(serializers.Serializer):
    """
    Recibe {materia_id, lapso_id, notas: [{alumno_id, eval_1..4, observaciones}]}
    y guarda/actualiza todas las notas del grado en una sola llamada.
    """
    materia_id = serializers.IntegerField()
    lapso_id   = serializers.IntegerField()
    notas      = NotaWriteSerializer(many=True)


# ─────────────────────────────────────────────
# ASISTENCIA
# ─────────────────────────────────────────────
def estado_a_booleanos(estado):
    """'R' cuenta como presente (llegó tarde, pero asistió)."""
    if estado in ('P', 'R'):
        return True, False
    if estado == 'J':
        return False, True
    return False, False  # 'A'


class AsistenciaSerializer(serializers.ModelSerializer):
    alumno_nombre = serializers.SerializerMethodField()

    class Meta:
        model  = Asistencia
        fields = ['id', 'alumno_id', 'alumno_nombre', 'fecha', 'presente', 'justificada', 'estado', 'observacion']

    def get_alumno_nombre(self, obj):
        return f"{obj.alumno.nombre} {obj.alumno.apellido}"


# ─────────────────────────────────────────────
# ASISTENCIA — registro individual dentro del bulk
# ─────────────────────────────────────────────
class AsistenciaRegistroSerializer(serializers.Serializer):
    alumno_id   = serializers.IntegerField()
    # 'estado' es la fuente de verdad para escrituras nuevas (incluye 'R').
    # presente/justificada quedan como fallback opcional para no romper
    # integraciones que aún no migraron al campo nuevo.
    estado      = serializers.ChoiceField(choices=Asistencia.ESTADOS, required=False, allow_null=True)
    presente    = serializers.BooleanField(required=False)
    justificada = serializers.BooleanField(required=False, default=False)
    observacion = serializers.CharField(required=False, allow_blank=True, default='')

    def validate(self, data):
        if 'estado' not in data or data.get('estado') is None:
            if 'presente' not in data:
                raise serializers.ValidationError('Se requiere "estado" o "presente".')
            return data
        data['presente'], data['justificada'] = estado_a_booleanos(data['estado'])
        return data


# ─────────────────────────────────────────────
# ASISTENCIA — BULK (asistencia de un grado completo en un día)
# ─────────────────────────────────────────────
class AsistenciaBulkSerializer(serializers.Serializer):
    """
    Recibe {fecha, grado_seccion, registros: [{alumno_id, presente, justificada, observacion}]}
    y guarda/actualiza la asistencia de todos los alumnos de un grado en un solo request.
    """
    fecha         = serializers.DateField()
    grado_seccion = serializers.CharField(max_length=50)
    registros     = AsistenciaRegistroSerializer(many=True)


# ─────────────────────────────────────────────
# HORARIO DE CLASE
# ─────────────────────────────────────────────
class MateriaMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Materia
        fields = ['id', 'nombre']


class HorarioClaseSerializer(serializers.ModelSerializer):
    materia      = MateriaMiniSerializer(read_only=True)
    materia_id   = serializers.PrimaryKeyRelatedField(
        queryset=Materia.objects.all(), source='materia', write_only=True
    )
    dia_semana_label = serializers.SerializerMethodField()

    class Meta:
        model  = HorarioClase
        fields = [
            'id', 'materia', 'materia_id',
            'dia_semana', 'dia_semana_label',
            'hora_inicio', 'hora_fin', 'aula',
        ]

    def get_dia_semana_label(self, obj):
        return obj.get_dia_semana_display()


# ─────────────────────────────────────────────
# INCIDENTE DISCIPLINARIO
# ─────────────────────────────────────────────
class IncidenteDisciplinarioSerializer(serializers.ModelSerializer):
    alumno_id        = serializers.PrimaryKeyRelatedField(source='alumno', queryset=Alumno.objects.all())
    alumno_nombre    = serializers.SerializerMethodField()
    severidad_label  = serializers.SerializerMethodField()
    registrado_por_username = serializers.SerializerMethodField()

    class Meta:
        model  = IncidenteDisciplinario
        fields = [
            'id', 'alumno_id', 'alumno_nombre', 'fecha', 'descripcion',
            'severidad', 'severidad_label', 'adjunto',
            'registrado_por_username', 'created_at',
        ]
        read_only_fields = ['fecha', 'created_at']

    def get_alumno_nombre(self, obj):
        return f"{obj.alumno.nombre} {obj.alumno.apellido}"

    def get_severidad_label(self, obj):
        return obj.get_severidad_display()

    def get_registrado_por_username(self, obj):
        return obj.registrado_por.username if obj.registrado_por else None


# ─────────────────────────────────────────────
# MATERIA — MINI (para "mis materias" del docente)
# ─────────────────────────────────────────────
class MateriaDocenteSerializer(serializers.ModelSerializer):
    cantidad_alumnos = serializers.SerializerMethodField()
    porcentaje_aprobados = serializers.SerializerMethodField()

    class Meta:
        model  = Materia
        fields = ['id', 'nombre', 'codigo', 'grado_seccion', 'cantidad_alumnos', 'porcentaje_aprobados']

    def get_cantidad_alumnos(self, obj):
        if not obj.grado_seccion:
            return 0
        return Alumno.objects.filter(grado_seccion__iexact=obj.grado_seccion).count()

    def get_porcentaje_aprobados(self, obj):
        # Cache por grado_seccion dentro del propio serializer: un docente
        # puede tener varias materias en la misma sección (evita recalcular
        # el rendimiento de esa sección más de una vez en la misma lista).
        cache = self.context.setdefault('_rendimiento_cache', {})
        if obj.grado_seccion not in cache:
            cache[obj.grado_seccion] = calcular_rendimiento_seccion(obj.grado_seccion)
        rendimiento = cache[obj.grado_seccion]
        for entrada in rendimiento['por_materia']:
            if entrada['materia_id'] == obj.id:
                return entrada['porcentaje_aprobados']
        return None


# ─────────────────────────────────────────────
# MATERIAL DE ESTUDIO
# ─────────────────────────────────────────────
class MaterialEstudioSerializer(serializers.ModelSerializer):
    materia_id       = serializers.PrimaryKeyRelatedField(source='materia', queryset=Materia.objects.all())
    materia_nombre   = serializers.SerializerMethodField()
    publicado_por_username = serializers.SerializerMethodField()

    class Meta:
        model  = MaterialEstudio
        fields = [
            'id', 'materia_id', 'materia_nombre', 'titulo', 'descripcion',
            'archivo', 'enlace', 'publicado_por_username', 'fecha',
        ]
        read_only_fields = ['fecha']

    def get_materia_nombre(self, obj):
        return obj.materia.nombre

    def get_publicado_por_username(self, obj):
        return obj.publicado_por.username if obj.publicado_por else None

    def validate_enlace(self, value):
        # El campo es opcional (blank=True); solo se valida el esquema si
        # trae contenido, para evitar XSS vía "javascript:" u otros esquemas
        # no http(s) que el frontend renderiza directo en un <a href>.
        if value:
            value = value.strip()
            if value and not (value.startswith('http://') or value.startswith('https://')):
                raise serializers.ValidationError(
                    'El enlace debe comenzar con http:// o https://.'
                )
        return value


# ─────────────────────────────────────────────
# EVENTO DE CALENDARIO
# ─────────────────────────────────────────────
class EventoCalendarioSerializer(serializers.ModelSerializer):
    tipo_label = serializers.SerializerMethodField()

    class Meta:
        model  = EventoCalendario
        fields = ['id', 'titulo', 'fecha', 'hora', 'descripcion', 'tipo', 'tipo_label']

    def get_tipo_label(self, obj):
        return obj.get_tipo_display()


# ─────────────────────────────────────────────
# PLAN DE EVALUACIÓN — lectura (GET, respuesta anidada)
# ─────────────────────────────────────────────
class ItemEvaluacionSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ItemEvaluacion
        fields = ['id', 'nombre', 'fecha', 'valor_maximo', 'orden']


class BloqueEvaluacionSerializer(serializers.ModelSerializer):
    items = ItemEvaluacionSerializer(many=True, read_only=True)

    class Meta:
        model  = BloqueEvaluacion
        fields = ['id', 'nombre', 'total_puntos', 'modo', 'orden', 'items']


class PlanEvaluacionSerializer(serializers.ModelSerializer):
    # Django crea automáticamente el atributo <fk>_id para cada ForeignKey,
    # por eso alcanza con IntegerField(read_only=True) sin declarar source.
    materia_id = serializers.IntegerField(read_only=True)
    lapso_id   = serializers.IntegerField(read_only=True)
    bloques    = BloqueEvaluacionSerializer(many=True, read_only=True)

    class Meta:
        model  = PlanEvaluacion
        fields = ['id', 'materia_id', 'lapso_id', 'bloques']


# ─────────────────────────────────────────────
# PLAN DE EVALUACIÓN — escritura (POST/PATCH, payload anidado)
# ─────────────────────────────────────────────
class ItemEvaluacionInputSerializer(serializers.Serializer):
    # 'id' es opcional: si viene y coincide con un ítem existente del bloque,
    # se actualiza en lugar de recrearse (preserva las notas ya cargadas,
    # que están ligadas al item_id vía NotaItemEvaluacion).
    id           = serializers.IntegerField(required=False)
    nombre       = serializers.CharField(max_length=150)
    fecha        = serializers.DateField(required=False, allow_null=True)
    valor_maximo = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)
    orden        = serializers.IntegerField(required=False, default=0)


class BloqueEvaluacionInputSerializer(serializers.Serializer):
    id           = serializers.IntegerField(required=False)
    nombre       = serializers.CharField(max_length=100)
    total_puntos = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)
    modo         = serializers.ChoiceField(choices=BloqueEvaluacion.MODO_CHOICES, required=False, default='puntos')
    orden        = serializers.IntegerField(required=False, default=0)
    items        = ItemEvaluacionInputSerializer(many=True)


class PlanEvaluacionInputSerializer(serializers.Serializer):
    """Payload compartido por POST y PATCH de PlanEvaluacionView.
    materia_id/lapso_id NO van aquí: se toman de los query params
    (?materia_id=&lapso_id=), igual en los 3 métodos del endpoint."""
    bloques = BloqueEvaluacionInputSerializer(many=True)


# ─────────────────────────────────────────────
# NOTAS DEL PLAN DE EVALUACIÓN — bulk (POST)
# ─────────────────────────────────────────────
class NotaItemInputSerializer(serializers.Serializer):
    item_id        = serializers.IntegerField()
    alumno_id      = serializers.IntegerField()
    valor_numerico = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)
    valor_letra    = serializers.ChoiceField(choices=NotaItemEvaluacion.LETRA_CHOICES, required=False, allow_null=True)


class NotaItemBulkSerializer(serializers.Serializer):
    """
    Recibe {materia_id, lapso_id, notas: [{item_id, alumno_id, valor_numerico|valor_letra}]}
    y guarda/actualiza las notas por ítem del plan de evaluación en una sola llamada.
    Mismo estilo que NotaBulkSerializer (sistema de Nota clásico).
    """
    materia_id = serializers.IntegerField()
    lapso_id   = serializers.IntegerField()
    notas      = NotaItemInputSerializer(many=True)
