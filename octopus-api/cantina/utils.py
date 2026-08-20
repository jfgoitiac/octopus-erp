"""
Generación de PDFs de cantina (ticket de venta), con reportlab — mismo
patrón que `cobranza/utils.py::generar_pdf_recibo` (canvas + pagesize
letter, devuelve un BytesIO), no jsPDF (eso es solo frontend). Ver §5.6/§8
FASE 4 de cantina.md.
"""
import logging
from decimal import Decimal
from io import BytesIO

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas

logger = logging.getLogger(__name__)


def _get_config_colegio():
    """Mismo criterio que `cobranza.utils._get_config_colegio` — no se
    importa esa función privada de otra app, se reutiliza el mismo patrón
    de lectura de `ConfiguracionSistema` para no crear un acoplamiento
    cruzado innecesario entre `cantina` y `cobranza`."""
    from secretaria.models import ConfiguracionSistema
    cfg = ConfiguracionSistema.objects.order_by('id').first()
    if cfg:
        nombre = cfg.nombre_colegio or 'UNIDAD EDUCATIVA'
        rif = f'RIF: {cfg.rif}' if cfg.rif else ''
        return nombre, rif
    return 'UNIDAD EDUCATIVA', ''


def generar_pdf_ticket(venta):
    """
    Genera el ticket de una `VentaCantina` en PDF: productos, cantidades,
    precios, total en USD y equivalente en VES (con `tasa_aplicada`
    congelada al momento de la venta), método de pago, cajero y fecha.

    Si `venta.estado == 'anulada'`, el PDF muestra una marca de agua/texto
    destacado "ANULADA" — se necesita desde ya (no solo en la Fase 7 de
    reimpresión) porque construir el PDF sin este caso ahora significaría
    reescribirlo después (ver instrucciones de la tarea).

    Sirve tanto para el ticket recién cobrado como para reimpresiones
    futuras (Fase 7): siempre se regenera desde `VentaCantina`/
    `DetalleVentaCantina`, nunca se guarda un PDF estático, así que
    siempre refleja el estado real (anulada o no) de la venta.
    """
    nombre_colegio, rif_colegio = _get_config_colegio()

    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    margin = 0.8 * inch

    octopus_blue = HexColor('#1e293b')
    octopus_gold = HexColor('#f59e0b')
    ash = HexColor('#64748b')
    border_light = HexColor('#e2e8f0')
    row_alt = HexColor('#f8fafc')
    red = HexColor('#dc2626')

    # ── Cabecera ──────────────────────────────────────────────────────
    c.setFillColor(octopus_blue)
    c.setFont('Helvetica-Bold', 16)
    c.drawString(margin, height - 1 * inch, nombre_colegio.upper())
    c.setFillColor(ash)
    c.setFont('Helvetica', 9)
    if rif_colegio:
        c.drawString(margin, height - 1.2 * inch, rif_colegio)

    c.setFillColor(octopus_blue)
    c.setFont('Helvetica-Bold', 12)
    c.drawRightString(width - margin, height - 1 * inch, 'TICKET DE VENTA — CANTINA')
    c.setFont('Helvetica-Bold', 14)
    c.drawRightString(width - margin, height - 1.25 * inch, f'Nº {venta.id:06d}')

    c.setStrokeColor(octopus_gold)
    c.setLineWidth(2)
    c.line(margin, height - 1.6 * inch, width - margin, height - 1.6 * inch)

    # ── Datos de la venta ─────────────────────────────────────────────
    c.setFillColor(octopus_blue)
    c.setFont('Helvetica', 10)
    y = height - 2.0 * inch
    if venta.alumno_id:
        c.drawString(margin, y, f'Estudiante: {venta.alumno.nombre} {venta.alumno.apellido}')
        y -= 0.22 * inch
    if venta.tarjeta_id:
        c.drawString(margin, y, f'Tarjeta: {venta.tarjeta.serial}')
        y -= 0.22 * inch

    metodo_labels = dict(type(venta).METODOS_PAGO)
    c.drawString(margin, y, f'Método de pago: {metodo_labels.get(venta.metodo_pago, venta.metodo_pago)}')
    y -= 0.22 * inch

    cajero_nombre = venta.cajero.get_full_name() or venta.cajero.username if venta.cajero_id else 'N/D'
    c.drawString(margin, y, f'Cajero: {cajero_nombre}')

    c.setFont('Helvetica', 9)
    c.drawRightString(width - margin, height - 2.0 * inch, f"Fecha: {venta.creado_en.strftime('%d/%m/%Y')}")
    c.drawRightString(width - margin, height - 2.22 * inch, f"Hora: {venta.creado_en.strftime('%H:%M')}")

    # ── Tabla de productos ────────────────────────────────────────────
    tabla_top = height - 2.9 * inch
    col_prod = margin
    col_cant = width - 2.9 * inch
    col_precio = width - 2.0 * inch
    col_subtotal = width - margin

    c.setFillColor(octopus_blue)
    c.rect(col_prod, tabla_top, width - 2 * margin, 0.28 * inch, fill=1, stroke=0)
    c.setFillColor(HexColor('#ffffff'))
    c.setFont('Helvetica-Bold', 9)
    c.drawString(col_prod + 0.1 * inch, tabla_top + 0.08 * inch, 'PRODUCTO')
    c.drawRightString(col_cant, tabla_top + 0.08 * inch, 'CANT.')
    c.drawRightString(col_precio, tabla_top + 0.08 * inch, 'P. UNIT.')
    c.drawRightString(col_subtotal, tabla_top + 0.08 * inch, 'SUBTOTAL')

    fila_h = 0.3 * inch
    fila_y = tabla_top - fila_h
    detalles = list(venta.detalles.select_related('producto').all())
    for idx, detalle in enumerate(detalles):
        if idx % 2 == 0:
            c.setFillColor(row_alt)
            c.rect(col_prod, fila_y, width - 2 * margin, fila_h, fill=1, stroke=0)

        c.setFillColor(octopus_blue)
        c.setFont('Helvetica', 9)
        nombre_producto = detalle.producto.nombre if detalle.producto_id else '(producto eliminado)'
        c.drawString(col_prod + 0.1 * inch, fila_y + 0.1 * inch, nombre_producto[:45])
        c.drawRightString(col_cant, fila_y + 0.1 * inch, str(detalle.cantidad))
        c.drawRightString(col_precio, fila_y + 0.1 * inch, f'$ {detalle.precio_unitario:,.2f}')
        c.setFont('Helvetica-Bold', 9)
        c.drawRightString(col_subtotal, fila_y + 0.1 * inch, f'$ {detalle.subtotal:,.2f}')

        c.setStrokeColor(border_light)
        c.setLineWidth(0.5)
        c.line(col_prod, fila_y, col_subtotal, fila_y)
        fila_y -= fila_h

    # ── Totales ───────────────────────────────────────────────────────
    c.setStrokeColor(octopus_gold)
    c.setLineWidth(1.5)
    c.line(col_prod, fila_y + fila_h, col_subtotal, fila_y + fila_h)

    c.setFillColor(HexColor('#f0f9ff'))
    c.rect(col_prod, fila_y - fila_h, width - 2 * margin, fila_h * 2, fill=1, stroke=0)

    c.setFillColor(octopus_blue)
    c.setFont('Helvetica-Bold', 11)
    c.drawString(col_prod + 0.1 * inch, fila_y + 0.09 * inch, 'TOTAL (USD):')
    c.drawRightString(col_subtotal, fila_y + 0.09 * inch, f'$ {venta.total_usd:,.2f}')

    c.setFont('Helvetica', 9)
    c.setFillColor(ash)
    c.drawString(col_prod + 0.1 * inch, fila_y - fila_h + 0.09 * inch, f'Equivalente (Bs. — tasa {venta.tasa_aplicada}):')
    c.drawRightString(col_subtotal, fila_y - fila_h + 0.09 * inch, f'Bs. {venta.total_ves:,.2f}')

    y_saldo = fila_y - fila_h - 0.3 * inch
    if venta.metodo_pago == 'tarjeta_prepago' and venta.saldo_tarjeta_despues is not None:
        c.setFillColor(octopus_blue)
        c.setFont('Helvetica', 9)
        c.drawString(margin, y_saldo, f'Saldo de tarjeta después de la compra: $ {venta.saldo_tarjeta_despues:,.2f}')
        y_saldo -= 0.25 * inch

    # ── Nota de tasa ──────────────────────────────────────────────────
    c.setFont('Helvetica-Oblique', 8)
    c.setFillColor(ash)
    c.drawString(margin, y_saldo, f'* Tasa BCV aplicada: Bs. {venta.tasa_aplicada} — El monto en Bs. es referencial.')

    # ── Marca de "ANULADA" (§5.6 de cantina.md) ──────────────────────
    if venta.estado == 'anulada':
        c.saveState()
        c.setFillColor(red)
        c.setFillAlpha(0.35)
        c.translate(width / 2, height / 2)
        c.rotate(45)
        c.setFont('Helvetica-Bold', 90)
        c.drawCentredString(0, 0, 'ANULADA')
        c.restoreState()

        c.setFillColor(red)
        c.setFont('Helvetica-Bold', 11)
        c.drawCentredString(width / 2, 0.9 * inch,
                             f"VENTA ANULADA el {venta.anulada_en.strftime('%d/%m/%Y %H:%M') if venta.anulada_en else 'N/D'}"
                             f" por {venta.anulada_por.username if venta.anulada_por_id else 'N/D'}")

    # ── Pie de página ─────────────────────────────────────────────────
    c.setFont('Helvetica', 7)
    c.setFillColor(HexColor('#94a3b8'))
    c.drawCentredString(width / 2, 0.6 * inch, f'Ticket generado automáticamente — Venta #{venta.id}')

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer
