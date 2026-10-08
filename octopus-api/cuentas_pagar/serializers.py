from rest_framework import serializers
from .models import AvisoBandeja, CuentaPorPagar, PagoCuentaPagar, ComprobantePagoCxP, CuotaCuentaPagar, PlantillaRecurrente, ConfiguracionRecordatorios
from .validators import validar_comprobante
from .services import situacion

class ComprobanteSerializer(serializers.ModelSerializer):
    class Meta: model=ComprobantePagoCxP; fields=('id','archivo','descripcion','activo','subido_en')
    def validate_archivo(self, value):
        try: return validar_comprobante(value)
        except Exception as exc: raise serializers.ValidationError(str(exc))

class PagoSerializer(serializers.ModelSerializer):
    comprobantes=ComprobanteSerializer(many=True, read_only=True)
    class Meta:
        model=PagoCuentaPagar
        fields=('id','fecha_pago','moneda','tasa_aplicada','motivo_cambio_tasa','monto_pagado','monto_aplicado','monto_usd','monto_ves','metodo_pago','banco','referencia','nota','estado','comprobantes')
        read_only_fields=('monto_usd','monto_ves','estado')

class CuentaSerializer(serializers.ModelSerializer):
    pagos=PagoSerializer(many=True, read_only=True)
    situacion=serializers.SerializerMethodField()
    class Meta:
        model=CuentaPorPagar
        fields='__all__'; read_only_fields=('numero','saldo','monto_usd','monto_ves','estado','egreso_id','creado_por')
    def validate_monto_documento(self,value):
        # El monto solo se cambia con `confirmar-monto`: editarlo aquí desincroniza saldo y snapshots.
        if self.instance is not None and value != self.instance.monto_documento:
            raise serializers.ValidationError('El monto no es editable; use confirmar-monto.')
        return value
    def get_situacion(self,obj): return situacion(obj)

class CuotaSerializer(serializers.ModelSerializer):
        class Meta: model=CuotaCuentaPagar; fields=('id','numero','fecha_vencimiento','monto','pagado','estado')

class PlantillaRecurrenteSerializer(serializers.ModelSerializer):
    class Meta: model=PlantillaRecurrente; fields='__all__'; read_only_fields=('creado_por','creado_en','actualizado_en')

class ConfiguracionRecordatoriosSerializer(serializers.ModelSerializer):
    class Meta: model=ConfiguracionRecordatorios; fields='__all__'; read_only_fields=('actualizado_por','actualizado_en')

class AvisoBandejaSerializer(serializers.ModelSerializer):
    class Meta:
        model=AvisoBandeja; fields=('id','cuenta','titulo','mensaje','leido','creado_en')
        read_only_fields=('id','cuenta','titulo','mensaje','creado_en')
