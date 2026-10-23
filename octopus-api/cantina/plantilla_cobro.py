"""
Plantilla de cobro de las cuentas por cobrar (CxC) de Cantina / Librería.

Es un documento de COBRO (estado de cuenta a cobrar, para enviar o imprimir al
deudor), no un recibo de pago: lista cada cargo pendiente con su desglose de
productos, los abonos ya aplicados, el saldo y el TOTAL A PAGAR en bolívares a
la tasa vigente de Cantina (con la referencia en USD).

Reutiliza el membrete, los estilos y el paginado del recibo de cobranza
(``cobranza.recibo_cobranza``) para que ambos documentos luzcan igual. Solo lee
cargos y saldos: no modifica ``services_cxc``.

Coherencia de redondeo: cada línea se convierte a Bs con la misma regla
(centavo, mitad hacia arriba) y la diferencia contra el total convertido de una
sola vez se absorbe en la última línea, de modo que la suma de las líneas es
EXACTAMENTE el total impreso.
"""
import logging
import re
from decimal import ROUND_HALF_UP, Decimal
from io import BytesIO
from xml.sax.saxutils import escape

from django.utils import timezone
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Table, TableStyle

from cobranza.recibo_cobranza import (
    CAJA, GRIS, NAVY, RED, TEXT,
    EST_COLUMNA, EST_L, EST_LB, EST_R, EST_SECCION,
    _Pagina, _dibujar_encabezado, _dibujar_pie, _estilo, _estilo_tabla, _p,
    fmt_bs, membrete_colegio,
)

from . import services_cxc
from .models import CargoCantina

logger = logging.getLogger(__name__)

CENTAVO = Decimal('0.01')
AREA_NOMBRES = {'cantina': 'CANTINA', 'libreria': 'LIBRERÍA'}
TIPO_NOMBRES = {'representante': 'Representante', 'personal': 'Personal', 'otro': 'Cliente'}

# Datos de pago que el colegio publica a los representantes (portal): se leen
# de los mismos campos de BancoInstitucional.portal_metodos.
_METODOS_PAGO = {
    'transferencia': ('Transferencia bancaria', ('titular', 'identificacion', 'numero_cuenta')),
    'pago_movil': ('Pago Móvil', ('titular', 'identificacion', 'telefono')),
    'zelle': ('Zelle', ('titular', 'correo')),
    'punto_de_venta': ('Punto de venta', ('instrucciones',)),
}
_ETIQUETAS_CAMPO = {
    'titular': 'Titular', 'identificacion': 'C.I./RIF', 'numero_cuenta': 'Cuenta',
    'telefono': 'Teléfono', 'correo': 'Correo', 'instrucciones': '',
}

EST_CENTRO = _estilo('pc_centro', 7, align=TA_CENTER)
EST_TOTAL_ROT = _estilo('pc_total_rot', 11, bold=True, color=RED, align=TA_RIGHT)
EST_TOTAL_USD = _estilo('pc_total_usd', 7, color=GRIS, align=TA_RIGHT)
EST_ETQ = _estilo('pc_etq', 8, bold=True, align=TA_RIGHT)
EST_PAGO = _estilo('pc_pago', 7.5)
EST_NOTA = _estilo('pc_nota', 7, color=GRIS, align=TA_LEFT)


class PlantillaCobroError(Exception):
    """Error de negocio mostrable al usuario (sin tasa, sin cargos pendientes)."""


def _bs(usd, tasa):
    return (Decimal(usd) * Decimal(tasa)).quantize(CENTAVO, rounding=ROUND_HALF_UP)


def _fecha(valor):
    return timezone.localtime(valor).strftime('%d/%m/%Y')


# ──────────────────────────────────────────────────────────────────────────────
# DATOS
# ──────────────────────────────────────────────────────────────────────────────

def metodos_pago_colegio():
    """Métodos de pago publicados por el colegio: [{'titulo', 'detalle'}]."""
    from cobranza.models import BancoInstitucional

    metodos = []
    for banco in BancoInstitucional.objects.filter(activo=True).order_by('nombre'):
        config = banco.portal_metodos or {}
        for metodo in banco.tipos or []:
            datos = config.get(metodo) or {}
            if not datos.get('visible') or metodo not in _METODOS_PAGO:
                continue
            nombre, campos = _METODOS_PAGO[metodo]
            valores = {c: str(datos.get(c) or '').strip() for c in campos}
            if metodo == 'transferencia' and not valores['numero_cuenta']:
                valores['numero_cuenta'] = (banco.numero_cuenta or '').strip()
            partes = []
            for campo in campos:
                if valores[campo]:
                    etiqueta = _ETIQUETAS_CAMPO[campo]
                    partes.append(f'{etiqueta}: {valores[campo]}' if etiqueta else valores[campo])
            if partes:
                metodos.append({'titulo': f'{banco.nombre} — {nombre}', 'detalle': '  |  '.join(partes)})
    return metodos


def datos_plantilla(titular, tasa, *, area=None, fecha_inicio=None, fecha_fin=None):
    """
    Datos de la plantilla de cobro del `titular` (Representante o ClienteCantina).
    `tasa` es la tasa vigente de Cantina (Decimal). Lanza PlantillaCobroError si
    no hay nada que cobrar.
    """
    es_cliente = services_cxc.es_cliente(titular)
    cargos = (
        CargoCantina.objects.filter(**services_cxc.filtro_titular(titular), estado='pendiente')
        .select_related('alumno', 'venta')
        .prefetch_related('venta__detalles__producto')
        .order_by('creado_en', 'id')
    )
    if area:
        cargos = cargos.filter(area=area)
    if fecha_inicio:
        cargos = cargos.filter(creado_en__date__gte=fecha_inicio)
    if fecha_fin:
        cargos = cargos.filter(creado_en__date__lte=fecha_fin)
    cargos = list(cargos)
    if not cargos:
        raise PlantillaCobroError('No hay cargos pendientes para los filtros seleccionados.')

    lineas = []
    for c in cargos:
        productos = []
        for d in c.venta.detalles.all():
            productos.append({
                'cantidad': d.cantidad,
                'producto': d.producto.nombre,
                'precio_bs': _bs(d.precio_unitario, tasa),
            })
        monto_bs = _bs(c.monto_usd, tasa)
        abonado_bs = _bs(c.monto_pagado, tasa)
        lineas.append({
            'fecha': _fecha(c.creado_en),
            'venta_id': c.venta_id,
            'area': c.area,
            'alumno': f'{c.alumno.nombre} {c.alumno.apellido}' if c.alumno_id else '',
            'productos': productos,
            'descuento_bs': _bs(c.venta.descuento_usd, tasa) if c.venta.descuento_usd else Decimal('0.00'),
            'monto_usd': c.monto_usd,
            'abonado_usd': c.monto_pagado,
            'saldo_usd': c.saldo_usd,
            'monto_bs': monto_bs,
            'abonado_bs': abonado_bs,
            'saldo_bs': monto_bs - abonado_bs,
        })

    total_usd = sum((l['saldo_usd'] for l in lineas), Decimal('0.00'))
    total_bs = _bs(total_usd, tasa)
    # La suma de las líneas debe ser el total: el residuo de redondeo va a la última.
    diferencia = total_bs - sum((l['saldo_bs'] for l in lineas), Decimal('0.00'))
    if diferencia:
        lineas[-1]['monto_bs'] += diferencia
        lineas[-1]['saldo_bs'] += diferencia

    ref = titular
    nombre = ' '.join(x for x in (ref.nombre, ref.apellido) if x).strip()
    documento = (ref.documento if es_cliente else ref.cedula) or ''
    return {
        'titular': {
            'nombre': nombre,
            'documento': documento,
            'telefono': ref.telefono or '',
            'tipo': TIPO_NOMBRES.get(getattr(ref, 'tipo', 'representante'), 'Cliente'),
        },
        'area': area,
        'fecha_inicio': fecha_inicio,
        'fecha_fin': fecha_fin,
        'emision': timezone.localtime(),
        'tasa': Decimal(tasa),
        'lineas': lineas,
        'total_cargos_bs': sum((l['monto_bs'] for l in lineas), Decimal('0.00')),
        'total_abonos_bs': sum((l['abonado_bs'] for l in lineas), Decimal('0.00')),
        'total_bs': total_bs,
        'total_usd': total_usd,
        'metodos_pago': metodos_pago_colegio(),
    }


# ──────────────────────────────────────────────────────────────────────────────
# DIBUJO
# ──────────────────────────────────────────────────────────────────────────────

def _titulo(d):
    areas = AREA_NOMBRES.get(d['area'])
    return f'ESTADO DE CUENTA POR COBRAR - {areas}' if areas else 'ESTADO DE CUENTA POR COBRAR - CANTINA Y LIBRERÍA'


def _periodo(d):
    if d['fecha_inicio'] and d['fecha_fin']:
        return f"Del {d['fecha_inicio']:%d/%m/%Y} al {d['fecha_fin']:%d/%m/%Y}"
    if d['fecha_inicio']:
        return f"Desde el {d['fecha_inicio']:%d/%m/%Y}"
    if d['fecha_fin']:
        return f"Hasta el {d['fecha_fin']:%d/%m/%Y}"
    return 'Todos los cargos pendientes'


def _dibujar_titulo(pag, d):
    cv = pag.cv
    alto, top = 41, pag.y
    cv.setStrokeColor(CAJA)
    cv.setLineWidth(0.8)
    cv.roundRect(pag.x, top - alto, pag.ancho, alto, 4, stroke=1, fill=0)
    cv.setFillColor(TEXT)
    cv.setFont('Helvetica-Bold', 12)
    cv.drawString(pag.x + 18, top - 17, _titulo(d))
    cv.setFont('Helvetica', 9)
    cv.drawString(pag.x + 18, top - 33, f"Emisión: {d['emision']:%d/%m/%Y}   ·   {_periodo(d)}")
    x_der = pag.x + pag.ancho - 12
    cv.setFont('Helvetica', 8)
    cv.drawRightString(x_der, top - 14, 'TASA DE CAMBIO VIGENTE')
    cv.setFillColor(NAVY)
    cv.setFont('Helvetica-Bold', 12)
    cv.drawRightString(x_der, top - 31, f"Bs. {fmt_bs(d['tasa'])} / USD")
    pag.y -= alto + 15


def _tabla_titular(pag, d):
    t = d['titular']
    filas = [
        [_p('DATOS DEL TITULAR', EST_SECCION), '', ''],
        [_p(x, EST_COLUMNA) for x in ('NOMBRE', 'DOCUMENTO', 'TELÉFONO')],
        [_p(f"{t['nombre']} ({t['tipo']})", EST_CENTRO), _p(t['documento'], EST_CENTRO), _p(t['telefono'], EST_CENTRO)],
    ]
    anchos = [pag.ancho * f for f in (0.5, 0.25, 0.25)]
    return Table(filas, colWidths=anchos, rowHeights=[21, 16, None], style=_estilo_tabla([
        ('SPAN', (0, 0), (-1, 0)),
        ('TOPPADDING', (0, 2), (-1, 2), 5),
        ('BOTTOMPADDING', (0, 2), (-1, 2), 5),
    ]))


def _concepto(linea):
    """Celda de concepto: un renglón por producto con cantidad × precio unitario."""
    renglones = []
    if linea['alumno']:
        renglones.append(f"<b>Alumno:</b> {_esc(linea['alumno'])}")
    for p in linea['productos']:
        renglones.append(f"{p['cantidad']} × {_esc(p['producto'])} @ Bs. {fmt_bs(p['precio_bs'])}")
    if linea['descuento_bs']:
        renglones.append(f"Descuento: -Bs. {fmt_bs(linea['descuento_bs'])}")
    if not linea['productos']:
        renglones.append(f"Venta #{linea['venta_id']}")
    return Paragraph('<br/>'.join(renglones), EST_L)


def _esc(texto):
    return escape(str(texto or ''))


def _tabla_cargos(pag, d):
    anchos = [pag.ancho * f for f in (0.10, 0.08, 0.37, 0.15, 0.15, 0.15)]
    filas = [
        [_p('DETALLE DE CARGOS PENDIENTES (MONTOS EN BOLÍVARES)', EST_SECCION)] + [''] * 5,
        [_p(x, EST_COLUMNA) for x in ('FECHA', 'N° VENTA', 'CONCEPTO', 'MONTO BS.', 'ABONADO BS.', 'SALDO BS.')],
    ]
    altos = [21, 16]
    for l in d['lineas']:
        filas.append([
            _p(l['fecha'], EST_CENTRO),
            _p(f"#{l['venta_id']}", EST_CENTRO),
            _concepto(l),
            _p(fmt_bs(l['monto_bs']), EST_R),
            _p(fmt_bs(l['abonado_bs']) if l['abonado_bs'] else '—', EST_R),
            _p(fmt_bs(l['saldo_bs']), EST_R),
        ])
        altos.append(None)

    base = len(filas)
    filas.append([_p('TOTAL CARGOS', EST_ETQ), '', '', _p(fmt_bs(d['total_cargos_bs']), EST_R), '', ''])
    filas.append([_p('(-) ABONOS APLICADOS', EST_ETQ), '', '', '', _p(fmt_bs(d['total_abonos_bs']), EST_R), ''])
    filas.append([
        _p('TOTAL A PAGAR', EST_TOTAL_ROT), '', '', '', '',
        [_p(f"Bs. {fmt_bs(d['total_bs'])}", EST_TOTAL_ROT), _p(f"Ref. $ {d['total_usd']:.2f}", EST_TOTAL_USD)],
    ])
    altos += [16, 16, None]
    extra = [
        ('SPAN', (0, 0), (-1, 0)),
        ('SPAN', (0, base), (2, base)),
        ('SPAN', (0, base + 1), (2, base + 1)),
        ('SPAN', (0, base + 2), (4, base + 2)),
        ('VALIGN', (0, 2), (-1, -1), 'TOP'),
        ('VALIGN', (0, base + 2), (-1, base + 2), 'MIDDLE'),
        ('LINEABOVE', (0, base + 2), (-1, base + 2), 1.2, NAVY),
        ('TOPPADDING', (0, base + 2), (-1, base + 2), 6),
        ('BOTTOMPADDING', (0, base + 2), (-1, base + 2), 6),
    ]
    return Table(filas, colWidths=anchos, rowHeights=altos, repeatRows=2, style=_estilo_tabla(extra))


def _tabla_pago(pag, d):
    if not d['metodos_pago']:
        return None
    filas = [[_p('DATOS PARA REALIZAR EL PAGO', EST_SECCION)]]
    for m in d['metodos_pago']:
        filas.append([_p(m['titulo'], EST_LB)])
        filas.append([_p(m['detalle'], EST_PAGO)])
    return Table(filas, colWidths=[pag.ancho], rowHeights=[21] + [None] * (len(filas) - 1),
                 style=_estilo_tabla())


def _tabla_nota(pag, d):
    texto = (f"Los montos en bolívares fueron calculados a la tasa de Bs. {fmt_bs(d['tasa'])} por USD vigente al "
             f"{d['emision']:%d/%m/%Y}. La referencia en USD es informativa: el saldo se mantiene en dólares y el "
             "monto en bolívares puede variar si la tasa cambia antes del pago.")
    return Table([[_p(texto, EST_NOTA)]], colWidths=[pag.ancho], style=TableStyle([
        ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))


def generar_pdf_plantilla_cobro(datos):
    """PDF A4 de la plantilla de cobro. Devuelve un BytesIO al inicio."""
    membrete = membrete_colegio()
    buffer = BytesIO()
    cv = canvas.Canvas(buffer, pagesize=A4)
    cv.setTitle(f"Plantilla de cobro - {datos['titular']['nombre']}")
    pag = _Pagina(cv)
    pag.limite = 100  # deja libre la franja del pie

    _dibujar_encabezado(pag, membrete)
    _dibujar_titulo(pag, datos)
    pag.tabla(_tabla_titular(pag, datos))
    pag.tabla(_tabla_cargos(pag, datos))
    tabla_pago = _tabla_pago(pag, datos)
    if tabla_pago is not None:
        pag.tabla(tabla_pago)
    pag.tabla(_tabla_nota(pag, datos), separacion=0)
    _dibujar_pie(pag, membrete)

    cv.showPage()
    cv.save()
    buffer.seek(0)
    return buffer


def nombre_archivo(datos):
    base = re.sub(r'[^A-Za-z0-9]+', '_', datos['titular']['nombre']).strip('_') or 'cliente'
    return f"Plantilla_Cobro_{base}.pdf"
