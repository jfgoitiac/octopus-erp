"""
Serializers del panel y los cierres de la Auditoría de Cantina — carril B2.
Formas exactas de CONTRATO_AUDITORIA_CANTINA.md §0, §2, §3 y el evento de §5.

Incluye los helpers comunes de representación (`usuario_dict`, `turno_dict`,
`dinero`, `fecha_hora`) que el resto de vistas del módulo pueden reutilizar.
Todo es de solo lectura: las escrituras viven en las vistas, dentro de su
`transaction.atomic()` junto con `registrar_evento()`.
"""
from decimal import Decimal

from django.db.models import (
    DecimalField, Exists, ExpressionWrapper, F, OuterRef, Value,
)
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import serializers

from cantina.models import (
    AdjuntoRevision,
    CierreCajaCantina,
    EventoAuditoriaCantina,
    ReaperturaCajaCantina,
    RevisionCierre,
    VentaCantina,
)

CENTAVO = Decimal('0.01')
_DECIMAL = DecimalField(max_digits=12, decimal_places=2)
_CAMPO_FECHA_HORA = serializers.DateTimeField()

# Orden canónico de los estados de revisión (para `transiciones_permitidas`).
ORDEN_ESTADOS = [clave for clave, _ in RevisionCierre.ESTADOS]
ETIQUETAS_METODO = dict(VentaCantina.METODOS_PAGO)


# ─────────────────────────────────────────────
# Helpers de representación (§0)
# ─────────────────────────────────────────────
def dinero(valor):
    """Decimal → string con 2 decimales ("12.50"); None → None."""
    if valor is None:
        return None
    return str(Decimal(str(valor)).quantize(CENTAVO))


def fecha_hora(valor):
    """datetime → ISO 8601 en la zona local con offset; None → None."""
    if valor is None:
        return None
    return _CAMPO_FECHA_HORA.to_representation(valor)


def nombre_usuario(usuario):
    return usuario.get_full_name() or usuario.get_username()


def usuario_dict(usuario):
    """Usuario → {"id", "nombre"}; None → None."""
    if usuario is None:
        return None
    return {'id': usuario.id, 'nombre': nombre_usuario(usuario)}


def turno_dict(apertura, cierre=None):
    """
    Un turno es una `AperturaCajaCantina`. `fin` es el cierre de la apertura
    (o el `cerrado_en` del cierre si la apertura no lo tiene); null mientras
    la caja sigue abierta.
    """
    if apertura is None:
        return None
    inicio = apertura.fecha_hora_apertura
    fin = apertura.cerrada_en or (cierre.cerrado_en if cierre is not None else None)
    hora_fin = timezone.localtime(fin).strftime('%H:%M') if fin else 'en curso'
    return {
        'apertura_id': apertura.id,
        'etiqueta': f'Turno #{apertura.id} · {timezone.localtime(inicio).strftime("%H:%M")}–{hora_fin}',
        'inicio': fecha_hora(inicio),
        'fin': fecha_hora(fin),
    }


# ─────────────────────────────────────────────
# Querysets base
# ─────────────────────────────────────────────
def asegurar_revisiones():
    """
    Los cierres anteriores a la Fase 0 no tienen `RevisionCierre` (el signal
    solo la crea para cierres nuevos). Se crean en 'pendiente' al consultar,
    para que filtros y estados funcionen sobre todos los cierres. Es una
    consulta barata y casi siempre no inserta nada.
    """
    faltantes = list(
        CierreCajaCantina.objects.filter(revision__isnull=True).values_list('id', flat=True)
    )
    if faltantes:
        RevisionCierre.objects.bulk_create(
            [RevisionCierre(cierre_id=cierre_id) for cierre_id in faltantes],
            ignore_conflicts=True,
        )


def expresion_esperado_efectivo(prefijo=''):
    """
    Efectivo esperado en caja de un cierre, calculado en BD. Al cerrar se
    guarda `diferencia = conteo_fisico − esperado`, así que el esperado exacto
    (monto inicial + efectivo de ventas, recargas y abonos) es
    `conteo_fisico − diferencia`. Para cierres sin conteo se aproxima con
    monto inicial + efectivo de ventas + recargas en efectivo (los abonos no
    quedaron guardados por separado).
    """
    p = prefijo
    exacto = ExpressionWrapper(F(f'{p}conteo_fisico') - F(f'{p}diferencia'), output_field=_DECIMAL)
    aproximado = ExpressionWrapper(
        Coalesce(F(f'{p}apertura__monto_inicial'), Value(Decimal('0.00')), output_field=_DECIMAL)
        + F(f'{p}total_efectivo') + F(f'{p}total_recargas_efectivo'),
        output_field=_DECIMAL,
    )
    return Coalesce(exacto, aproximado, output_field=_DECIMAL)


def queryset_cierres():
    """Cierres con todo lo que necesita la fila del listado, sin N+1."""
    return (
        CierreCajaCantina.objects
        .select_related('cajero', 'apertura', 'revision', 'revision__revisado_por')
        .annotate(
            esperado_efectivo=expresion_esperado_efectivo(),
            tiene_adjuntos=Exists(AdjuntoRevision.objects.filter(revision__cierre=OuterRef('pk'))),
            fue_reabierto=Exists(ReaperturaCajaCantina.objects.filter(cierre_original=OuterRef('pk'))),
        )
    )


def _revision_de(cierre):
    try:
        return cierre.revision
    except RevisionCierre.DoesNotExist:
        return None


# ─────────────────────────────────────────────
# §3 Cierres
# ─────────────────────────────────────────────
class CierreFilaSerializer(serializers.ModelSerializer):
    """Fila del listado `GET cierres/`. Espera un cierre de `queryset_cierres()`."""
    cajero = serializers.SerializerMethodField()
    turno = serializers.SerializerMethodField()
    total_ventas_usd = serializers.SerializerMethodField()
    esperado_efectivo_usd = serializers.SerializerMethodField()
    conteo_fisico_usd = serializers.SerializerMethodField()
    diferencia_usd = serializers.SerializerMethodField()
    estado_revision = serializers.SerializerMethodField()
    revisado_por = serializers.SerializerMethodField()
    revisado_en = serializers.SerializerMethodField()
    tiene_adjuntos = serializers.SerializerMethodField()
    fue_reabierto = serializers.SerializerMethodField()

    class Meta:
        model = CierreCajaCantina
        fields = (
            'id', 'fecha', 'area', 'cajero', 'turno', 'total_ventas_usd', 'esperado_efectivo_usd',
            'conteo_fisico_usd', 'diferencia_usd', 'estado_revision', 'revisado_por', 'revisado_en',
            'tiene_adjuntos', 'fue_reabierto',
        )
        read_only_fields = fields

    def get_cajero(self, obj):
        return usuario_dict(obj.cajero)

    def get_turno(self, obj):
        return turno_dict(obj.apertura, obj)

    def get_total_ventas_usd(self, obj):
        return dinero(obj.total_ventas)

    def get_esperado_efectivo_usd(self, obj):
        return dinero(getattr(obj, 'esperado_efectivo', None))

    def get_conteo_fisico_usd(self, obj):
        return dinero(obj.conteo_fisico)

    def get_diferencia_usd(self, obj):
        return dinero(obj.diferencia)

    def get_estado_revision(self, obj):
        revision = _revision_de(obj)
        return revision.estado if revision else 'pendiente'

    def get_revisado_por(self, obj):
        revision = _revision_de(obj)
        return usuario_dict(revision.revisado_por) if revision else None

    def get_revisado_en(self, obj):
        revision = _revision_de(obj)
        return fecha_hora(revision.revisado_en) if revision else None

    def get_tiene_adjuntos(self, obj):
        return bool(getattr(obj, 'tiene_adjuntos', False))

    def get_fue_reabierto(self, obj):
        return bool(getattr(obj, 'fue_reabierto', False))


class AdjuntoRevisionSerializer(serializers.ModelSerializer):
    nombre = serializers.CharField(source='nombre_original', read_only=True)
    url = serializers.SerializerMethodField()
    subido_por = serializers.SerializerMethodField()
    subido_en = serializers.SerializerMethodField()
    reemplaza_a = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = AdjuntoRevision
        fields = (
            'id', 'nombre', 'url', 'tipo_mime', 'tamano_bytes', 'descripcion',
            'subido_por', 'subido_en', 'reemplaza_a',
        )
        read_only_fields = fields

    def get_url(self, obj):
        return obj.archivo.url if obj.archivo else None

    def get_subido_por(self, obj):
        return usuario_dict(obj.subido_por)

    def get_subido_en(self, obj):
        return fecha_hora(obj.subido_en)


class CierreDetalleSerializer(CierreFilaSerializer):
    """
    `GET cierres/<id>/`: la fila más el desglose. Espera un cierre de
    `queryset_cierres()` con `revision__adjuntos__subido_por` y
    `reaperturas__autorizado_por` prefetcheados, y `resumen_ventas` en el
    contexto (lo agrega la vista con un único `aggregate`).
    """
    monto_inicial_usd = serializers.SerializerMethodField()
    totales_por_metodo = serializers.SerializerMethodField()
    observaciones_cajero = serializers.CharField(source='observaciones', read_only=True)
    revision = serializers.SerializerMethodField()
    adjuntos = serializers.SerializerMethodField()
    reaperturas = serializers.SerializerMethodField()
    resumen_ventas = serializers.SerializerMethodField()

    class Meta(CierreFilaSerializer.Meta):
        fields = CierreFilaSerializer.Meta.fields + (
            'monto_inicial_usd', 'totales_por_metodo', 'observaciones_cajero', 'revision',
            'adjuntos', 'reaperturas', 'resumen_ventas',
        )
        read_only_fields = fields

    def get_monto_inicial_usd(self, obj):
        return dinero(obj.apertura.monto_inicial) if obj.apertura else None

    def get_totales_por_metodo(self, obj):
        """`CierreCajaCantina.totales_por_metodo` ({metodo: {ventas, abonos,
        recargas, total_usd, total_ves}}) normalizado a lista."""
        crudo = obj.totales_por_metodo or {}
        cero = Decimal('0.00')
        filas = []
        for metodo in sorted(crudo):
            valores = crudo[metodo] or {}
            ventas = Decimal(str(valores.get('ventas') or cero))
            recargas = Decimal(str(valores.get('recargas') or cero))
            abonos = Decimal(str(valores.get('abonos') or cero))
            total = valores.get('total_usd')
            filas.append({
                'metodo': metodo,
                'etiqueta': ETIQUETAS_METODO.get(metodo, metodo),
                'ventas_usd': dinero(ventas),
                'recargas_usd': dinero(recargas),
                'abonos_usd': dinero(abonos),
                'total_usd': dinero(total if total is not None else ventas + recargas + abonos),
            })
        return filas

    def get_revision(self, obj):
        revision = _revision_de(obj)
        if revision is None:
            return {
                'estado': 'pendiente', 'comentario_director': '', 'revisado_por': None,
                'revisado_en': None,
                'transiciones_permitidas': sorted(RevisionCierre.TRANSICIONES['pendiente'], key=ORDEN_ESTADOS.index),
            }
        return {
            'estado': revision.estado,
            'comentario_director': revision.comentario_director,
            'revisado_por': usuario_dict(revision.revisado_por),
            'revisado_en': fecha_hora(revision.revisado_en),
            'transiciones_permitidas': sorted(
                RevisionCierre.TRANSICIONES.get(revision.estado, set()), key=ORDEN_ESTADOS.index,
            ),
        }

    def get_adjuntos(self, obj):
        revision = _revision_de(obj)
        if revision is None:
            return []
        return AdjuntoRevisionSerializer(revision.adjuntos.all(), many=True).data

    def get_reaperturas(self, obj):
        return [
            {
                'id': r.id,
                'apertura_nueva_id': r.apertura_nueva_id,
                'motivo': r.motivo,
                'autorizado_por': usuario_dict(r.autorizado_por),
                'creado_en': fecha_hora(r.creado_en),
            }
            for r in obj.reaperturas.all()
        ]

    def get_resumen_ventas(self, obj):
        resumen = self.context.get('resumen_ventas') or {}
        return {
            'cantidad': resumen.get('cantidad') or 0,
            'anuladas': resumen.get('anuladas') or 0,
            'con_descuento': resumen.get('con_descuento') or 0,
            'manuales': resumen.get('manuales') or 0,
        }


# ─────────────────────────────────────────────
# §5 Evento de bitácora (usado por el historial del cierre)
# ─────────────────────────────────────────────
ETIQUETAS_OBJETO = {
    'cierrecajacantina': 'Cierre',
    'aperturacajacantina': 'Turno',
    'reaperturacajacantina': 'Reapertura',
    'revisioncierre': 'Revisión',
    'adjuntorevision': 'Adjunto',
    'ventacantina': 'Venta',
    'productocantina': 'Producto',
    'movimientoinventario': 'Movimiento',
    'alertacantina': 'Alerta',
}


class EventoAuditoriaSerializer(serializers.ModelSerializer):
    """
    Evento de bitácora con la forma de §5. El usuario sale del snapshot
    (`usuario_nombre`), no del usuario actual, para que el evento muestre a
    quien actuó tal como era en ese momento. `hash` no se expone.
    """
    tipo_etiqueta = serializers.CharField(source='get_tipo_display', read_only=True)
    creado_en = serializers.SerializerMethodField()
    usuario = serializers.SerializerMethodField()
    objeto_etiqueta = serializers.SerializerMethodField()

    class Meta:
        model = EventoAuditoriaCantina
        fields = (
            'id', 'tipo', 'tipo_etiqueta', 'creado_en', 'usuario', 'usuario_rol', 'area',
            'objeto_tipo', 'objeto_id', 'objeto_etiqueta', 'antes', 'despues', 'motivo', 'ip',
        )
        read_only_fields = fields

    def get_creado_en(self, obj):
        return fecha_hora(obj.creado_en)

    def get_usuario(self, obj):
        if obj.usuario_id is None and not obj.usuario_nombre:
            return None
        return {'id': obj.usuario_id, 'nombre': obj.usuario_nombre}

    def get_objeto_etiqueta(self, obj):
        etiqueta = ETIQUETAS_OBJETO.get(obj.objeto_tipo, obj.objeto_tipo)
        return f'{etiqueta} #{obj.objeto_id}'
