from rest_framework import serializers
from .models import Empleado, TipoCargo


class TipoCargoSerializer(serializers.ModelSerializer):
    class Meta:
        model = TipoCargo
        fields = '__all__'


class EmpleadoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Empleado
        fields = '__all__'
        read_only_fields = ['fecha_contratacion']