import logging
import requests
from decimal import Decimal, InvalidOperation
from io import BytesIO
from django.utils import timezone
from django.conf import settings
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor

from .models import TasaCambio, ParametroGlobal

logger = logging.getLogger(__name__)

_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json',
}


# ──────────────────────────────────────────────────────────────────────────────
# LÓGICA DE MONITOREO Y TOLERANCIA A FALLOS (TASA BCV)
# ──────────────────────────────────────────────────────────────────────────────

def _parse_decimal(valor) -> Decimal:
    """Convierte cualquier representación numérica a Decimal, normalizando comas."""
    return Decimal(str(valor).replace(',', '.')).quantize(Decimal('0.0001'))


def _obtener_tasa_por_scraping_bcv() -> Decimal:
    """
    API 1: ve.dolarapi.com — JSON público.
    Endpoint: GET /v1/dolares → busca fuente "oficial" (BCV).
    """
    r = requests.get(
        'https://ve.dolarapi.com/v1/dolares',
        headers=_HEADERS,
        timeout=10,
    )
    r.raise_for_status()
    data = r.json()

    for item in data:
        fuente = str(item.get('fuente', '')).lower()
        if fuente == 'oficial':
            price = item.get('promedio') or item.get('venta') or item.get('compra')
            if price:
                tasa = _parse_decimal(price)
                if tasa > 0:
                    return tasa

    raise ValueError(f"ve.dolarapi.com no devolvió tasa oficial en: {data}")


def _obtener_tasa_por_pydolar() -> Decimal:
    """
    API 2: exchangerate.host como fallback real con endpoint distinto.
    """
    r = requests.get(
        'https://api.exchangerate.host/latest?base=USD&symbols=VES',
        headers=_HEADERS,
        timeout=10,
    )
    r.raise_for_status()
    data = r.json()

    ves = data.get('rates', {}).get('VES')
    if ves:
        tasa = _parse_decimal(ves)
        if tasa > 0:
            return tasa

    raise ValueError(f"exchangerate.host no devolvió tasa VES: {data}")


def _obtener_tasa_de_emergencia_db() -> Decimal:
    """
    Fallback final: tasa manual configurada por el administrador o último
    registro histórico en BD. No crea registros nuevos.
    """
    parametro, _ = ParametroGlobal.objects.get_or_create(
        clave="TASA_BCV_MANUAL",
        defaults={"valor": "0.0000", "descripcion": "Tasa manual de contingencia"}
    )
    if parametro.valor:
        try:
            manual = Decimal(parametro.valor)
            if manual > 0:
                logger.warning(f"Usando tasa manual de contingencia: {manual}")
                return manual.quantize(Decimal('0.0001'))
        except InvalidOperation:
            pass

    ultima_tasa = TasaCambio.objects.order_by('-id').first()
    if ultima_tasa:
        logger.warning(f"Usando última tasa histórica en BD: {ultima_tasa.valor_bs}")
        return ultima_tasa.valor_bs

    raise LookupError("Sin registros en BD. Imposible determinar tasa de cambio.")


def sincronizar_tasa_bcv() -> Decimal:
    """Controlador con cadena de fallback: API1 → API2 → BD."""
    for nombre, fn in [
        ('pydolarve.org', _obtener_tasa_por_scraping_bcv),
        ('ve.dolarapi.com', _obtener_tasa_por_pydolar),
    ]:
        try:
            tasa = fn()
            TasaCambio.objects.create(valor_bs=tasa)
            logger.info(f"Tasa BCV obtenida desde {nombre}: {tasa}")
            return tasa
        except Exception as e:
            logger.warning(f"{nombre} falló: {e}")

    try:
        return _obtener_tasa_de_emergencia_db()
    except Exception as e:
        logger.critical(f"Todas las fuentes fallaron: {e}")
        return None


# ──────────────────────────────────────────────────────────────────────────────
# GENERACIÓN DE DOCUMENTOS PDF (REPORTLAB)
# ──────────────────────────────────────────────────────────────────────────────

def _get_config_colegio():
    """Retorna los datos del colegio desde ConfiguracionSistema o valores por defecto."""
    from secretaria.models import ConfiguracionSistema
    cfg = ConfiguracionSistema.objects.order_by('id').first()
    if cfg:
        nombre = cfg.nombre_colegio or "UNIDAD EDUCATIVA"
        rif = f"RIF: {cfg.rif}" if cfg.rif else ""
        partes_dir = []
        if cfg.direccion_colegio:
            partes_dir.append(cfg.direccion_colegio)
        if cfg.municipio and cfg.estado_colegio:
            partes_dir.append(f"{cfg.municipio}, Edo. {cfg.estado_colegio}, Venezuela.")
        elif cfg.municipio or cfg.estado_colegio:
            partes_dir.append(f"{cfg.municipio or cfg.estado_colegio}, Venezuela.")
        direccion = " | ".join(partes_dir) if partes_dir else ""
        return nombre, rif, direccion
    return "UNIDAD EDUCATIVA", "", ""


def generar_pdf_recibo(pagos):
    """
    Genera comprobante de pago en PDF.
    Acepta lista de pagos (operación multipago) o un único pago.
    Monto principal en Bolívares; USD es referencial.
    """
    if not isinstance(pagos, (list, tuple)) and hasattr(pagos, 'alumno'):
        pagos = [pagos]
    pagos = list(pagos)
    pago = pagos[0]

    nombre_colegio, rif_colegio, dir_colegio = _get_config_colegio()

    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter

    octopus_blue = HexColor("#1e293b")
    octopus_gold = HexColor("#f59e0b")
    ash = HexColor("#64748b")
    border_light = HexColor("#e2e8f0")
    row_alt = HexColor("#f8fafc")

    # ── Cabecera ──────────────────────────────────────────────────────────────
    c.setFillColor(octopus_blue)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(0.8 * inch, height - 1 * inch, nombre_colegio.upper())

    c.setFillColor(ash)
    c.setFont("Helvetica", 9)
    linea_y = height - 1.2 * inch
    if rif_colegio:
        c.drawString(0.8 * inch, linea_y, rif_colegio)
        linea_y -= 0.15 * inch
    if dir_colegio:
        c.drawString(0.8 * inch, linea_y, dir_colegio)

    c.setFillColor(octopus_blue)
    c.setFont("Helvetica-Bold", 12)
    c.drawRightString(width - 0.8 * inch, height - 1 * inch, "RECIBO DE PAGO")
    c.setFont("Helvetica-Bold", 14)
    factura_label = pago.factura_id if pago.factura_id else f"Nº {pago.id:06d}"
    c.drawRightString(width - 0.8 * inch, height - 1.25 * inch, factura_label)

    c.setStrokeColor(octopus_gold)
    c.setLineWidth(2)
    c.line(0.8 * inch, height - 1.6 * inch, width - 0.8 * inch, height - 1.6 * inch)

    # ── Datos del alumno / representante ──────────────────────────────────────
    c.setFillColor(octopus_blue)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(0.8 * inch, height - 2.0 * inch, "DATOS DEL ALUMNO / REPRESENTANTE")

    c.setFont("Helvetica", 10)
    c.setFillColor(octopus_blue)
    c.drawString(0.8 * inch, height - 2.25 * inch,
                 f"Estudiante: {pago.alumno.nombre} {pago.alumno.apellido}")
    c.drawString(0.8 * inch, height - 2.45 * inch,
                 f"Cédula Escolar: {getattr(pago.alumno, 'cedula_escolar', 'Sin Cédula')}")
    c.drawString(0.8 * inch, height - 2.65 * inch,
                 f"Nivel: {getattr(pago.alumno, 'grado_seccion', 'N/D')}")
    rep_nombre = (pago.representante_nombre or
                  f"{getattr(pago.alumno.representante, 'nombre', '')} "
                  f"{getattr(pago.alumno.representante, 'apellido', '')}").strip()
    rep_doc = (pago.representante_documento or
               getattr(pago.alumno.representante, 'cedula', 'N/D'))
    c.drawString(0.8 * inch, height - 2.85 * inch, f"Representante: {rep_nombre}")
    c.drawString(0.8 * inch, height - 3.05 * inch, f"Documento Representante: {rep_doc}")

    c.drawRightString(width - 0.8 * inch, height - 2.25 * inch,
                      f"Fecha: {pago.fecha_pago.strftime('%d/%m/%Y')}")
    c.drawRightString(width - 0.8 * inch, height - 2.45 * inch,
                      f"Hora: {pago.fecha_pago.strftime('%H:%M')}")
    c.drawRightString(width - 0.8 * inch, height - 2.65 * inch,
                      f"Concepto: {pago.get_concepto_display()}")

    # ── Encabezado tabla de desglose ──────────────────────────────────────────
    tabla_top = height - 3.45 * inch
    col_metodo = 0.8 * inch
    col_ref    = 3.2 * inch
    col_ves    = width - 1.8 * inch
    col_usd    = width - 0.8 * inch

    c.setFillColor(octopus_blue)
    c.rect(col_metodo, tabla_top, width - 1.6 * inch, 0.28 * inch, fill=1, stroke=0)

    c.setFillColor(HexColor("#ffffff"))
    c.setFont("Helvetica-Bold", 9)
    c.drawString(col_metodo + 0.1 * inch, tabla_top + 0.08 * inch, "MÉTODO DE PAGO")
    c.drawString(col_ref + 0.05 * inch,   tabla_top + 0.08 * inch, "REFERENCIA")
    c.drawRightString(col_ves,             tabla_top + 0.08 * inch, "MONTO Bs.")
    c.drawRightString(col_usd,             tabla_top + 0.08 * inch, "(Ref. USD)")

    # ── Filas de desglose ─────────────────────────────────────────────────────
    fila_h = 0.32 * inch
    y = tabla_top - fila_h
    total_ves = Decimal('0.00')
    total_usd = Decimal('0.00')

    for idx, p in enumerate(pagos):
        if idx % 2 == 0:
            c.setFillColor(row_alt)
            c.rect(col_metodo, y, width - 1.6 * inch, fila_h, fill=1, stroke=0)

        c.setFillColor(octopus_blue)
        c.setFont("Helvetica", 9)
        if p.metodo_pago == 'efectivo':
            metodo_txt = "Efectivo 2"
        elif p.metodo_pago == 'zelle':
            metodo_txt = "Transferencia 2"
        else:
            metodo_txt = p.get_metodo_pago_display()
        if p.banco_receptor:
            metodo_txt += f" – {p.banco_receptor.nombre}"
        c.drawString(col_metodo + 0.1 * inch, y + 0.11 * inch, metodo_txt)
        c.drawString(col_ref + 0.05 * inch,   y + 0.11 * inch, p.referencia or "N/A")

        c.setFont("Helvetica-Bold", 9)
        c.drawRightString(col_ves, y + 0.11 * inch, f"Bs. {p.monto_ves:,.2f}")

        c.setFont("Helvetica", 8)
        c.setFillColor(ash)
        c.drawRightString(col_usd, y + 0.11 * inch, f"$ {p.monto_usd:,.2f}")

        c.setStrokeColor(border_light)
        c.setLineWidth(0.5)
        c.line(col_metodo, y, col_usd, y)

        total_ves += Decimal(str(p.monto_ves))
        total_usd += Decimal(str(p.monto_usd))
        y -= fila_h

    # ── Fila total ────────────────────────────────────────────────────────────
    c.setStrokeColor(octopus_gold)
    c.setLineWidth(1.5)
    c.line(col_metodo, y + fila_h, col_usd, y + fila_h)

    c.setFillColor(HexColor("#f0f9ff"))
    c.rect(col_metodo, y, width - 1.6 * inch, fila_h, fill=1, stroke=0)

    c.setFillColor(octopus_blue)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(col_metodo + 0.1 * inch, y + 0.09 * inch, "TOTAL A PAGAR (BOLÍVARES):")
    c.drawRightString(col_ves, y + 0.09 * inch, f"Bs. {total_ves:,.2f}")

    c.setFont("Helvetica", 9)
    c.setFillColor(ash)
    c.drawRightString(col_usd, y + 0.09 * inch, f"$ {total_usd:,.2f}")

    # ── Vuelto (si aplica) ────────────────────────────────────────────────────
    vuelto_usd = pago.vuelto_usd or Decimal('0.00')
    vuelto_ves = pago.vuelto_ves or Decimal('0.00')
    if vuelto_usd > 0 or vuelto_ves > 0:
        vuelta_y = y - 0.15 * inch
        c.setFillColor(HexColor("#fef9c3"))
        c.rect(col_metodo, vuelta_y - 0.05 * inch, width - 1.6 * inch, 0.38 * inch, fill=1, stroke=0)
        c.setStrokeColor(HexColor("#fbbf24"))
        c.setLineWidth(1)
        c.rect(col_metodo, vuelta_y - 0.05 * inch, width - 1.6 * inch, 0.38 * inch, fill=0, stroke=1)

        c.setFillColor(HexColor("#92400e"))
        c.setFont("Helvetica-Bold", 9)
        c.drawString(col_metodo + 0.1 * inch, vuelta_y + 0.09 * inch, "VUELTO A ENTREGAR:")
        c.setFont("Helvetica-Bold", 10)
        c.drawRightString(col_ves, vuelta_y + 0.09 * inch, f"Bs. {vuelto_ves:,.2f}")
        c.setFont("Helvetica", 8)
        c.setFillColor(HexColor("#b45309"))
        c.drawRightString(col_usd, vuelta_y + 0.09 * inch, f"$ {vuelto_usd:,.2f}")
        y = vuelta_y - 0.15 * inch
    else:
        y = y - 0.10 * inch

    # ── Nota de tasa ──────────────────────────────────────────────────────────
    nota_y = y - 0.25 * inch
    c.setFont("Helvetica-Oblique", 8)
    c.setFillColor(ash)
    tasa_label = f"Bs. {pago.tasa_aplicada}" if pago.tasa_aplicada else "N/D"
    c.drawString(col_metodo, nota_y,
                 f"* Tasa BCV aplicada: {tasa_label}  –  El monto en USD es referencial.")

    # ── Firmas ────────────────────────────────────────────────────────────────
    c.setStrokeColor(border_light)
    c.setLineWidth(1)
    c.line(0.8 * inch, 2.8 * inch, width - 0.8 * inch, 2.8 * inch)

    c.setDash(1, 2)
    c.line(1.5 * inch, 2.4 * inch, 3.5 * inch, 2.4 * inch)
    c.line(width - 1.5 * inch, 2.4 * inch, width - 3.5 * inch, 2.4 * inch)
    c.setDash(1, 0)

    c.setFont("Helvetica", 8)
    c.setFillColor(ash)
    c.drawCentredString(2.5 * inch,         2.25 * inch, "Firma del Representante")
    c.drawCentredString(width - 2.5 * inch, 2.25 * inch, "Sello y Firma Autorizada")

    # ── Pie de página ─────────────────────────────────────────────────────────
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(octopus_blue)
    c.drawCentredString(
        width / 2, 1.2 * inch,
        "ESTE DOCUMENTO NO TIENE VALIDEZ FISCAL SI NO POSEE EL SELLO HÚMEDO DE LA INSTITUCIÓN"
    )

    c.setFont("Helvetica", 7)
    c.setFillColor(HexColor("#94a3b8"))
    factura_audit = pago.factura_id or f"{pago.id:06d}"
    c.drawCentredString(
        width / 2, 1.0 * inch,
        f"Cajero: {pago.usuario_receptor.username.upper()} | "
        f"Factura: {factura_audit} | ID Auditoría: {pago.id}-{int(pago.fecha_pago.timestamp())}"
    )

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer


def generar_pdf_inscripcion(inscripcion):
    """
    Genera comprobante de inscripción en PDF con ReportLab.
    """
    nombre_colegio, rif_colegio, dir_colegio = _get_config_colegio()

    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter

    azul = HexColor("#0fa3b1")
    jet = HexColor("#2b303a")
    ash = HexColor("#9a8c98")

    c.setFillColor(jet)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(0.8 * inch, height - 1.0 * inch, nombre_colegio.upper())

    c.setFillColor(ash)
    c.setFont("Helvetica", 9)
    linea_y = height - 1.2 * inch
    if rif_colegio:
        c.drawString(0.8 * inch, linea_y, rif_colegio)
        linea_y -= 0.15 * inch
    if dir_colegio:
        c.drawString(0.8 * inch, linea_y, dir_colegio)

    c.setFillColor(jet)
    c.setFont("Helvetica-Bold", 13)
    c.drawRightString(width - 0.8 * inch, height - 1.0 * inch, "COMPROBANTE DE INSCRIPCIÓN")
    c.setFont("Helvetica-Bold", 15)
    c.drawRightString(width - 0.8 * inch, height - 1.25 * inch, f"Nº {inscripcion.id:06d}")

    c.setStrokeColor(azul)
    c.setLineWidth(2)
    c.line(0.8 * inch, height - 1.6 * inch, width - 0.8 * inch, height - 1.6 * inch)

    alumno = inscripcion.alumno
    representante = alumno.representante

    c.setFillColor(jet)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(0.8 * inch, height - 2.0 * inch, "DATOS DEL ESTUDIANTE")

    c.setFont("Helvetica", 10)
    c.drawString(0.8 * inch, height - 2.25 * inch, f"Nombre:          {alumno.nombre} {alumno.apellido}")
    c.drawString(0.8 * inch, height - 2.45 * inch, f"Cédula Escolar:  {alumno.cedula_escolar or 'Temporal'}")
    c.drawString(0.8 * inch, height - 2.65 * inch, f"Grado/Sección:    {inscripcion.grado_seccion}")
    c.drawString(0.8 * inch, height - 2.85 * inch, f"Período Escolar: {inscripcion.periodo_escolar}")
    c.drawString(0.8 * inch, height - 3.05 * inch, f"Tipo de Ingreso: {inscripcion.get_tipo_ingreso_display()}")

    c.drawRightString(width - 0.8 * inch, height - 2.25 * inch, f"Fecha: {inscripcion.fecha_inscripcion.strftime('%d/%m/%Y')}")
    c.drawRightString(width - 0.8 * inch, height - 2.45 * inch, f"Hora:  {inscripcion.fecha_inscripcion.strftime('%H:%M')}")

    c.setFont("Helvetica-Bold", 10)
    c.drawString(0.8 * inch, height - 3.4 * inch, "DATOS DEL REPRESENTANTE")

    c.setFont("Helvetica", 10)
    c.drawString(0.8 * inch, height - 3.65 * inch, f"Representante: {representante.nombre} {representante.apellido}")
    c.drawString(0.8 * inch, height - 3.85 * inch, f"Cédula:    {representante.cedula}")
    c.drawString(0.8 * inch, height - 4.05 * inch, f"Teléfono:  {representante.telefono}")
    c.drawString(0.8 * inch, height - 4.25 * inch, f"Correo:    {representante.correo}")

    c.saveState()
    c.setFillColor(HexColor("#e8f8fa"))
    c.setFont("Helvetica-Bold", 52)
    c.translate(width / 2, height / 2)
    c.rotate(35)
    c.drawCentredString(0, 0, "INSCRIPCIÓN VÁLIDA")
    c.restoreState()

    c.setStrokeColor(HexColor("#e2e5ea"))
    c.setLineWidth(1)
    c.line(0.8 * inch, 3.0 * inch, width - 0.8 * inch, 3.0 * inch)

    c.setDash(1, 2)
    c.line(1.5 * inch, 2.5 * inch, 3.5 * inch, 2.5 * inch)
    c.line(width - 1.5 * inch, 2.5 * inch, width - 3.5 * inch, 2.5 * inch)
    c.setDash(1, 0)

    c.setFont("Helvetica", 8)
    c.drawCentredString(2.5 * inch, 2.3 * inch, "Firma del Representante")
    c.drawCentredString(width - 2.5 * inch, 2.3 * inch, "Sello y Firma Autorizada")

    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(jet)
    c.drawCentredString(width / 2, 1.2 * inch, "ESTE DOCUMENTO ES VÁLIDO COMO COMPROBANTE DE INSCRIPCIÓN PARA EL PERÍODO INDICADO")
    
    c.setFont("Helvetica", 7)
    c.setFillColor(ash)
    c.drawCentredString(width / 2, 1.0 * inch, f"Registrado por: {inscripcion.usuario_registro.username.upper()} | ID Inscripción: {inscripcion.id}")

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer