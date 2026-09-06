from rest_framework import serializers
from .models import Empleado, ConceptoNomina, ParametroLegalNomina, RegistroNomina

class EmpleadoSerializer(serializers.ModelSerializer):
    """
    Serializer completo para el modelo Empleado.
    """
    empleado_rrhh_activo = serializers.SerializerMethodField()
    empleado_rrhh_nombre = serializers.SerializerMethodField()

    class Meta:
        model = Empleado
        fields = '__all__'
        # empleado_rrhh_activo / empleado_rrhh_nombre no son campos del modelo,
        # DRF los incluye automáticamente por estar declarados arriba.

    def get_empleado_rrhh_activo(self, obj):
        """
        Indica el estado 'activo' del Empleado vinculado en rrhh, para que el
        admin pueda detectar divergencias (ej. desactivado en RRHH pero
        todavía presente en nómina). None si no hay vínculo.
        """
        if obj.empleado_rrhh_id:
            return obj.empleado_rrhh.activo
        return None


class ParametroLegalNominaSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParametroLegalNomina
        fields = '__all__'


class ConceptoNominaSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConceptoNomina
        fields = '__all__'


class RegistroNominaSerializer(serializers.ModelSerializer):
    empleado_nombre = serializers.SerializerMethodField()
    empleado_rrhh_nombre = serializers.SerializerMethodField()

    class Meta:
        model = RegistroNomina
        fields = '__all__'
        read_only_fields = [
            'fecha_proceso', 'monto_sso', 'monto_lph', 'total_pagar_ves',
            'porcentaje_sso_aplicado', 'porcentaje_lph_aplicado',
        ]

    def get_empleado_nombre(self, obj):
        return f'{obj.empleado.nombre} {obj.empleado.apellido}'

    def get_empleado_rrhh_nombre(self, obj):
        rrhh = obj.empleado.empleado_rrhh
        if rrhh:
            return f"{rrhh.nombre} {rrhh.apellido}"
        return None
