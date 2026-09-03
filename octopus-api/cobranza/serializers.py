from decimal import Decimal
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import F, Sum
from rest_framework import serializers
from .models import (
    BancoInstitucional, CierreCaja, ClasificacionPagoManual, CuotaInscripcion,
    CuotaProyectoInversion, CuotaSolvencia, LineaRecargoPago, LoteRevisionCaja,
    Mensualidad, Pago, ReglaRecargoPago, SolvenciaRepresentante, TasaCambio,
    TipoCargoEspecial,
)
from secretaria.models import Alumno, ConfiguracionSistema
from pagos_comunes.referencias import buscar_referencia_duplicada, normalizar_referencia
from .correcciones import fecha_dentro_periodo_activo, fecha_en_cierre_validado

MESES_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

CLASIFICACION_TEMPORAL_DISPLAY = {
    'atrasado':   'Atrasado',
    'al_dia':     'Al día',
    'anticipado': 'Anticipado',
}


def calcular_desglose_automatico(principal_pago):
    """
    Reconstruye las líneas reales (mensualidad/inscripción/solvencia/proyecto
    de inversión) cubiertas por una operación, a partir de las relaciones M2M
    del pago "principal" (mensualidades_pagadas, cuotas_inscripcion_pagadas,
    cuotas_solvencia_pagadas, proyectos_inversion_pagados).

    Extraído de ComprobanteSerializer.get_desglose_conceptos para poder
    reusarlo desde vistas que no pasan por ese serializer (ej. desglose
    contable). Devuelve [] si no hay nada enlazado — a diferencia del método
    original, NO agrega el fallback de una línea cruda: eso queda a criterio
    del caller.
    """
    if not principal_pago:
        return []

    tasa = principal_pago.tasa_aplicada or Decimal('0')
    fecha_pago = principal_pago.fecha_pago

    def _linea(concepto, concepto_display, descripcion, alumno_nombre, monto_usd, extra=None):
        monto_usd = monto_usd or Decimal('0')
        linea = {
            'concepto': concepto,
            'concepto_display': concepto_display,
            'descripcion': descripcion,
            'alumno': alumno_nombre,
            'monto_usd': str(monto_usd.quantize(Decimal('0.01'))),
            'monto_ves': str((monto_usd * tasa).quantize(Decimal('0.01'))),
        }
        if extra:
            linea.update(extra)
        return linea

    lineas = []

    # Recargo por pago tardío: snapshot inmutable (LineaRecargoPago) enlazado
    # a ESTE pago principal. Se indexa por mensualidad_id para insertar cada
    # línea de recargo inmediatamente después de su mensualidad, sin N+1
    # (una sola query para todas).
    recargos_por_mensualidad = {
        r.mensualidad_id: r for r in principal_pago.lineas_recargo.all()
    }

    for m in principal_pago.mensualidades_pagadas.all():
        extra = None
        if fecha_pago:
            periodo_mensualidad = (m.anio, m.mes)
            periodo_pago = (fecha_pago.year, fecha_pago.month)
            if periodo_mensualidad < periodo_pago:
                clasificacion = 'atrasado'
            elif periodo_mensualidad > periodo_pago:
                clasificacion = 'anticipado'
            else:
                clasificacion = 'al_dia'
            dias_diferencia = (periodo_pago[0] - periodo_mensualidad[0]) * 12 + \
                (periodo_pago[1] - periodo_mensualidad[1])
            extra = {
                'mes': m.mes,
                'anio': m.anio,
                'clasificacion_temporal': clasificacion,
                'clasificacion_temporal_display': CLASIFICACION_TEMPORAL_DISPLAY[clasificacion],
                'dias_diferencia': dias_diferencia,
            }
        lineas.append(_linea(
            'mensualidad', 'MENSUALIDAD',
            f"{MESES_ES[m.mes - 1]} {m.anio}",
            f"{m.alumno.nombre} {m.alumno.apellido}",
            m.monto_usd, extra,
        ))

        recargo = recargos_por_mensualidad.get(m.id)
        if recargo:
            lineas.append(_linea(
                'recargo_pago_tardio', 'RECARGO POR PAGO TARDÍO',
                recargo.nombre,
                f"{m.alumno.nombre} {m.alumno.apellido}",
                recargo.monto_usd,
            ))

    for c in principal_pago.cuotas_inscripcion_pagadas.all():
        lineas.append(_linea(
            'inscripcion', 'INSCRIPCIÓN',
            f"Período {c.periodo_escolar}",
            f"{c.alumno.nombre} {c.alumno.apellido}",
            c.monto_usd,
        ))

    for c in principal_pago.cuotas_solvencia_pagadas.all():
        lineas.append(_linea(
            'solvencia', 'SOLVENCIA',
            c.concepto or f"Período {c.periodo_escolar}",
            f"{c.alumno.nombre} {c.alumno.apellido}",
            c.monto_usd,
        ))

    for c in principal_pago.proyectos_inversion_pagados.all():
        lineas.append(_linea(
            'proyecto_inversion', 'PROYECTO DE INVERSIÓN',
            f"Período {c.periodo_escolar}",
            f"{c.representante.nombre} {c.representante.apellido}",
            c.monto_usd,
        ))

    return lineas

class TipoCargoEspecialSerializer(serializers.ModelSerializer):
    class Meta:
        model = TipoCargoEspecial
        fields = '__all__'

    def validate(self, attrs):
        """
        Replica las reglas de TipoCargoEspecial.clean() (no se ejecuta solo,
        DRF no llama full_clean() por default): 'unico' exige
        numero_cuotas=1; toda otra periodicidad exige fecha_primera_cuota.
        Usa el valor ya guardado en updates parciales cuando el campo no
        viene en el payload.
        """
        def valor(campo, default=None):
            if campo in attrs:
                return attrs[campo]
            if self.instance is not None:
                return getattr(self.instance, campo)
            return default

        periodicidad = valor('periodicidad', 'unico')
        numero_cuotas = valor('numero_cuotas', 1)
        fecha_primera_cuota = valor('fecha_primera_cuota')

        if periodicidad == 'unico' and numero_cuotas != 1:
            raise serializers.ValidationError({
                'numero_cuotas': "Un cargo de periodicidad 'único' debe tener numero_cuotas=1."
            })
        if periodicidad != 'unico' and not fecha_primera_cuota:
            raise serializers.ValidationError({
                'fecha_primera_cuota': "Obligatorio cuando la periodicidad no es 'único'."
            })
        return attrs


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
    cedula_escolar = serializers.ReadOnlyField(source='alumno.cedula_escolar')
    representante_id = serializers.ReadOnlyField(source='alumno.representante_id')
    cajero = serializers.ReadOnlyField(source='usuario_receptor.username')
    banco_nombre = serializers.ReadOnlyField(source='banco_receptor.nombre', allow_null=True)
    metodo_pago_display = serializers.CharField(source='get_metodo_pago_display', read_only=True)
    concepto_display = serializers.CharField(source='get_concepto_display', read_only=True)
    revisado = serializers.SerializerMethodField()

    class Meta:
        model = Pago
        fields = [
            'id', 'factura_id', 'alumno', 'nombre_alumno', 'apellido_alumno', 'cedula_escolar',
            'representante_id', 'usuario_receptor', 'cajero', 'operacion_uuid', 'banco_receptor', 'banco_nombre',
            'metodo_pago', 'metodo_pago_display', 'concepto', 'concepto_display', 'monto_usd',
            'tasa_aplicada', 'monto_ves', 'fecha_pago', 'revisado',
            'referencia', 'numero_lote', 'estatus', 'observaciones', 'representante_documento', 'representante_nombre'
        ]
        read_only_fields = ['factura_id', 'monto_ves', 'fecha_pago', 'tasa_aplicada']

    def get_revisado(self, obj):
        pk_set = self.context.get('revisado_pago_ids')
        if pk_set is not None:
            return obj.pk in pk_set
        return obj.lotes_revision.exists()


class ClasificacionPagoManualSerializer(serializers.ModelSerializer):
    tipo_display = serializers.CharField(source='get_tipo_display', read_only=True)
    mes_display = serializers.SerializerMethodField()
    creado_por = serializers.ReadOnlyField(source='creado_por.username')

    class Meta:
        model = ClasificacionPagoManual
        fields = [
            'id', 'tipo', 'tipo_display', 'mes', 'mes_display', 'anio',
            'monto_usd', 'nota', 'creado_por', 'creado_en',
        ]
        read_only_fields = ['id', 'creado_por', 'creado_en']

    def get_mes_display(self, obj):
        return MESES_ES[obj.mes - 1] if obj.mes else None


class LoteRevisionCajaSerializer(serializers.ModelSerializer):
    usuario_nombre = serializers.ReadOnlyField(source='usuario.username')
    total_transacciones = serializers.SerializerMethodField()
    total_usd = serializers.SerializerMethodField()

    class Meta:
        model = LoteRevisionCaja
        fields = [
            'id', 'fecha_inicio', 'fecha_fin', 'usuario', 'usuario_nombre',
            'fecha_creacion', 'observaciones', 'total_transacciones', 'total_usd',
        ]
        read_only_fields = ['usuario', 'fecha_creacion']

    def get_total_transacciones(self, obj):
        return obj.pagos.count()

    def get_total_usd(self, obj):
        return obj.pagos.aggregate(s=Sum('monto_usd'))['s'] or 0


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
    desglose_conceptos = serializers.SerializerMethodField()
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

    def _get_principal_con_conceptos(self, obj):
        """El primer pago de la operación, con las relaciones M2M de
        conceptos (mensualidades/cuotas cubiertas) prefetched. Se cachea por
        separado de `_get_hermanos` para no penalizar a
        get_desglose_pagos/get_total_ves/get_total_usd (que no las usan) con
        prefetches que no necesitan."""
        cache = self.context.setdefault('_principal_conceptos_cache', {})
        key = obj.operacion_uuid
        if key not in cache:
            cache[key] = (
                Pago.objects.filter(operacion_uuid=key)
                .prefetch_related(
                    'mensualidades_pagadas__alumno',
                    'cuotas_inscripcion_pagadas__alumno',
                    'cuotas_solvencia_pagadas__alumno',
                    'proyectos_inversion_pagados__representante',
                    'lineas_recargo',
                )
                .order_by('id')
                .first()
            )
        return cache[key]

    def get_desglose_pagos(self, obj):
        hermanos = self._get_hermanos(obj)
        return DesglosePagoSerializer(hermanos, many=True).data

    def get_desglose_conceptos(self, obj):
        """Desglosa la operación línea por línea (una por mensualidad/cuota
        realmente cubierta), en vez del texto crudo 'Pago Mixto'.

        RegistrarPagoView enlaza el M2M de cada cuota/mensualidad a TODOS los
        pagos de la operación (ver views.py), así que cualquier hermano expone
        el conjunto completo sin duplicados — no hace falta sumar entre
        hermanos. El monto de cada línea sale del propio ítem (monto_usd de
        la mensualidad/cuota), no de Pago.monto_usd: cuando el pago es mixto,
        Pago.monto_usd es el total transferido por un método y no indica
        cuánto de eso correspondía a cada concepto.
        """
        principal = self._get_principal_con_conceptos(obj)
        if not principal:
            return []

        lineas = calcular_desglose_automatico(principal)

        if not lineas:
            tasa = principal.tasa_aplicada or Decimal('0')
            monto_usd = obj.monto_usd or Decimal('0')
            lineas.append({
                'concepto': obj.concepto,
                'concepto_display': obj.get_concepto_display(),
                'descripcion': '',
                'alumno': None,
                'monto_usd': str(monto_usd.quantize(Decimal('0.01'))),
                'monto_ves': str((monto_usd * tasa).quantize(Decimal('0.01'))),
            })

        return lineas

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
            'desglose_pagos', 'desglose_conceptos', 'total_ves', 'total_usd', 'numero_solvencia',
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


class ReglaRecargoPagoSerializer(serializers.ModelSerializer):
    """
    CRUD de la configuración de recargo por pago tardío. La lógica de
    cálculo/aplicación vive en cobranza/recargos.py::resolver_recargo — este
    serializer solo valida y persiste la configuración.
    """
    class Meta:
        model = ReglaRecargoPago
        fields = [
            'id', 'nombre', 'descripcion', 'tipo', 'modo_calculo', 'valor',
            'dia_aplicacion', 'activa', 'creada_por', 'creada_en',
            'modificada_en',
        ]
        read_only_fields = ['creada_por', 'creada_en', 'modificada_en']

    def validate_nombre(self, value):
        if not value.strip():
            raise serializers.ValidationError("El nombre no puede estar vacío.")
        return value

    def validate_dia_aplicacion(self, value):
        if not (1 <= value <= 31):
            raise serializers.ValidationError("Debe estar entre 1 y 31.")
        return value

    def validate_valor(self, value):
        if value <= 0:
            raise serializers.ValidationError("Debe ser mayor a 0.")
        return value

    def validate(self, data):
        # Reutiliza la validación de unicidad activa por tipo del modelo
        # (ReglaRecargoPago.clean()) para no duplicar la regla acá.
        instancia = ReglaRecargoPago(
            id=self.instance.id if self.instance else None,
            nombre=data.get('nombre', getattr(self.instance, 'nombre', '')),
            tipo=data.get('tipo', getattr(self.instance, 'tipo', 'recargo')),
            modo_calculo=data.get('modo_calculo', getattr(self.instance, 'modo_calculo', 'monto_fijo_usd')),
            valor=data.get('valor', getattr(self.instance, 'valor', None)),
            dia_aplicacion=data.get('dia_aplicacion', getattr(self.instance, 'dia_aplicacion', None)),
            activa=data.get('activa', getattr(self.instance, 'activa', True)),
        )
        try:
            instancia.clean()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict if hasattr(exc, 'message_dict') else exc.messages)
        return data


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
    # --- Carga retroactiva desde Cobranza (multi-alumno/multi-línea) ---
    # Si `fecha_pago` se omite, el comportamiento es exactamente el actual
    # (tasa de hoy, sin exigir motivo). Si viene, exige tasa_aplicada y
    # motivo explícitos: no se adivina una tasa histórica.
    fecha_pago = serializers.DateTimeField(required=False)
    tasa_aplicada = serializers.DecimalField(
        max_digits=12, decimal_places=4, min_value=Decimal('0.0001'), required=False
    )
    motivo = serializers.CharField(min_length=10, required=False, allow_blank=False)

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

        # --- Guarda contra doble cobro: rechaza cuotas ya saldadas ---
        # Sin esto, dos envíos del mismo formulario (doble clic, o reintentar
        # "el pago que falta" sobre una selección de UI que no se refrescó)
        # generan dos operaciones (`operacion_uuid`) distintas que enlazan la
        # MISMA cuota por M2M a ambas — calcular_desglose_automatico() reporta
        # el monto_usd completo de la cuota por cada operación enlazada, así
        # que el desglose contable termina contando el mismo cargo dos veces
        # aunque el dinero solo se cobró una vez.
        todos_mensualidad_ids = set()
        todos_cuota_inscripcion_ids = set()
        todos_cuota_solvencia_ids = set()
        for a in alumnos_resueltos:
            todos_mensualidad_ids |= set(a['mensualidad_ids']) | set(a['mensualidad_adelanto_ids'])
            todos_cuota_inscripcion_ids |= set(a['cuota_inscripcion_ids'])
            todos_cuota_solvencia_ids |= set(a['cuota_solvencia_ids'])

        # select_for_update() bloquea estas filas hasta que termine la
        # transacción atómica de la vista (ver RegistrarPagoView.post) — así,
        # si dos envíos llegan casi al mismo tiempo (doble clic), el segundo
        # espera a que el primero confirme y entonces sí ve `pagado=True` y
        # es rechazado, en vez de una condición de carrera donde ambos leen
        # `pagado=False` y ambos terminan cobrando la misma cuota.
        if todos_mensualidad_ids:
            ya_pagada = Mensualidad.objects.select_related('alumno').select_for_update().filter(
                id__in=todos_mensualidad_ids, pagado=True
            ).first()
            if ya_pagada:
                raise serializers.ValidationError(
                    f"La mensualidad de {ya_pagada.get_mes_display()} {ya_pagada.anio} de "
                    f"{ya_pagada.alumno.nombre} {ya_pagada.alumno.apellido} ya está pagada. "
                    "Actualice la página antes de continuar (posible doble envío)."
                )

        if todos_cuota_inscripcion_ids:
            ya_pagada = CuotaInscripcion.objects.select_related('alumno').select_for_update().filter(
                id__in=todos_cuota_inscripcion_ids, pagado=True
            ).first()
            if ya_pagada:
                raise serializers.ValidationError(
                    f"La cuota de inscripción de {ya_pagada.alumno.nombre} {ya_pagada.alumno.apellido} "
                    "ya está pagada. Actualice la página antes de continuar (posible doble envío)."
                )

        if todos_cuota_solvencia_ids:
            ya_pagada = CuotaSolvencia.objects.select_related('alumno').select_for_update().filter(
                id__in=todos_cuota_solvencia_ids, pagado=True
            ).first()
            if ya_pagada:
                raise serializers.ValidationError(
                    f"La cuota de solvencia de {ya_pagada.alumno.nombre} {ya_pagada.alumno.apellido} "
                    "ya está pagada. Actualice la página antes de continuar (posible doble envío)."
                )

        proyecto_inversion_ids = data.get('proyecto_inversion_ids') or []
        if proyecto_inversion_ids:
            ya_saldado = CuotaProyectoInversion.objects.select_related('representante').select_for_update().filter(
                id__in=proyecto_inversion_ids, monto_pagado__gte=F('monto_usd')
            ).first()
            if ya_saldado:
                raise serializers.ValidationError(
                    f"La cuota de Proyecto de Inversión de {ya_saldado.representante.nombre} "
                    f"{ya_saldado.representante.apellido} ya está saldada por completo. "
                    "Actualice la página antes de continuar (posible doble envío)."
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
            elif pago_item['metodo_pago'] not in ('efectivo', 'efectivo_ves'):
                raise serializers.ValidationError(
                    f"Pago {i}: Este método de pago requiere indicar el banco receptor."
                )

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
            # Delegada a pagos_comunes.buscar_referencia_duplicada (§5.9 de
            # cantina.md) para que una referencia ya usada en `cantina`
            # (recarga de tarjeta prepago) también quede detectada acá, y
            # viceversa — antes cada módulo solo miraba su propia tabla.
            ref_raw = pago_item.get('referencia', '').strip()
            if not ref_raw:
                continue

            ref_normalizada = normalizar_referencia(ref_raw)
            metodo_item = pago_item['metodo_pago']
            banco_item_id = pago_item.get('banco_receptor_id')
            clave_item = (ref_normalizada, metodo_item, banco_item_id)

            # 1. Duplicate dentro de la misma solicitud (misma referencia + método + banco)
            if clave_item in referencias_en_esta_solicitud:
                raise serializers.ValidationError(
                    f"Pago {i}: La referencia '{ref_normalizada}' aparece más de una vez "
                    "en esta transacción. Cada línea de pago debe tener una referencia única."
                )
            referencias_en_esta_solicitud.append(clave_item)

            # 2. Duplicate contra cobranza.Pago, portal.ComprobantePago o cantina.RecargaTarjeta
            duplicado = buscar_referencia_duplicada(
                ref_normalizada, metodo_pago=metodo_item, banco_receptor_id=banco_item_id,
            )
            if duplicado:
                raise serializers.ValidationError(
                    f"Pago {i}: La referencia '{ref_normalizada}' ya está en uso en "
                    f"{duplicado['origen']} (#{duplicado['id']}, {duplicado['detalle']}). "
                    "Si cree que es un error, contacte al administrador."
                )

        # Adelantos de mensualidades futuras: solo se aceptan en Zelle o
        # Efectivo Divisas (USD), para evitar descuadres de tasa/cambio entre
        # el momento del adelanto y el mes en que realmente se factura.
        # Restricción activable/desactivable desde Configuraciones.
        config = ConfiguracionSistema.objects.first()
        restriccion_usd_activa = not config or config.adelantos_requieren_usd
        if restriccion_usd_activa and any(a['mensualidad_adelanto_ids'] for a in alumnos_resueltos):
            metodos_no_permitidos = {
                p['metodo_pago'] for p in data['pagos']
                if p['metodo_pago'] not in ('zelle', 'efectivo')
            }
            if metodos_no_permitidos:
                raise serializers.ValidationError(
                    "Los adelantos de mensualidades solo se pueden pagar con Zelle o "
                    "Efectivo Divisas (USD)."
                )

        # --- Carga retroactiva (fecha_pago explícita) ---
        # Reutiliza los mismos guardas que cargar_pago_retroactivo()
        # (cobranza/correcciones.py) para que ambos caminos de carga
        # retroactiva se comporten igual frente a períodos cerrados/inactivos.
        fecha_pago = data.get('fecha_pago')
        tasa_aplicada = data.get('tasa_aplicada')
        motivo = data.get('motivo')

        if fecha_pago:
            if not motivo:
                raise serializers.ValidationError(
                    {'motivo': "El motivo es obligatorio (mínimo 10 caracteres) al registrar "
                               "un pago con fecha retroactiva."}
                )
            if tasa_aplicada is None:
                raise serializers.ValidationError(
                    {'tasa_aplicada': "Debe indicar la tasa de cambio aplicada para un pago con "
                                      "fecha retroactiva; no se adivina una tasa histórica."}
                )

            dentro_periodo, error_periodo = fecha_dentro_periodo_activo(fecha_pago)
            if not dentro_periodo:
                raise serializers.ValidationError({'fecha_pago': error_periodo})

            request = self.context.get('request')
            usuario = getattr(request, 'user', None)
            if usuario is not None and fecha_en_cierre_validado(usuario, fecha_pago):
                raise serializers.ValidationError({
                    'fecha_pago': (
                        "No se puede cargar este pago: la fecha cae dentro de un cierre "
                        "de caja ya validado por el director."
                    )
                })

        # Valor de tasa EFECTIVO de la operación, resuelto en un solo lugar:
        # la tasa manual (si vino) siempre gana sobre el fallback de hoy.
        data['tasa_valor'] = tasa_aplicada if tasa_aplicada is not None else data['tasa'].valor_bs

        return data


class CorreccionPagoSerializer(serializers.Serializer):
    """
    Función A del módulo de Corrección de Pagos: campos que se pueden
    corregir in-place sobre un Pago ya existente. Todos opcionales salvo
    `motivo` — el caller (CorregirPagoView) solo aplica los que vengan
    presentes en el payload.
    """
    METODOS = [m[0] for m in Pago.METODOS]
    metodo_pago = serializers.ChoiceField(choices=METODOS, required=False)
    referencia = serializers.CharField(max_length=100, required=False, allow_blank=True, allow_null=True)
    numero_lote = serializers.CharField(max_length=10, required=False, allow_blank=True, allow_null=True)
    banco_receptor = serializers.PrimaryKeyRelatedField(
        queryset=BancoInstitucional.objects.all(), required=False, allow_null=True
    )
    observaciones = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    motivo = serializers.CharField(min_length=10, required=True)


class AnularPagoSerializer(serializers.Serializer):
    """Función C del módulo de Corrección de Pagos: anular un pago existente."""
    motivo = serializers.CharField(min_length=10, required=True)


class PagoRetroactivoSerializer(serializers.Serializer):
    """
    Función B del módulo de Corrección de Pagos: registra un pago simple
    (un alumno, un concepto) cuyo dinero se recibió en una fecha pasada.
    No soporta pagos mixtos/multi-alumno — para eso sigue existiendo
    RegistrarPagoView.

    Tasa histórica: para métodos en divisas (zelle, efectivo) basta con
    `monto_usd`; `tasa_aplicada` es opcional y, si se envía, reemplaza el
    fallback de TasaCambio.objects.latest('fecha') al calcular el
    equivalente en bolívares. Para métodos en bolívares (transferencia,
    pago_movil, punto_de_venta, efectivo_ves) se exige `monto_ves` +
    `tasa_aplicada` explícitos: no se adivina una tasa histórica para
    convertir a USD.
    """
    METODOS = [m[0] for m in Pago.METODOS]
    CONCEPTOS = [c[0] for c in Pago.CONCEPTOS]
    METODOS_DIVISA = ('zelle', 'efectivo')
    METODOS_BOLIVARES = ('transferencia', 'pago_movil', 'punto_de_venta', 'efectivo_ves')

    alumno = serializers.PrimaryKeyRelatedField(queryset=Alumno.objects.all())
    concepto = serializers.ChoiceField(choices=CONCEPTOS, default='mensualidad', required=False)
    metodo_pago = serializers.ChoiceField(choices=METODOS)
    monto_usd = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('0.01'), required=False)
    monto_ves = serializers.DecimalField(max_digits=20, decimal_places=2, min_value=Decimal('0.01'), required=False)
    tasa_aplicada = serializers.DecimalField(
        max_digits=12, decimal_places=4, min_value=Decimal('0.0001'), required=False
    )
    banco_receptor = serializers.PrimaryKeyRelatedField(
        queryset=BancoInstitucional.objects.all(), required=False, allow_null=True
    )
    referencia = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    numero_lote = serializers.CharField(max_length=10, required=False, allow_blank=True, default='')
    observaciones = serializers.CharField(required=False, allow_blank=True, default='')
    representante_documento = serializers.CharField(max_length=30, required=False, allow_blank=True, default='')
    representante_nombre = serializers.CharField(max_length=150, required=False, allow_blank=True, default='')
    fecha_pago = serializers.DateTimeField(required=True)
    motivo = serializers.CharField(min_length=10, required=True)

    def validate(self, data):
        # Punto de Venta exige referencia/lote de 4 dígitos — igual que en
        # Pago.clean(), se valida aquí también para dar un mensaje temprano
        # y consistente con el resto del formulario (el modelo lo revalida
        # de todas formas en full_clean()).
        if data['metodo_pago'] == 'punto_de_venta':
            ref_pos = (data.get('referencia') or '').strip()
            lote_pos = (data.get('numero_lote') or '').strip()
            if not ref_pos.isdigit() or len(ref_pos) != 4:
                raise serializers.ValidationError(
                    {'referencia': "Punto de Venta requiere un número de referencia de 4 dígitos."}
                )
            if not lote_pos.isdigit() or len(lote_pos) != 4:
                raise serializers.ValidationError(
                    {'numero_lote': "Punto de Venta requiere un número de lote de 4 dígitos."}
                )

        # --- Tasa histórica: monto según si el método es divisa o bolívares ---
        metodo = data['metodo_pago']
        monto_usd = data.get('monto_usd')
        monto_ves = data.get('monto_ves')
        tasa_aplicada = data.get('tasa_aplicada')

        if metodo in self.METODOS_DIVISA:
            if not monto_usd:
                raise serializers.ValidationError(
                    {'monto_usd': "monto_usd es obligatorio para métodos en divisas (zelle, efectivo)."}
                )
            if monto_ves is not None:
                raise serializers.ValidationError(
                    {'monto_ves': "monto_ves no aplica para métodos en divisas (zelle, efectivo)."}
                )
        elif metodo in self.METODOS_BOLIVARES:
            if monto_ves is None:
                raise serializers.ValidationError(
                    {'monto_ves': "monto_ves es obligatorio para métodos en bolívares."}
                )
            if tasa_aplicada is None:
                raise serializers.ValidationError(
                    {'tasa_aplicada': "tasa_aplicada es obligatoria para métodos en bolívares "
                                      "(no se adivina una tasa histórica)."}
                )
            if monto_usd is not None:
                raise serializers.ValidationError(
                    {'monto_usd': "monto_usd no aplica para métodos en bolívares; use monto_ves."}
                )

        return data


        