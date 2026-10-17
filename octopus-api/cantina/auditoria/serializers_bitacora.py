"""
Serializers de bitácora, alertas y parámetros de la Auditoría de Cantina —
carril B4 (Fase 2). Formas exactas de CONTRATO_AUDITORIA_CANTINA.md §5–§7.

Reutiliza los helpers de representación de `serializers_cierres.py`
(`usuario_dict`, `fecha_hora`, `dinero`) y el evento de bitácora de B2.
"""
from decimal import Decimal

from rest_framework import serializers

from cantina.models import (
    AlertaCantina,
    AperturaCajaCantina,
    CierreCajaCantina,
    ParametroAuditoriaCantina,
    ProductoCantina,
    ReaperturaCajaCantina,
)

from .serializers_cierres import EventoAuditoriaSerializer, fecha_hora, nombre_usuario, usuario_dict


# ─────────────────────────────────────────────
# §5 Bitácora
# ─────────────────────────────────────────────
def _ids_enteros(ids):
    enteros = set()
    for valor in ids:
        try:
            enteros.add(int(valor))
        except (TypeError, ValueError):
            continue
    return enteros


def _etiquetas_productos(ids):
    return {p.id: p.nombre for p in ProductoCantina.objects.filter(id__in=ids).only('id', 'nombre')}


def _etiquetas_cierres(ids):
    cierres = CierreCajaCantina.objects.filter(id__in=ids).select_related('cajero')
    return {c.id: f'Cierre #{c.id} · {nombre_usuario(c.cajero)}' for c in cierres}


def _etiquetas_aperturas(ids):
    aperturas = AperturaCajaCantina.objects.filter(id__in=ids).select_related('cajero')
    return {a.id: f'Turno #{a.id} · {nombre_usuario(a.cajero)}' for a in aperturas}


def _etiquetas_reaperturas(ids):
    reaperturas = ReaperturaCajaCantina.objects.filter(id__in=ids).only('id', 'cierre_original_id')
    return {r.id: f'Reapertura del cierre #{r.cierre_original_id}' for r in reaperturas}


def _etiquetas_alertas(ids):
    return {a.id: a.titulo for a in AlertaCantina.objects.filter(id__in=ids).only('id', 'titulo')}


# objeto_tipo → función que recibe ids y devuelve {id: etiqueta} en UNA consulta.
_RESOLVEDORES_ETIQUETA = {
    'productocantina': _etiquetas_productos,
    'cierrecajacantina': _etiquetas_cierres,
    'aperturacajacantina': _etiquetas_aperturas,
    'reaperturacajacantina': _etiquetas_reaperturas,
    'alertacantina': _etiquetas_alertas,
}
_ETIQUETAS_FIJAS = {'parametroauditoriacantina': 'Parámetros de auditoría'}


def etiquetas_objetos(eventos):
    """
    {(objeto_tipo, objeto_id): etiqueta legible} para una página de eventos:
    una consulta por tipo de objeto presente (nunca una por evento). Lo que no
    se resuelve (objeto inexistente o tipo sin resolvedor) cae en la etiqueta
    genérica "Tipo #id" de `EventoAuditoriaSerializer`.
    """
    por_tipo = {}
    for evento in eventos:
        por_tipo.setdefault(evento.objeto_tipo, set()).add(evento.objeto_id)
    etiquetas = {}
    for objeto_tipo, ids in por_tipo.items():
        if objeto_tipo in _ETIQUETAS_FIJAS:
            etiquetas.update({(objeto_tipo, i): _ETIQUETAS_FIJAS[objeto_tipo] for i in ids})
            continue
        resolver = _RESOLVEDORES_ETIQUETA.get(objeto_tipo)
        enteros = _ids_enteros(ids)
        if resolver is None or not enteros:
            continue
        for pk, etiqueta in resolver(enteros).items():
            etiquetas[(objeto_tipo, str(pk))] = etiqueta
    return etiquetas


class EventoBitacoraSerializer(EventoAuditoriaSerializer):
    """
    Evento del listado `GET bitacora/` (§5). Igual al de B2 pero con
    `objeto_etiqueta` legible (nombre del producto, cajero del turno…),
    precalculada con `etiquetas_objetos()` y pasada en el contexto.
    """

    def get_objeto_etiqueta(self, obj):
        etiqueta = self.context.get('etiquetas', {}).get((obj.objeto_tipo, obj.objeto_id))
        return etiqueta or super().get_objeto_etiqueta(obj)


# ─────────────────────────────────────────────
# §6 Alertas
# ─────────────────────────────────────────────
class AlertaSerializer(serializers.ModelSerializer):
    tipo_etiqueta = serializers.CharField(source='get_tipo_display', read_only=True)
    atendida_por = serializers.SerializerMethodField()
    atendida_en = serializers.SerializerMethodField()

    class Meta:
        model = AlertaCantina
        fields = (
            'id', 'tipo', 'tipo_etiqueta', 'severidad', 'fecha', 'area', 'titulo', 'detalle',
            'referencia_tipo', 'referencia_id', 'estado', 'atendida_por', 'atendida_en', 'nota_atencion',
        )
        read_only_fields = fields

    def get_atendida_por(self, obj):
        return usuario_dict(obj.atendida_por)

    def get_atendida_en(self, obj):
        return fecha_hora(obj.atendida_en)


# ─────────────────────────────────────────────
# §7 Parámetros
# ─────────────────────────────────────────────
CAMPOS_PARAMETROS = (
    'tolerancia_diferencia_caja',
    'limite_anulaciones_dia_cajero',
    'limite_anulaciones_dia_total',
    'limite_descuentos_dia_cajero',
    'limite_descuento_porcentaje',
    'hora_tope_cierre',
)


class ParametrosAuditoriaSerializer(serializers.ModelSerializer):
    """
    GET/PUT `parametros/`. El PUT admite envío parcial: los campos omitidos
    conservan su valor. Rangos acotados para que un error de tipeo no apague
    (o dispare sin control) el motor de alertas.
    """
    tolerancia_diferencia_caja = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=Decimal('0.00'), max_value=Decimal('10000.00'),
    )
    limite_anulaciones_dia_cajero = serializers.IntegerField(min_value=0, max_value=1000)
    limite_anulaciones_dia_total = serializers.IntegerField(min_value=0, max_value=10000)
    limite_descuentos_dia_cajero = serializers.IntegerField(min_value=0, max_value=1000)
    limite_descuento_porcentaje = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=Decimal('0.00'), max_value=Decimal('100.00'),
    )
    hora_tope_cierre = serializers.TimeField(format='%H:%M', input_formats=['%H:%M', '%H:%M:%S'])
    actualizado_por = serializers.SerializerMethodField()
    actualizado_en = serializers.SerializerMethodField()

    class Meta:
        model = ParametroAuditoriaCantina
        fields = CAMPOS_PARAMETROS + ('actualizado_por', 'actualizado_en')

    def get_actualizado_por(self, obj):
        return usuario_dict(obj.actualizado_por)

    def get_actualizado_en(self, obj):
        return fecha_hora(obj.actualizado_en)

    def validate(self, attrs):
        cajero = attrs.get('limite_anulaciones_dia_cajero', getattr(self.instance, 'limite_anulaciones_dia_cajero', 0))
        total = attrs.get('limite_anulaciones_dia_total', getattr(self.instance, 'limite_anulaciones_dia_total', 0))
        if total < cajero:
            raise serializers.ValidationError(
                'El límite total de anulaciones del día no puede ser menor que el límite por cajero.'
            )
        return attrs


def valores_parametros(parametros):
    """Snapshot JSON de los campos editables (para `antes`/`despues` del evento)."""
    datos = ParametrosAuditoriaSerializer(parametros).data
    return {campo: datos[campo] for campo in CAMPOS_PARAMETROS}
