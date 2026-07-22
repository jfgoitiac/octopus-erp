from decimal import Decimal
from rest_framework import serializers
from .models import BancoInstitucional, CierreCaja, Pago, SolvenciaRepresentante, TasaCambio
from secretaria.models import Alumno

class BancoInstitucionalSerializer(serializers.ModelSerializer):
    tipos = serializers.ListField(
        child=serializers.ChoiceField(choices=BancoInstitucional.TIPOS),
        allow_empty=True,
        required=False,
    )

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
            'referencia', 'numero_lote', 'estatus', 'observaciones', 'representante_documento', 'representante_nombre'
        ]
        read_only_fields = ['factura_id', 'monto_ves', 'fecha_pago', 'tasa_aplicada']


class DesglosePagoSerializer(serializers.ModelSerializer):
    metodo_pago_display = serializers.CharField(source='get_metodo_pago_display', read_only=True)
    banco_nombre = serializers.ReadOnlyField(source='banco_receptor.nombre', allow_null=True)

    class Meta:
        model = Pago
        fields = ['id', 'factura_id', 'metodo_pago', 'metodo_pago_display', 'banco_nombre',
                  'monto_usd', 'monto_ves', 'tasa_aplicada', 'referencia', 'numero_lote']


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
    numero_solvencia = serializers.SerializerMethodField()

    def get_numero_solvencia(self, obj):
        """Solo la factura que generó la solvencia la muestra en reimpresión,
        igual que en la impresión original — es intransferible a otras facturas.
        Usa list(...all())[0] en vez de .first(): con prefetch_related
        ('solvencias_generadas') aplicado en la vista, .first() ignoraría el
        cache del prefetch y dispararía una query nueva por cada fila igual."""
        solvencias = list(obj.solvencias_generadas.all())
        return solvencias[0].numero if solvencias else None

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

    def _get_hermanos(self, obj):
        """Los 'hermanos' (pagos de la misma operacion_uuid) se consultan una sola
        vez por operación y se reusan entre get_desglose_pagos/get_total_ves/
        get_total_usd — antes cada uno lanzaba su propia query (N+1 con hasta
        100 filas por página en ConsultaComprobantesView)."""
        cache = self.context.setdefault('_hermanos_cache', {})
        key = obj.operacion_uuid
        if key not in cache:
            cache[key] = list(
                Pago.objects.filter(operacion_uuid=key)
                .select_related('banco_receptor')
                .order_by('id')
            )
        return cache[key]

    def get_desglose_pagos(self, obj):
        hermanos = self._get_hermanos(obj)
        return DesglosePagoSerializer(hermanos, many=True).data

    def get_total_ves(self, obj):
        total = sum((h.monto_ves for h in self._get_hermanos(obj)), Decimal('0'))
        return str(total or obj.monto_ves)

    def get_total_usd(self, obj):
        total = sum((h.monto_usd for h in self._get_hermanos(obj)), Decimal('0'))
        return str(total or obj.monto_usd)

    class Meta:
        model = Pago
        fields = [
            'id', 'factura_id', 'nombre_alumno', 'apellido_alumno', 'cedula_escolar', 'grado',
            'cajero', 'banco_nombre', 'metodo_pago', 'metodo_pago_display', 'concepto',
            'concepto_display', 'monto_usd', 'tasa_aplicada', 'monto_ves', 'fecha_pago',
            'referencia', 'estatus', 'estatus_display', 'observaciones',
            'representante_documento', 'representante_nombre',
            'desglose_pagos', 'total_ves', 'total_usd', 'numero_solvencia',
        ]

class SolvenciaRepresentanteSerializer(serializers.ModelSerializer):
    representante_cedula = serializers.ReadOnlyField(source='representante.cedula')
    representante_nombre = serializers.SerializerMethodField()
    origen_display = serializers.CharField(source='get_origen_display', read_only=True)
    emitida_por_nombre = serializers.ReadOnlyField(source='emitida_por.username', allow_null=True)

    def get_representante_nombre(self, obj):
        return f"{obj.representante.nombre} {obj.representante.apellido}".strip()

    class Meta:
        model = SolvenciaRepresentante
        fields = [
            'id', 'numero', 'representante_cedula', 'representante_nombre',
            'periodo_escolar', 'origen', 'origen_display', 'fecha_generacion',
            'pago_generador', 'emitida_por_nombre', 'observaciones',
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
    numero_lote       = serializers.CharField(max_length=10, required=False, allow_blank=True, default='')
    observaciones     = serializers.CharField(max_length=500, required=False, allow_blank=True, default='')


class AlumnoPagoItemSerializer(serializers.Serializer):
    """Deudas seleccionadas para UN alumno dentro de una transacción que puede
    cubrir a varios hermanos a la vez (mismo representante, un solo recibo)."""
    alumno_id = serializers.IntegerField()
    mensualidad_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list, allow_empty=True
    )
    mensualidad_adelanto_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list, allow_empty=True
    )
    cuota_inscripcion_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list, allow_empty=True
    )
    cuota_solvencia_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list, allow_empty=True
    )


class PagoCreateSerializer(serializers.Serializer):
    alumnos = AlumnoPagoItemSerializer(many=True, allow_empty=False)
    concepto = serializers.CharField(max_length=20, default='mensualidad', required=False)
    pagos = PagoItemSerializer(many=True, allow_empty=False)
    representante_documento = serializers.CharField(max_length=30, required=False, allow_blank=True)
    representante_nombre = serializers.CharField(max_length=150, required=False, allow_blank=True)
    proyecto_inversion_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True
    )
    # Abono parcial por cuota de Proyecto de Inversión: {id_cuota: monto_abonado}.
    # Si un id seleccionado no aparece aquí, se asume que se paga el saldo
    # completo (compatibilidad con el flujo sin abono).
    montos_proyecto_inversion = serializers.DictField(
        child=serializers.DecimalField(max_digits=10, decimal_places=2),
        required=False,
        default=dict,
    )
    operacion_uuid = serializers.UUIDField(required=False)
    vuelto_usd = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, default=Decimal('0.00'))
    vuelto_ves = serializers.DecimalField(max_digits=20, decimal_places=2, required=False, default=Decimal('0.00'))

    def validate(self, data):
        alumnos_resueltos = []
        representantes = set()
        for item in data['alumnos']:
            try:
                alumno_obj = Alumno.objects.select_related('representante').get(id=item['alumno_id'])
            except Alumno.DoesNotExist:
                raise serializers.ValidationError({"alumnos": f"Alumno {item['alumno_id']} no encontrado."})
            representantes.add(alumno_obj.representante_id)
            alumnos_resueltos.append({
                'alumno': alumno_obj,
                'mensualidad_ids': item.get('mensualidad_ids') or [],
                'mensualidad_adelanto_ids': item.get('mensualidad_adelanto_ids') or [],
                'cuota_inscripcion_ids': item.get('cuota_inscripcion_ids') or [],
                'cuota_solvencia_ids': item.get('cuota_solvencia_ids') or [],
            })

        if len(representantes) > 1:
            raise serializers.ValidationError(
                {"alumnos": "Todos los alumnos de una misma transacción deben pertenecer al mismo representante."}
            )

        data['alumnos_resueltos'] = alumnos_resueltos
        # Alumno "titular" de la operación: se usa para el campo Pago.alumno
        # (FK singular) y como referencia de representante/documento. Las
        # deudas de cada hermano se enlazan igual vía M2M más abajo en la vista.
        data['alumno'] = alumnos_resueltos[0]['alumno']

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

            # --- Punto de Venta: referencia y lote son de 4 dígitos ---
            if pago_item['metodo_pago'] == 'punto_de_venta':
                ref_pos = pago_item.get('referencia', '').strip()
                lote_pos = pago_item.get('numero_lote', '').strip()
                if not ref_pos.isdigit() or len(ref_pos) != 4:
                    raise serializers.ValidationError(
                        f"Pago {i}: Punto de Venta requiere un número de referencia de 4 dígitos."
                    )
                if not lote_pos.isdigit() or len(lote_pos) != 4:
                    raise serializers.ValidationError(
                        f"Pago {i}: Punto de Venta requiere un número de lote de 4 dígitos."
                    )

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

        # Adelantos de mensualidades futuras: solo se aceptan en Zelle o
        # Efectivo Divisas (USD), para evitar descuadres de tasa/cambio entre
        # el momento del adelanto y el mes en que realmente se factura.
        if any(a['mensualidad_adelanto_ids'] for a in alumnos_resueltos):
            metodos_no_permitidos = {
                p['metodo_pago'] for p in data['pagos']
                if p['metodo_pago'] not in ('zelle', 'efectivo')
            }
            if metodos_no_permitidos:
                raise serializers.ValidationError(
                    "Los adelantos de mensualidades solo se pueden pagar con Zelle o "
                    "Efectivo Divisas (USD)."
                )

        return data


        