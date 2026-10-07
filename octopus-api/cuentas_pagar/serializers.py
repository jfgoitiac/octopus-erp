from rest_framework import serializers
from .models import CuentaPorPagar, PagoCuentaPagar, ComprobantePagoCxP, CuotaCuentaPagar
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
    def get_situacion(self,obj): return situacion(obj)

class CuotaSerializer(serializers.ModelSerializer):
    class Meta: model=CuotaCuentaPagar; fields=('id','numero','fecha_vencimiento','monto','pagado','estado')
