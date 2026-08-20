from decimal import Decimal

from rest_framework import serializers

from cobranza.models import Pago
from pagos_comunes.referencias import buscar_referencia_duplicada, normalizar_referencia

from .models import (
    CategoriaProducto,
    CierreCajaCantina,
    DetalleVentaCantina,
    LoteTarjetas,
    MovimientoInventario,
    ParametroCantina,
    ProductoCantina,
    RecargaTarjeta,
    TarjetaPrepago,
    VentaCantina,
)

# Mismos métodos que cobranza.Pago.METODOS, MENOS 'stripe' (§5.2/§5.9 de
# cantina.md) — no se define una lista propia a mano para no tener que
# mantener dos catálogos sincronizados.
METODOS_RECARGA = tuple(m for m in Pago.METODOS if m[0] != 'stripe')

# Métodos que requieren número de referencia obligatorio (mismo criterio
# que portal._METODOS_CON_REFERENCIA_OBLIGATORIA).
_METODOS_CON_REFERENCIA_OBLIGATORIA = {'transferencia', 'pago_movil', 'punto_de_venta', 'zelle'}

# Regla NUEVA, propia de cantina (§5.9 punto 3 de cantina.md): Pago Móvil y
# Transferencia exigen referencia numérica de 6 dígitos. Cobranza hoy NO
# exige esto para esos métodos — no se toca su validación existente.
_METODOS_REFERENCIA_6_DIGITOS = {'pago_movil', 'transferencia'}


class CategoriaProductoSerializer(serializers.ModelSerializer):
    class Meta:
        model = CategoriaProducto
        fields = ('id', 'nombre', 'orden')


class ProductoCantinaSerializer(serializers.ModelSerializer):
    stock_bajo = serializers.BooleanField(read_only=True)
    categoria_nombre = serializers.CharField(source='categoria.nombre', read_only=True)

    class Meta:
        model = ProductoCantina
        fields = (
            'id', 'nombre', 'categoria', 'categoria_nombre', 'codigo_barras',
            'precio', 'stock_actual', 'stock_minimo', 'imagen', 'activo',
            'creado_en', 'stock_bajo',
        )

    def validate_precio(self, value):
        if value < 0:
            raise serializers.ValidationError('El precio no puede ser negativo.')
        return value

    def validate_stock_minimo(self, value):
        if value < 0:
            raise serializers.ValidationError('El stock mínimo no puede ser negativo.')
        return value


class MovimientoInventarioSerializer(serializers.ModelSerializer):
    """
    Serializer de solo-lectura para exponer el historial de movimientos.

    `stock_antes`/`stock_despues` los calcula siempre `aplicar_movimiento_inventario`
    (servicio) — nunca se aceptan desde el cliente, ver checklist §10 de cantina.md.
    La creación real de un movimiento NO pasa por `.save()` de este serializer,
    sino por `MovimientoInventarioCreateView` llamando al servicio directamente;
    este serializer se usa solo para serializar la respuesta/listado.
    """
    producto_nombre = serializers.CharField(source='producto.nombre', read_only=True)

    class Meta:
        model = MovimientoInventario
        fields = (
            'id', 'producto', 'producto_nombre', 'tipo', 'cantidad',
            'stock_antes', 'stock_despues', 'motivo', 'venta', 'usuario',
            'creado_en',
        )
        read_only_fields = ('stock_antes', 'stock_despues', 'usuario', 'creado_en')


class LoteTarjetasSerializer(serializers.ModelSerializer):
    """
    Solo-lectura: un `LoteTarjetas` se crea siempre desde
    `GenerarLoteTarjetasView` (que también genera el .zip), nunca a través
    de este serializer con `.save()`.
    """
    generado_por_username = serializers.CharField(source='generado_por.username', read_only=True)

    class Meta:
        model = LoteTarjetas
        fields = ('id', 'cantidad', 'generado_por', 'generado_por_username', 'creado_en')
        read_only_fields = fields


class TarjetaPrepagoSerializer(serializers.ModelSerializer):
    """
    Serializer de lectura para `TarjetaPrepago` (listados, resultado de
    búsqueda). `codigo` y `saldo` son de solo lectura: nunca se aceptan
    desde el cliente — se generan/actualizan exclusivamente vía los
    servicios de `services_tarjeta.py` (§10 checklist de cantina.md).
    """
    alumno_nombre = serializers.SerializerMethodField()
    alumno_foto = serializers.SerializerMethodField()
    alumno_grado_seccion = serializers.SerializerMethodField()

    class Meta:
        model = TarjetaPrepago
        fields = (
            'id', 'alumno', 'alumno_nombre', 'alumno_foto', 'alumno_grado_seccion',
            'lote', 'serial', 'codigo',
            'saldo', 'estado', 'limite_credito', 'saldo_negativo_desde',
            'asignada_en', 'creado_en', 'actualizado_en',
        )
        read_only_fields = (
            'codigo', 'saldo', 'saldo_negativo_desde', 'asignada_en',
            'creado_en', 'actualizado_en',
        )

    def get_alumno_nombre(self, obj):
        if not obj.alumno_id:
            return None
        return f'{obj.alumno.nombre} {obj.alumno.apellido}'

    def get_alumno_foto(self, obj):
        # §7.2 cantina.md — verificación visual obligatoria antes de cobrar
        # con tarjeta prepago: el POS debe mostrar la foto del alumno o un
        # placeholder visible si no existe (nunca ocultarlo en silencio).
        if not obj.alumno_id or not obj.alumno.foto:
            return None
        request = self.context.get('request')
        url = obj.alumno.foto.url
        return request.build_absolute_uri(url) if request else url

    def get_alumno_grado_seccion(self, obj):
        if not obj.alumno_id:
            return None
        return obj.alumno.grado_seccion


class RecargaTarjetaSerializer(serializers.ModelSerializer):
    """
    Serializer de `RecargaTarjeta` (§5.2/§5.9/§8 FASE 3 de cantina.md).

    `monto_ves` es `editable=False` en el modelo — SIEMPRE se calcula acá
    (en `create()`) a partir de `monto_usd * tasa_aplicada`, nunca se
    recibe del cliente ni se recalcula al leer un registro ya guardado
    (§10 checklist). `tasa_aplicada` tampoco se acepta del cliente: quien
    llama a `.save()` (la vista) debe pasarla como kwarg (snapshot de
    `cobranza.TasaCambio.objects.latest('fecha')`).

    Validación de referencia (§5.9 punto 3): Punto de Venta exige
    referencia y lote de 4 dígitos (mismo criterio que cobranza). Pago
    Móvil/Transferencia exigen referencia de 6 dígitos — regla NUEVA,
    exclusiva de cantina. Toda referencia no vacía se normaliza y se
    valida contra `buscar_referencia_duplicada` (duplicidad CRUZADA con
    cobranza.Pago/portal.ComprobantePago) antes de aceptar el registro.
    """
    metodo_pago = serializers.ChoiceField(choices=METODOS_RECARGA)
    tarjeta_serial = serializers.CharField(source='tarjeta.serial', read_only=True)
    alumno_nombre = serializers.SerializerMethodField()
    cajero_username = serializers.CharField(source='cajero.username', read_only=True, default=None)
    revisado_por_username = serializers.CharField(source='revisado_por.username', read_only=True, default=None)

    class Meta:
        model = RecargaTarjeta
        fields = (
            'id', 'tarjeta', 'tarjeta_serial', 'alumno_nombre', 'metodo_pago',
            'monto_usd', 'tasa_aplicada', 'monto_ves', 'banco_receptor',
            'banco_procedencia', 'referencia', 'numero_lote', 'estatus',
            'comprobante', 'registrado_por_portal', 'cajero', 'cajero_username',
            'revisado_por', 'revisado_por_username', 'creado_en', 'revisado_en',
        )
        # monto_usd/monto_ves/saldo derivados nunca se aceptan del cliente si
        # son calculados por el backend — ver §10 checklist de cantina.md.
        read_only_fields = (
            'tasa_aplicada', 'monto_ves', 'estatus', 'registrado_por_portal',
            'cajero', 'revisado_por', 'creado_en', 'revisado_en',
        )

    def get_alumno_nombre(self, obj):
        alumno = getattr(obj.tarjeta, 'alumno', None)
        if not alumno:
            return None
        return f'{alumno.nombre} {alumno.apellido}'

    def validate_monto_usd(self, value):
        if value <= 0:
            raise serializers.ValidationError('El monto debe ser mayor a cero.')
        return value

    def validate(self, data):
        metodo = data.get('metodo_pago', getattr(self.instance, 'metodo_pago', None))
        referencia_raw = (data.get('referencia') or '').strip()
        numero_lote_raw = (data.get('numero_lote') or '').strip()

        if metodo == 'punto_de_venta':
            if not referencia_raw.isdigit() or len(referencia_raw) != 4:
                raise serializers.ValidationError(
                    {'referencia': 'Punto de Venta requiere un número de referencia de 4 dígitos.'}
                )
            if not numero_lote_raw.isdigit() or len(numero_lote_raw) != 4:
                raise serializers.ValidationError(
                    {'numero_lote': 'Punto de Venta requiere un número de lote de 4 dígitos.'}
                )
        elif metodo in _METODOS_REFERENCIA_6_DIGITOS:
            if not referencia_raw.isdigit() or len(referencia_raw) != 6:
                raise serializers.ValidationError(
                    {'referencia': 'Este método requiere un número de referencia de 6 dígitos.'}
                )
        elif metodo in _METODOS_CON_REFERENCIA_OBLIGATORIA and not referencia_raw:
            raise serializers.ValidationError(
                {'referencia': 'Este método de pago requiere número de referencia.'}
            )

        if referencia_raw:
            ref_normalizada = normalizar_referencia(referencia_raw)
            excluir_recarga_id = self.instance.pk if self.instance else None
            duplicado = buscar_referencia_duplicada(ref_normalizada, excluir_recarga_id=excluir_recarga_id)
            if duplicado:
                raise serializers.ValidationError({
                    'referencia': (
                        f"La referencia '{ref_normalizada}' ya está en uso en "
                        f"{duplicado['origen']} (#{duplicado['id']}, {duplicado['detalle']}). "
                        "Si cree que es un error, contacte al administrador."
                    )
                })
            data['referencia'] = ref_normalizada

        return data

    def create(self, validated_data):
        # tasa_aplicada llega como kwarg de .save(tasa_aplicada=...) desde la
        # vista (snapshot de TasaCambio vigente) — nunca del cliente. monto_ves
        # se calcula SIEMPRE acá, al crear, nunca se recalcula después.
        tasa = validated_data.get('tasa_aplicada')
        if tasa is None:
            raise serializers.ValidationError('No se pudo determinar la tasa de cambio aplicada.')
        monto_usd = validated_data['monto_usd']
        validated_data['monto_ves'] = (Decimal(monto_usd) * Decimal(tasa)).quantize(Decimal('0.01'))
        return super().create(validated_data)


# ─────────────────────────────────────────────
# FASE 4 — Ventas (§5.6/§5.9/§8 FASE 4 de cantina.md)
# ─────────────────────────────────────────────

class ProductoVentaMiniSerializer(serializers.ModelSerializer):
    """Representación mínima del producto dentro de un detalle de venta —
    el contrato de API acordado con el frontend del POS solo necesita
    `id`/`nombre`, no el producto completo (precio actual, stock, etc.)."""

    class Meta:
        model = ProductoCantina
        fields = ('id', 'nombre')
        read_only_fields = fields


class DetalleVentaCantinaSerializer(serializers.ModelSerializer):
    """
    Solo-lectura: un `DetalleVentaCantina` se crea siempre desde
    `RegistrarVentaView` (dentro de la misma transacción que descuenta
    stock), nunca a través de `.save()` de este serializer — igual que
    `MovimientoInventarioSerializer`/`LoteTarjetasSerializer`.
    """
    producto = ProductoVentaMiniSerializer(read_only=True)

    class Meta:
        model = DetalleVentaCantina
        fields = ('id', 'producto', 'cantidad', 'precio_unitario', 'subtotal')
        read_only_fields = fields


class VentaCantinaSerializer(serializers.ModelSerializer):
    """
    Serializer de lectura de `VentaCantina` (§5.2/§5.9/§8 FASE 4 de
    cantina.md). `RegistrarVentaView`/`AnularVentaView` construyen la venta
    a mano dentro de `transaction.atomic()` (no vía `.save()` de este
    serializer) porque la creación involucra descontar stock/saldo con los
    servicios dedicados — este serializer solo se usa para serializar la
    respuesta. Por eso TODOS los campos son de solo lectura, incluidos los
    calculados por el backend (`total_ves`, `tasa_aplicada`,
    `saldo_tarjeta_despues`, `cajero`) como pide el checklist §10.
    """
    alumno_nombre = serializers.SerializerMethodField()
    tarjeta_serial = serializers.CharField(source='tarjeta.serial', read_only=True, default=None)
    cajero_username = serializers.CharField(source='cajero.username', read_only=True, default=None)
    anulada_por_username = serializers.CharField(source='anulada_por.username', read_only=True, default=None)
    detalles = DetalleVentaCantinaSerializer(many=True, read_only=True)

    class Meta:
        model = VentaCantina
        fields = (
            'id', 'alumno', 'alumno_nombre', 'tarjeta', 'tarjeta_serial',
            'cajero', 'cajero_username', 'metodo_pago', 'total_usd',
            'tasa_aplicada', 'total_ves', 'estado', 'saldo_tarjeta_despues',
            'detalles', 'creado_en', 'anulada_en', 'anulada_por', 'anulada_por_username',
        )
        read_only_fields = fields

    def get_alumno_nombre(self, obj):
        if not obj.alumno_id:
            return None
        return f'{obj.alumno.nombre} {obj.alumno.apellido}'


# ─────────────────────────────────────────────
# FASE 5 — Cierre de caja (§5.7/§8 FASE 5 de cantina.md)
# ─────────────────────────────────────────────

class CierreCajaCantinaSerializer(serializers.ModelSerializer):
    """
    Solo-lectura: un `CierreCajaCantina` se crea siempre desde
    `CierreCajaCantinaView.post` (que recalcula los 4 totales server-side
    dentro de `transaction.atomic()`), nunca a través de `.save()` de este
    serializer — mismo criterio que `VentaCantinaSerializer`/
    `MovimientoInventarioSerializer`. `cajero_username` sigue la misma
    convención que `RecargaTarjetaSerializer`/`VentaCantinaSerializer`
    (mostrar `username`, no `get_full_name()`).
    """
    cajero_username = serializers.CharField(source='cajero.username', read_only=True, default=None)

    class Meta:
        model = CierreCajaCantina
        fields = (
            'id', 'cajero', 'cajero_username', 'fecha', 'total_ventas',
            'total_tarjeta', 'total_efectivo', 'total_recargas_efectivo',
            'conteo_fisico', 'diferencia', 'observaciones', 'cerrado_en',
        )
        read_only_fields = fields


# ─────────────────────────────────────────────
# Parámetros, ajuste de crédito y reporte de morosidad
# (agregado tras Fase 5 — ver views.ParametroCantinaView/AjustarCreditoTarjetaView/
# ReporteMorosidadView)
# ─────────────────────────────────────────────

class ParametroCantinaSerializer(serializers.ModelSerializer):
    """
    Serializer del singleton `ParametroCantina`. `dias_alerta_saldo_negativo`
    se valida y normaliza acá: debe ser una lista de enteros positivos
    separados por coma (ej. '1,3,7'); se recompone el string ya limpio para
    que quede guardado sin espacios ni tokens vacíos, sin importar cómo
    llegó desde el cliente (ej. '1, 3,7 ' -> '1,3,7').
    """

    class Meta:
        model = ParametroCantina
        fields = ('id', 'limite_credito_default', 'dias_alerta_saldo_negativo')
        read_only_fields = ('id',)

    def validate_limite_credito_default(self, value):
        if value < 0:
            raise serializers.ValidationError('El límite de crédito por defecto no puede ser negativo.')
        return value

    def validate_dias_alerta_saldo_negativo(self, value):
        tokens = [token.strip() for token in (value or '').split(',')]
        tokens = [token for token in tokens if token]
        if not tokens:
            raise serializers.ValidationError(
                "Debe indicar al menos un día de alerta (ej. '1,3,7')."
            )

        dias = []
        for token in tokens:
            if not token.isdigit() or int(token) <= 0:
                raise serializers.ValidationError(
                    f"'{token}' no es un número entero positivo válido. "
                    "Use días separados por coma sin espacios, ej. '1,3,7'."
                )
            dias.append(int(token))

        return ','.join(str(dia) for dia in dias)


class AjustarCreditoSerializer(serializers.Serializer):
    """Serializer chico solo para validar el body de `AjustarCreditoTarjetaView`."""
    limite_credito = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)


class TarjetaMorosaSerializer(serializers.Serializer):
    """
    Serializer de solo lectura (no `ModelSerializer`) para el reporte de
    morosidad de `ReporteMorosidadView`: combina campos de `TarjetaPrepago`,
    `Alumno` y `Representante`. `dias_en_negativo` llega ya calculado desde
    la vista (vía `mora_cantina.dias_en_negativo`), no se recalcula acá.
    """
    tarjeta_id = serializers.IntegerField()
    serial = serializers.CharField()
    codigo = serializers.CharField()
    alumno_id = serializers.IntegerField(allow_null=True)
    alumno_nombre = serializers.CharField(allow_null=True)
    grado_seccion = serializers.CharField(allow_null=True)
    representante_nombre = serializers.CharField(allow_null=True)
    representante_telefono = serializers.CharField(allow_null=True)
    representante_correo = serializers.CharField(allow_null=True)
    saldo = serializers.DecimalField(max_digits=10, decimal_places=2)
    limite_credito = serializers.DecimalField(max_digits=10, decimal_places=2)
    saldo_negativo_desde = serializers.DateField(allow_null=True)
    dias_en_negativo = serializers.IntegerField()
