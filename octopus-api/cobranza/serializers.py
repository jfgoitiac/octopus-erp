from decimal import Decimal
from rest_framework import serializers
from .models import BancoInstitucional, CierreCaja, Pago, TasaCambio
from secretaria.models import Alumno

class BancoInstitucionalSerializer(serializers.ModelSerializer):
    class Meta:
        model = BancoInstitucional
        fields = '__all__'

class CierreCajaSerializer(serializers.ModelSerializer):
    usuario_nombre = serializers.ReadOnlyField(source='usuario_cierre.username')

    class Meta:
        model = CierreCaja
        fields = [
            'id', 
            'usuario_cierre', 
            'usuario_nombre', 
            'fecha_cierre',
            'monto_sistema_ves', 
            'monto_declarado_ves', 
            'diferencia',
            'observaciones', 
            'validado_por_director'
        ]
        read_only_fields = ['monto_sistema_ves', 'diferencia', 'fecha_cierre']
class DashboardStatsSerializer(serializers.Serializer):
    solventes = serializers.IntegerField()
    morosos = serializers.IntegerField()
    tasa_bcv = serializers.DecimalField(max_digits=12, decimal_places=2)        

class PagoSerializer(serializers.ModelSerializer):
    nombre_alumno = serializers.ReadOnlyField(source='alumno.nombre')
    apellido_alumno = serializers.ReadOnlyField(source='alumno.apellido')
    cajero = serializers.ReadOnlyField(source='usuario_receptor.username')
    banco_nombre = serializers.ReadOnlyField(source='banco_receptor.nombre', allow_null=True)

    class Meta:
        model = Pago
        fields = [
            'id', 'factura_id', 'alumno', 'nombre_alumno', 'apellido_alumno',
            'usuario_receptor', 'cajero', 'operacion_uuid', 'banco_receptor', 'banco_nombre',
            'metodo_pago', 'concepto', 'monto_usd', 'tasa_aplicada', 'monto_ves', 'fecha_pago',
            'referencia', 'estatus', 'observaciones', 'representante_documento', 'representante_nombre'
        ]
        read_only_fields = ['factura_id', 'monto_ves', 'fecha_pago', 'tasa_aplicada']


class DesglosePagoSerializer(serializers.ModelSerializer):
    metodo_pago_display = serializers.CharField(source='get_metodo_pago_display', read_only=True)
    banco_nombre = serializers.ReadOnlyField(source='banco_receptor.nombre', allow_null=True)

    class Meta:
        model = Pago
        fields = ['id', 'factura_id', 'metodo_pago', 'metodo_pago_display', 'banco_nombre',
                  'monto_usd', 'monto_ves', 'tasa_aplicada', 'referencia']


class ComprobanteSerializer(serializers.ModelSerializer):
    nombre_alumno = serializers.ReadOnlyField(source='alumno.nombre')
    apellido_alumno = serializers.ReadOnlyField(source='alumno.apellido')
    cedula_escolar = serializers.ReadOnlyField(source='alumno.cedula_escolar')
    grado = serializers.ReadOnlyField(source='alumno.grado_seccion')
    cajero = serializers.ReadOnlyField(source='usuario_receptor.username')
    banco_nombre = serializers.ReadOnlyField(source='banco_receptor.nombre', allow_null=True)
    metodo_pago_display = serializers.CharField(source='get_metodo_pago_display', read_only=True)
    concepto_display = serializers.CharField(source='get_concepto_display', read_only=True)
    estatus_display = serializers.CharField(source='get_estatus_display', read_only=True)
    desglose_pagos = serializers.SerializerMethodField()
    total_ves = serializers.SerializerMethodField()
    total_usd = serializers.SerializerMethodField()

    def get_desglose_pagos(self, obj):
        hermanos = Pago.objects.filter(
            operacion_uuid=obj.operacion_uuid
        ).select_related('banco_receptor').order_by('id')
        return DesglosePagoSerializer(hermanos, many=True).data

    def get_total_ves(self, obj):
        from django.db.models import Sum
        total = Pago.objects.filter(operacion_uuid=obj.operacion_uuid).aggregate(t=Sum('monto_ves'))['t']
        return str(total or obj.monto_ves)

    def get_total_usd(self, obj):
        from django.db.models import Sum
        total = Pago.objects.filter(operacion_uuid=obj.operacion_uuid).aggregate(t=Sum('monto_usd'))['t']
        return str(total or obj.monto_usd)

    class Meta:
        model = Pago
        fields = [
            'id', 'factura_id', 'nombre_alumno', 'apellido_alumno', 'cedula_escolar', 'grado',
            'cajero', 'banco_nombre', 'metodo_pago', 'metodo_pago_display', 'concepto',
            'concepto_display', 'monto_usd', 'tasa_aplicada', 'monto_ves', 'fecha_pago',
            'referencia', 'estatus', 'estatus_display', 'observaciones',
            'representante_documento', 'representante_nombre',
            'desglose_pagos', 'total_ves', 'total_usd',
        ]

class PagoCreateSerializer(serializers.Serializer):
    alumno_id = serializers.IntegerField()
    concepto = serializers.CharField(max_length=20, default='mensualidad', required=False)
    pagos = serializers.ListField(
        child=serializers.DictField(),
        allow_empty=False
    )
    representante_documento = serializers.CharField(max_length=30, required=False, allow_blank=True)
    representante_nombre = serializers.CharField(max_length=150, required=False, allow_blank=True)
    mensualidad_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True
    )
    cuota_inscripcion_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True
    )
    operacion_uuid = serializers.UUIDField(required=False)
    vuelto_usd = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, default=Decimal('0.00'))
    vuelto_ves = serializers.DecimalField(max_digits=20, decimal_places=2, required=False, default=Decimal('0.00'))

    def validate(self, data):
        try:
            data['alumno'] = Alumno.objects.get(id=data['alumno_id'])
        except Alumno.DoesNotExist:
            raise serializers.ValidationError({"alumno_id": "Alumno no encontrado."})
        
        try:
            data['tasa'] = TasaCambio.objects.latest('fecha')
        except TasaCambio.DoesNotExist:
            raise serializers.ValidationError({"tasa": "No se ha registrado ninguna tasa de cambio."})
        
        # Validate each payment item
        for i, pago_item in enumerate(data['pagos']):
            if 'metodo_pago' not in pago_item:
                raise serializers.ValidationError(f"Pago {i}: El método de pago es requerido.")
            if not pago_item.get('monto_usd') and not pago_item.get('monto_ves'):
                raise serializers.ValidationError(f"Pago {i}: Se requiere monto en USD o VES.")
            if pago_item.get('banco_receptor_id'):
                try:
                    BancoInstitucional.objects.get(id=pago_item['banco_receptor_id'])
                except BancoInstitucional.DoesNotExist:
                    raise serializers.ValidationError(f"Pago {i}: Banco receptor no encontrado.")
            
            # Ensure monto_usd and monto_ves are Decimal
            pago_item['monto_usd'] = Decimal(str(pago_item.get('monto_usd', 0)))
            pago_item['monto_ves'] = Decimal(str(pago_item.get('monto_ves', 0)))

        return data


        