from rest_framework import serializers
from .models import Materia, Lapso, Nota, Asistencia, HorarioClase


# ─────────────────────────────────────────────
# MATERIA
# ─────────────────────────────────────────────
class MateriaSerializer(serializers.ModelSerializer):
    # Mostrar id y username del docente en GET; aceptar solo id en escritura
    docente_id       = serializers.PrimaryKeyRelatedField(
        source='docente', read_only=True
    )
    docente_username = serializers.SerializerMethodField()

    class Meta:
        model  = Materia
        fields = ['id', 'nombre', 'codigo', 'grado_seccion', 'docente_id', 'docente_username', 'activa', 'horas_academicas']

    def get_docente_username(self, obj):
        if obj.docente:
            return obj.docente.username
        return None


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
class AsistenciaSerializer(serializers.ModelSerializer):
    alumno_nombre = serializers.SerializerMethodField()

    class Meta:
        model  = Asistencia
        fields = ['id', 'alumno_id', 'alumno_nombre', 'fecha', 'presente', 'justificada', 'observacion']

    def get_alumno_nombre(self, obj):
        return f"{obj.alumno.nombre} {obj.alumno.apellido}"


# ─────────────────────────────────────────────
# ASISTENCIA — registro individual dentro del bulk
# ─────────────────────────────────────────────
class AsistenciaRegistroSerializer(serializers.Serializer):
    alumno_id   = serializers.IntegerField()
    presente    = serializers.BooleanField()
    justificada = serializers.BooleanField(required=False, default=False)
    observacion = serializers.CharField(required=False, allow_blank=True, default='')


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
