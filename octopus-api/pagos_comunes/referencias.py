"""
Punto único de verdad para "esta referencia bancaria ya fue usada en
cualquier módulo de pagos del sistema" (§5.9 de cantina.md).

La unicidad NO es global: es por la clave compuesta (referencia, metodo_pago,
banco_receptor). Un pago móvil "0001" al banco Banesco y otro pago móvil
"0001" al banco Mercantil son transacciones bancarias distintas y ambas son
válidas — solo colisiona la MISMA referencia con el MISMO método al MISMO
banco receptor.

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

_SIN_FILTRO = object()  # sentinel: "no se pasó el parámetro" (compatibilidad, filtra global)


def normalizar_referencia(raw):
    """Mayúsculas + colapsa espacios — mismo criterio que ya usaban
    cobranza/serializers.py y portal/views.py por separado."""
    return ' '.join((raw or '').strip().upper().split())


def buscar_referencia_duplicada(
    ref_normalizada,
    excluir_pago_id=None,
    excluir_recarga_id=None,
    metodo_pago=_SIN_FILTRO,
    banco_receptor_id=_SIN_FILTRO,
):
    """
    Busca `ref_normalizada` (ya normalizada por `normalizar_referencia`) en
    los tres lugares del sistema donde una referencia bancaria puede quedar
    registrada como "en uso": cobranza.Pago, portal.ComprobantePago y
    cantina.RecargaTarjeta.

    `metodo_pago` y `banco_receptor_id` acotan la búsqueda a la clave
    compuesta (referencia, metodo_pago, banco_receptor): la misma referencia
    con un método o un banco receptor distinto NO es duplicado.

    Si `metodo_pago`/`banco_receptor_id` no se pasan (quedan en el sentinel
    _SIN_FILTRO), la función se comporta exactamente como antes: búsqueda
    global solo por referencia. Esto es requisito de compatibilidad —
    cantina/tests_recargas.py la llama con un solo argumento.

    Si SÍ se pasa `banco_receptor_id` y resulta None (ej. comprobante del
    portal sin banco), el filtro compara banco_receptor__isnull=True —NULL
    contra NULL— en vez de ignorar el banco. Es un caso distinto al de
    compatibilidad de arriba: acá el llamador sabe que no hay banco y quiere
    que eso también participe de la clave de unicidad.

    Devuelve un dict {'origen', 'id', 'detalle'} describiendo dónde ya
    existe, o None si la referencia está libre.
    """
    if not ref_normalizada:
        return None

    from cobranza.models import Pago
    from portal.models import ComprobantePago
    from cantina.models import RecargaTarjeta

    con_filtro_compuesto = metodo_pago is not _SIN_FILTRO or banco_receptor_id is not _SIN_FILTRO

    def _filtro_banco(qs):
        if banco_receptor_id is _SIN_FILTRO:
            return qs
        if banco_receptor_id is None:
            return qs.filter(banco_receptor__isnull=True)
        return qs.filter(banco_receptor_id=banco_receptor_id)

    def _detalle_banco():
        if not con_filtro_compuesto:
            return ''
        if banco_receptor_id is None:
            return ' (sin banco receptor)'
        from cobranza.models import BancoInstitucional
        try:
            nombre = BancoInstitucional.objects.get(pk=banco_receptor_id).nombre
        except BancoInstitucional.DoesNotExist:
            nombre = f'banco #{banco_receptor_id}'
        return f' (banco {nombre})'

    pagos_qs = Pago.objects.filter(
        referencia=ref_normalizada, estatus__in=['completado', 'en_revision'],
    ).exclude(pk=excluir_pago_id)
    if metodo_pago is not _SIN_FILTRO:
        pagos_qs = pagos_qs.filter(metodo_pago=metodo_pago)
    pagos_qs = _filtro_banco(pagos_qs)
    dup_pago = pagos_qs.first()
    if dup_pago:
        return {
            'origen': 'cobranza.Pago',
            'id': dup_pago.pk,
            'detalle': (
                f'factura {dup_pago.factura_id or dup_pago.pk}, alumno {dup_pago.alumno.nombre} '
                f'{dup_pago.alumno.apellido}{_detalle_banco()}'
            ),
        }

    comp_qs = ComprobantePago.objects.filter(
        referencia_bancaria=ref_normalizada, estatus__in=['pendiente', 'aprobado'],
    )
    if metodo_pago is not _SIN_FILTRO:
        comp_qs = comp_qs.filter(metodo_pago=metodo_pago)
    comp_qs = _filtro_banco(comp_qs)
    dup_comp = comp_qs.first()
    if dup_comp:
        return {
            'origen': 'portal.ComprobantePago',
            'id': dup_comp.pk,
            'detalle': f'estatus {dup_comp.estatus}{_detalle_banco()}',
        }

    recarga_qs = RecargaTarjeta.objects.filter(
        referencia=ref_normalizada, estatus__in=['pendiente', 'aprobado'],
    ).exclude(pk=excluir_recarga_id)
    if metodo_pago is not _SIN_FILTRO:
        recarga_qs = recarga_qs.filter(metodo_pago=metodo_pago)
    recarga_qs = _filtro_banco(recarga_qs)
    dup_recarga = recarga_qs.first()
    if dup_recarga:
        return {
            'origen': 'cantina.RecargaTarjeta',
            'id': dup_recarga.pk,
            'detalle': f'estatus {dup_recarga.estatus}{_detalle_banco()}',
        }

    return None
