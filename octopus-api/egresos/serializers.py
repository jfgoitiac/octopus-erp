from rest_framework import serializers
from finanzas.monedas import tasa_para_fecha
from .models import (ArticuloFrecuente, ComprobanteEgreso, ConfiguracionEgresos, DetallePagoCuentaPorPagar,
                     Egreso, RenglonEgreso)
from .services import calcular_totales
from .validators import validar_comprobante


class RenglonEgresoSerializer(serializers.ModelSerializer):
    class Meta: model=RenglonEgreso; fields=('id','descripcion','articulo','cantidad','precio_unitario','descuento','total','orden'); read_only_fields=('total',)
    def validate(self, attrs):
        cantidad = attrs.get('cantidad', getattr(self.instance, 'cantidad', 1))
        precio = attrs.get('precio_unitario', getattr(self.instance, 'precio_unitario', 0))
        descuento = attrs.get('descuento', getattr(self.instance, 'descuento', 0))
        if descuento < 0 or descuento > cantidad * precio:
            raise serializers.ValidationError({'descuento': 'Debe estar entre cero y el importe del renglón.'})
        return attrs

class DetallePagoSerializer(serializers.ModelSerializer):
    class Meta: model=DetallePagoCuentaPorPagar; fields='__all__'

class EgresoSerializer(serializers.ModelSerializer):
    renglones=RenglonEgresoSerializer(many=True, required=False)
    pagos_cuenta_por_pagar=DetallePagoSerializer(many=True, read_only=True)
    class Meta:
        model=Egreso; fields='__all__'; read_only_fields=('estado','origen','cuenta_por_pagar_id','monto_usd','monto_ves','total_pagado','monto_usd_pagado','monto_ves_pagado','creado_por','anulado_por','anulado_en')
    def validate(self, attrs):
        if self.instance and self.instance.origen == 'cuenta_por_pagar': raise serializers.ValidationError('Los egresos de CxP no se editan aquí.')
        if attrs.get('condicion', getattr(self.instance, 'condicion', 'contado')) != 'contado': raise serializers.ValidationError({'condicion':'Egresos solo admite contado.'})
        fecha=attrs.get('fecha_emision', getattr(self.instance,'fecha_emision',None))
        # La tasa oficial se toma al crear; nunca se fuerza una tasa inexistente en borradores históricos.
        if not self.instance and fecha and not attrs.get('tasa_aplicada'):
            attrs['tasa_aplicada'] = tasa_para_fecha(fecha).valor_bs
        tasa=attrs.get('tasa_aplicada')
        if fecha and tasa:
            oficial=tasa_para_fecha(fecha).valor_bs
            if tasa != oficial and not attrs.get('motivo_cambio_tasa', getattr(self.instance,'motivo_cambio_tasa','')): raise serializers.ValidationError({'motivo_cambio_tasa':'Obligatorio al modificar la tasa BCV.'})
        return attrs
    def create(self, validated_data):
        renglones=validated_data.pop('renglones',[]); validated_data['condicion']='contado'; validated_data['origen']='factura'; validated_data['creado_por']=self.context['request'].user
        totales=calcular_totales({**validated_data,'renglones':renglones})
        validated_data.update(totales); e=Egreso.objects.create(**validated_data)
        for i,r in enumerate(renglones): RenglonEgreso.objects.create(egreso=e, orden=i, total=calcular_totales({'renglones':[r], 'moneda':'USD','tasa_aplicada':1})['subtotal'], **r)
        return e
    def update(self, instance, validated_data):
        renglones=validated_data.pop('renglones',None)
        for k,v in validated_data.items(): setattr(instance,k,v)
        if renglones is not None:
            instance.renglones.all().delete()
            for i,r in enumerate(renglones): RenglonEgreso.objects.create(egreso=instance,orden=i,total=calcular_totales({'renglones':[r],'moneda':'USD','tasa_aplicada':1})['subtotal'],**r)
        if instance.estado == 'borrador':
            totales=calcular_totales({'renglones': list(instance.renglones.values()), 'moneda':instance.moneda,'tasa_aplicada':instance.tasa_aplicada,'porcentaje_iva':instance.porcentaje_iva,'aplica_igtf':instance.aplica_igtf,'retiene_iva':instance.retiene_iva,'porcentaje_retencion_iva':instance.porcentaje_retencion_iva,'retiene_islr':instance.retiene_islr,'porcentaje_retencion_islr':instance.porcentaje_retencion_islr})
            for k,v in totales.items(): setattr(instance,k,v)
        instance.full_clean(); instance.save(); return instance


class ComprobanteSerializer(serializers.ModelSerializer):
    class Meta: model=ComprobanteEgreso; fields='__all__'; read_only_fields=('egreso','subido_por','activo','eliminado_por','eliminado_en')
    def validate_archivo(self, value): validar_comprobante(value); return value

class ArticuloFrecuenteSerializer(serializers.ModelSerializer):
    class Meta: model=ArticuloFrecuente; fields='__all__'

class ConfiguracionEgresosSerializer(serializers.ModelSerializer):
    class Meta: model=ConfiguracionEgresos; fields='__all__'; read_only_fields=('actualizado_por','actualizado_en')
