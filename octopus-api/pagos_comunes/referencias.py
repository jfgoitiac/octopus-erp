"""
Punto único de verdad para "esta referencia bancaria ya fue usada en
cualquier módulo de pagos del sistema" (§5.9 de cantina.md).

Módulo plano: sin modelos, sin migraciones, no aparece en INSTALLED_APPS.
Antes de este módulo, `cobranza` validaba duplicados solo contra `Pago` y
`portal.ComprobantePago`, sin saber que `cantina.RecargaTarjeta` existe —
alguien podía reciclar la misma referencia de una mensualidad para "pagar"
una recarga de cantina (o viceversa) y el sistema no lo detectaba porque
cada módulo solo miraba su propia tabla.

Los imports de modelos son locales a la función (no a nivel de módulo)
para evitar dependencias circulares: ni `cobranza` ni `cantina` importan
modelos de la otra app a nivel de módulo, solo aquí, dentro de la función.
"""


def normalizar_referencia(raw):
    """Mayúsculas + colapsa espacios — mismo criterio que ya usaban
    cobranza/serializers.py y portal/views.py por separado."""
    return ' '.join((raw or '').strip().upper().split())


def buscar_referencia_duplicada(ref_normalizada, excluir_pago_id=None, excluir_recarga_id=None):
    """
    Busca `ref_normalizada` (ya normalizada por `normalizar_referencia`) en
    los tres lugares del sistema donde una referencia bancaria puede quedar
    registrada como "en uso": cobranza.Pago, portal.ComprobantePago y
    cantina.RecargaTarjeta.

    Devuelve un dict {'origen', 'id', 'detalle'} describiendo dónde ya
    existe, o None si la referencia está libre.
    """
    if not ref_normalizada:
        return None

    from cobranza.models import Pago
    from portal.models import ComprobantePago
    from cantina.models import RecargaTarjeta

    dup_pago = Pago.objects.filter(
        referencia=ref_normalizada, estatus__in=['completado', 'en_revision'],
    ).exclude(pk=excluir_pago_id).first()
    if dup_pago:
        return {
            'origen': 'cobranza.Pago',
            'id': dup_pago.pk,
            'detalle': f'factura {dup_pago.factura_id or dup_pago.pk}, alumno {dup_pago.alumno.nombre} {dup_pago.alumno.apellido}',
        }

    dup_comp = ComprobantePago.objects.filter(
        referencia_bancaria=ref_normalizada, estatus__in=['pendiente', 'aprobado'],
    ).first()
    if dup_comp:
        return {'origen': 'portal.ComprobantePago', 'id': dup_comp.pk, 'detalle': f'estatus {dup_comp.estatus}'}

    dup_recarga = RecargaTarjeta.objects.filter(
        referencia=ref_normalizada, estatus__in=['pendiente', 'aprobado'],
    ).exclude(pk=excluir_recarga_id).first()
    if dup_recarga:
        return {'origen': 'cantina.RecargaTarjeta', 'id': dup_recarga.pk, 'detalle': f'estatus {dup_recarga.estatus}'}

    return None
