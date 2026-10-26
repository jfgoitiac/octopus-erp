from django.db import transaction
from rest_framework import serializers

from .models import PlantillaVenta, PlantillaVentaItem


class PlantillaVentaItemSerializer(serializers.ModelSerializer):
    producto_nombre = serializers.CharField(source='producto.nombre', read_only=True)
    precio = serializers.DecimalField(source='producto.precio', max_digits=8, decimal_places=2, read_only=True)
    stock_actual = serializers.IntegerField(source='producto.stock_actual', read_only=True)
    producto_activo = serializers.BooleanField(source='producto.activo', read_only=True)

    class Meta:
        model = PlantillaVentaItem
        fields = ('producto', 'producto_nombre', 'precio', 'stock_actual', 'producto_activo', 'cantidad')

    def validate_cantidad(self, value):
        if value < 1:
            raise serializers.ValidationError('La cantidad debe ser al menos 1.')
        return value


class PlantillaVentaSerializer(serializers.ModelSerializer):
    items = PlantillaVentaItemSerializer(many=True)
    total_usd = serializers.SerializerMethodField()

    class Meta:
        model = PlantillaVenta
        fields = ('id', 'nombre', 'area', 'activo', 'orden', 'items', 'total_usd')

    def get_total_usd(self, obj):
        return str(sum(i.producto.precio * i.cantidad for i in obj.items.all()))

    def validate_nombre(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('El nombre es obligatorio.')
        return value

    def validate(self, attrs):
        items = attrs.get('items')
        area = attrs.get('area') or (self.instance.area if self.instance else 'cantina')
        nombre = attrs.get('nombre', self.instance.nombre if self.instance else None)
        if items is not None:
            if not items:
                raise serializers.ValidationError({'items': 'Agrega al menos un producto.'})
            ids = [i['producto'].id for i in items]
            if len(ids) != len(set(ids)):
                raise serializers.ValidationError({'items': 'Hay productos repetidos en la plantilla.'})
            for i in items:
                if i['producto'].area != area:
                    raise serializers.ValidationError(
                        {'items': f'"{i["producto"].nombre}" no pertenece al área de la plantilla.'}
                    )
        duplicada = PlantillaVenta.objects.filter(area=area, nombre__iexact=nombre)
        if self.instance:
            duplicada = duplicada.exclude(pk=self.instance.pk)
        if nombre and duplicada.exists():
            raise serializers.ValidationError({'nombre': 'Ya existe una plantilla con ese nombre en esta caja.'})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        items = validated_data.pop('items')
        plantilla = PlantillaVenta.objects.create(**validated_data)
        PlantillaVentaItem.objects.bulk_create(PlantillaVentaItem(plantilla=plantilla, **i) for i in items)
        return plantilla

    @transaction.atomic
    def update(self, instance, validated_data):
        items = validated_data.pop('items', None)
        for campo, valor in validated_data.items():
            setattr(instance, campo, valor)
        instance.save()
        if items is not None:
            instance.items.all().delete()
            PlantillaVentaItem.objects.bulk_create(PlantillaVentaItem(plantilla=instance, **i) for i in items)
        return instance
