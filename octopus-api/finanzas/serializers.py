from rest_framework import serializers
from .models import CategoriaGasto, PresupuestoCategoria, Proveedor


class CategoriaGastoSerializer(serializers.ModelSerializer):
    hijas = serializers.SerializerMethodField()
    class Meta:
        model = CategoriaGasto; fields = '__all__'
    def get_hijas(self, obj): return CategoriaGastoSerializer(obj.hijas.all(), many=True).data
    def validate_padre(self, padre):
        if padre and padre.padre_id: raise serializers.ValidationError('Solo se permiten dos niveles.')
        return padre


class ProveedorSerializer(serializers.ModelSerializer):
    class Meta:
        model=Proveedor; fields='__all__'; read_only_fields=('creado_por','creado_en','actualizado_en')


class PresupuestoCategoriaSerializer(serializers.ModelSerializer):
    class Meta:
        model=PresupuestoCategoria; fields='__all__'; read_only_fields=('creado_por','creado_en')
