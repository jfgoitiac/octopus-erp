from rest_framework import serializers
from .models import Empleado, TipoCargo, BancoNomina


class TipoCargoSerializer(serializers.ModelSerializer):
    class Meta:
        model = TipoCargo
        fields = '__all__'


class BancoNominaSerializer(serializers.ModelSerializer):
    class Meta:
        model = BancoNomina
        fields = '__all__'


class EmpleadoSerializer(serializers.ModelSerializer):
    banco_nombre = serializers.CharField(source='banco.nombre', read_only=True)

    class Meta:
        model = Empleado
        fields = '__all__'
        read_only_fields = ['fecha_contratacion']
