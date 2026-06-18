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
    representante_nombre = serializers.SerializerMethodField()

    def get_representante_nombre(self, obj):
        """Devuelve el nombre completo del representante.
        Primero intenta obtenerlo de la relación alumno→representante (fuente de verdad),
        y usa el campo de texto como fallback para registros históricos."""
        try:
            rep = obj.alumno.representante
            if rep:
                nombre = f"{rep.nombre or ''} {rep.apellido or ''}".strip()
                if nombre:
                    return nombre
        except Exception:
            pass
        return obj.representante_nombre or ''

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

class PagoItemSerializer(serializers.Serializer):
    """Esquema estricto para cada método de pago dentro de una transacción."""
    METODOS = [m[0] for m in Pago.METODOS]
    metodo_pago       = serializers.ChoiceField(choices=METODOS)
    monto_usd         = serializers.DecimalField(max_digits=10, decimal_places=2,
                                                  min_value=Decimal('0'), required=False, default=Decimal('0'))
    monto_ves         = serializers.DecimalField(max_digits=20, decimal_places=2,
                                                  min_value=Decimal('0'), required=False, default=Decimal('0'))
    banco_receptor_id = serializers.IntegerField(required=False, allow_null=True)
    referencia        = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    observaciones     = serializers.CharField(max_length=500, required=False, allow_blank=True, default='')


class PagoCreateSerializer(serializers.Serializer):
    alumno_id = serializers.IntegerField()
    concepto = serializers.CharField(max_length=20, default='mensualidad', required=False)
    pagos = PagoItemSerializer(many=True, allow_empty=False)
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

        # PagoItemSerializer ya valida metodo_pago y tipos — aquí validamos semántica
        # y duplicados de referencia de forma anticipada para dar mensajes claros.
        referencias_en_esta_solicitud = []
        for i, pago_item in enumerate(data['pagos']):
            if not pago_item.get('monto_usd') and not pago_item.get('monto_ves'):
                raise serializers.ValidationError(f"Pago {i}: Se requiere monto en USD o VES.")

            if pago_item.get('banco_receptor_id'):
                try:
                    BancoInstitucional.objects.get(id=pago_item['banco_receptor_id'])
                except BancoInstitucional.DoesNotExist:
                    raise serializers.ValidationError(f"Pago {i}: Banco receptor no encontrado.")

            # --- Validación antifraude de referencia ---
            ref_raw = pago_item.get('referencia', '').strip()
            if not ref_raw:
                continue

            ref_normalizada = ' '.join(ref_raw.upper().split())

            # 1. Duplicate dentro de la misma solicitud (dos lineas con misma ref)
            if ref_normalizada in referencias_en_esta_solicitud:
                raise serializers.ValidationError(
                    f"Pago {i}: La referencia '{ref_normalizada}' aparece más de una vez "
                    "en esta transacción. Cada línea de pago debe tener una referencia única."
                )
            referencias_en_esta_solicitud.append(ref_normalizada)

            # 2. Duplicate contra pagos ya registrados en BD
            dup_pago = Pago.objects.filter(
                referencia=ref_normalizada,
                estatus__in=['completado', 'en_revision'],
            ).first()
            if dup_pago:
                raise serializers.ValidationError(
                    f"Pago {i}: La referencia '{ref_normalizada}' ya fue registrada "
                    f"en el pago #{dup_pago.pk} (factura {dup_pago.factura_id or 'N/A'}, "
                    f"alumno: {dup_pago.alumno.nombre} {dup_pago.alumno.apellido}). "
                    "Si cree que es un error, contacte al administrador."
                )

            # 3. Duplicate contra comprobantes pendientes/aprobados del portal
            from portal.models import ComprobantePago
            dup_comp = ComprobantePago.objects.filter(
                referencia_bancaria=ref_normalizada,
                estatus__in=['pendiente', 'aprobado'],
            ).first()
            if dup_comp:
                raise serializers.ValidationError(
                    f"Pago {i}: La referencia '{ref_normalizada}' ya existe en un "
                    f"comprobante del portal (#{dup_comp.pk}, estatus: {dup_comp.estatus}). "
                    "Verifique antes de continuar."
                )

        return data


        