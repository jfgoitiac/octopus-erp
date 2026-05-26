from rest_framework import serializers
from .models import Empleado

class EmpleadoSerializer(serializers.ModelSerializer):
    """
    Serializer completo para el modelo Empleado.
    """
    class Meta:
        model = Empleado
        fields = '__all__'