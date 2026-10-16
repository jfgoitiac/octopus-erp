"""Serializers y armadores de respuesta de las cuentas por cobrar (CxC).

Las respuestas siguen exactamente PROMPT_CANTINA_CXC.md §3.3. Los saldos se
calculan siempre desde `CargoCantina` (nunca denormalizados) y, en los listados,
con subconsultas anotadas para evitar N+1.
"""
from decimal import Decimal

from django.db.models import DecimalField, ExpressionWrapper, F, Min, OuterRef, Subquery, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import serializers

from cobranza.models import TasaCambio
from secretaria.models import Alumno

from .models import AREAS, CargoCantina, ClienteCantina, ParametroCantina

CERO = Decimal('0.00')
_MONEDA = DecimalField(max_digits=12, decimal_places=2)
AREAS_VALIDAS = {a[0] for a in AREAS}


# ─────────────────────────────────────────────
# Entrada
# ─────────────────────────────────────────────
class AbonoInputSerializer(serializers.Serializer):
    # Exactamente uno de representante_id / cliente_id.
    representante_id = serializers.IntegerField(required=False, allow_null=True)
    cliente_id = serializers.IntegerField(required=False, allow_null=True)
    fecha_pago = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    motivo = serializers.CharField(required=False, allow_blank=True, default='')
    area = serializers.ChoiceField(choices=AREAS, required=False, allow_null=True)
    lineas = serializers.ListField(child=serializers.DictField(), allow_empty=False)


    def validate(self, attrs):
        if bool(attrs.get('representante_id')) == bool(attrs.get('cliente_id')):
            raise serializers.ValidationError('Indique exactamente uno de representante_id o cliente_id.')
        return attrs


class ClienteInputSerializer(serializers.ModelSerializer):
    """Alta/edición de un cliente general (el límite y el bloqueo van por otro endpoint)."""
    apellido = serializers.CharField(max_length=100, required=False, allow_blank=True)
    documento = serializers.CharField(max_length=30, required=False, allow_blank=True, allow_null=True)
    telefono = serializers.CharField(max_length=30, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)

    class Meta:
        model = ClienteCantina
        fields = ('nombre', 'apellido', 'documento', 'telefono', 'email', 'tipo', 'activo')

    def validate_nombre(self, valor):
        valor = valor.strip()
        if not valor:
            raise serializers.ValidationError('El nombre es obligatorio.')
        return valor

    def validate_documento(self, valor):
        valor = (valor or '').strip().upper()
        if not valor:
            return None  # varios clientes sin documento: se guarda NULL, no ''
        existe = ClienteCantina.objects.filter(documento__iexact=valor)
        if self.instance is not None:
            existe = existe.exclude(pk=self.instance.pk)
        if existe.exists():
            raise serializers.ValidationError('Ya existe un cliente con ese documento.')
        return valor


class AnularAbonoInputSerializer(serializers.Serializer):
    motivo = serializers.CharField(allow_blank=False, max_length=500)


class CreditoInputSerializer(serializers.Serializer):
    limite_usd = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True, min_value=Decimal('0'))
    bloqueado = serializers.BooleanField(required=False)


# ─────────────────────────────────────────────
# Anotaciones de saldo (una sola consulta)
# ─────────────────────────────────────────────
def _subquery_saldo(area=None, campo='representante'):
    qs = CargoCantina.objects.filter(**{campo: OuterRef('pk')}).exclude(estado='anulado')
    if area:
        qs = qs.filter(area=area)
    return Coalesce(
        Subquery(
            qs.order_by().values(campo).annotate(
                s=Sum(ExpressionWrapper(F('monto_usd') - F('monto_pagado'), output_field=_MONEDA))
            ).values('s')[:1],
            output_field=_MONEDA,
        ),
        Decimal('0.00'),
        output_field=_MONEDA,
    )


def anotar_saldos(qs, area=None):
    """Anota saldo_total (del área si se indica), saldo_cantina, saldo_libreria,
    deuda_mas_antigua (cargo pendiente más viejo) y el límite override."""
    pendientes = CargoCantina.objects.filter(representante=OuterRef('pk'), estado='pendiente')
    if area:
        pendientes = pendientes.filter(area=area)
    return qs.annotate(
        saldo_total=_subquery_saldo(area),
        saldo_cantina=_subquery_saldo('cantina'),
        saldo_libreria=_subquery_saldo('libreria'),
        deuda_mas_antigua=Subquery(
            pendientes.order_by().values('representante').annotate(m=Min('creado_en')).values('m')[:1]
        ),
        limite_override=F('credito_cantina__limite_usd'),
        esta_bloqueado=F('credito_cantina__bloqueado'),
    )


def anotar_saldos_clientes(qs, area=None):
    """Igual que `anotar_saldos` pero para `ClienteCantina` (límite/bloqueo viven en el cliente)."""
    pendientes = CargoCantina.objects.filter(cliente=OuterRef('pk'), estado='pendiente')
    if area:
        pendientes = pendientes.filter(area=area)
    return qs.annotate(
        saldo_total=_subquery_saldo(area, 'cliente'),
        saldo_cantina=_subquery_saldo('cantina', 'cliente'),
        saldo_libreria=_subquery_saldo('libreria', 'cliente'),
        deuda_mas_antigua=Subquery(
            pendientes.order_by().values('cliente').annotate(m=Min('creado_en')).values('m')[:1]
        ),
        limite_override=F('limite_usd'),
        esta_bloqueado=F('bloqueado'),
    )


def limite_default():
    parametro = ParametroCantina.objects.first()
    if parametro is not None:
        return parametro.limite_credito_representante_default
    return ParametroCantina._meta.get_field('limite_credito_representante_default').default


def tasa_vigente_valor():
    tasa = TasaCambio.objects.order_by('-fecha').first()
    return tasa.valor_bs if tasa else None


def a_ves(monto_usd, tasa):
    if tasa is None:
        return None
    return str((monto_usd * tasa).quantize(Decimal('0.01')))


def nombre_usuario(user):
    if user is None:
        return ''
    return getattr(user, 'nombre_completo', None) or user.get_full_name() or user.username


# ─────────────────────────────────────────────
# Salida
# ─────────────────────────────────────────────
def serializar_alumno(alumno):
    return {
        'id': alumno.id,
        'nombre': alumno.nombre,
        'apellido': alumno.apellido,
        'grado_seccion': alumno.grado_seccion,
    }


def serializar_representante_resumen(rep, default_limite, tasa=None, con_totales=False):
    """`rep` debe venir de `anotar_saldos` con `alumnos_activos` prefetcheado."""
    limite = rep.limite_override if rep.limite_override is not None else default_limite
    data = {
        'tipo': 'representante',
        'id': rep.id,
        'cedula': rep.cedula,
        'nombre': rep.nombre,
        'apellido': rep.apellido,
        'telefono': rep.telefono,
        'saldo_usd': str(rep.saldo_total),
        'limite_usd': str(limite),
        'bloqueado': bool(rep.esta_bloqueado),
        'alumnos': [serializar_alumno(a) for a in getattr(rep, 'alumnos_activos', [])],
    }
    if con_totales:
        data.update(_totales(rep, tasa))
    return data


def _totales(titular, tasa):
    dias = None
    if titular.deuda_mas_antigua:
        dias = max((timezone.now() - titular.deuda_mas_antigua).days, 0)
    return {
        'saldo_ves_tasa_vigente': a_ves(titular.saldo_total, tasa),
        'saldo_cantina_usd': str(titular.saldo_cantina),
        'saldo_libreria_usd': str(titular.saldo_libreria),
        'dias_deuda_mas_antigua': dias,
    }


def serializar_cliente_resumen(cli, default_limite, tasa=None, con_totales=False):
    """`cli` debe venir de `anotar_saldos_clientes`. Misma forma que el resumen de
    representante (`cedula` = documento) más tipo/activo/email."""
    limite = cli.limite_override if cli.limite_override is not None else default_limite
    data = {
        'tipo': cli.tipo,
        'id': cli.id,
        'cedula': cli.documento or '',
        'nombre': cli.nombre,
        'apellido': cli.apellido,
        'telefono': cli.telefono,
        'email': cli.email,
        'activo': cli.activo,
        'saldo_usd': str(cli.saldo_total),
        'limite_usd': str(limite),
        'limite_personalizado': cli.limite_override is not None,
        'bloqueado': bool(cli.esta_bloqueado),
        'alumnos': [],
    }
    if con_totales:
        data.update(_totales(cli, tasa))
    return data


def prefetch_alumnos():
    from django.db.models import Prefetch
    return Prefetch('alumnos', queryset=Alumno.objects.filter(activo=True).order_by('apellido', 'nombre'),
                    to_attr='alumnos_activos')


def serializar_cargo(cargo):
    venta = cargo.venta
    return {
        'id': cargo.id,
        'creado_en': cargo.creado_en,
        'fecha': cargo.creado_en,
        'area': cargo.area,
        'alumno_nombre': (f'{cargo.alumno.nombre} {cargo.alumno.apellido}' if cargo.alumno_id else None),
        'venta_id': cargo.venta_id,
        'detalle': [
            {'producto': d.producto.nombre, 'cantidad': d.cantidad, 'subtotal': str(d.subtotal)}
            for d in venta.detalles.all()
        ],
        'monto_usd': str(cargo.monto_usd),
        'monto_pagado': str(cargo.monto_pagado),
        'saldo_usd': str(cargo.saldo_usd),
        'estado': cargo.estado,
    }


def serializar_linea_abono(abono):
    return {
        'id': abono.id,
        'metodo_pago': abono.metodo_pago,
        'monto_usd': str(abono.monto_usd),
        'tasa_aplicada': str(abono.tasa_aplicada),
        'monto_ves': str(abono.monto_ves),
        'banco_receptor': abono.banco_receptor.nombre if abono.banco_receptor_id else None,
        'banco_procedencia': abono.banco_procedencia,
        'referencia': abono.referencia,
        'numero_lote': abono.numero_lote,
    }


def agrupar_abonos(abonos):
    """Agrupa líneas (AbonoCantina) por operacion_uuid, conservando el orden recibido."""
    operaciones = {}
    for ab in abonos:
        op = operaciones.get(ab.operacion_uuid)
        if op is None:
            op = operaciones[ab.operacion_uuid] = {
                'operacion_uuid': str(ab.operacion_uuid),
                'fecha_pago': ab.fecha_pago,
                'area': ab.area,
                'lineas': [],
                'total_usd': CERO,
                'estatus': ab.estatus,
                'es_retroactivo': ab.es_retroactivo,
                'motivo': ab.motivo,
                'cajero': nombre_usuario(ab.cajero),
            }
        op['lineas'].append(serializar_linea_abono(ab))
        op['total_usd'] += ab.monto_usd
    for op in operaciones.values():
        op['total_usd'] = str(op['total_usd'])
    return list(operaciones.values())
