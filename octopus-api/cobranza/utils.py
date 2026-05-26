import logging
import urllib3
import requests
from bs4 import BeautifulSoup
from decimal import Decimal, InvalidOperation
from io import BytesIO
from django.utils import timezone
from django.conf import settings
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor

# Definición global de variables para evitar advertencias de "no definido" (Import Error)
BCV = None
Monitor = None
PYDOLAR_DISPONIBLE = False

try:
    # Intentamos la importación opcional
    from pyDolarVenezuela.pages import BCV
    from pyDolarVenezuela import Monitor
    PYDOLAR_DISPONIBLE = True
except ImportError:
    pass

from .models import TasaCambio, ParametroGlobal

# Configuración del Logger de Django
logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────────────
# LÓGICA DE MONITOREO Y TOLERANCIA A FALLOS (TASA BCV)
# ──────────────────────────────────────────────────────────────────────────────

def _obtener_tasa_por_scraping_bcv() -> Decimal:
    """
    Intento Primario: Raspado directo del HTML del portal del BCV.
    """
    url = "https://www.bcv.org.ve/"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                      '(KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    ssl_verify = not settings.DEBUG
    if not ssl_verify:
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    response = requests.get(url, headers=headers, verify=ssl_verify, timeout=10)
    response.raise_for_status()
    
    soup = BeautifulSoup(response.content, 'html.parser')
    dolar_section = soup.find(id="dolar")
    
    if not dolar_section:
        usd_tag = soup.find(string=lambda t: t and "USD" in t)
        if usd_tag:
            dolar_section = usd_tag.find_parent('div')

    if not dolar_section:
        raise ValueError("Estructura HTML modificada: No se localizó la sección USD.")

    strong_tag = dolar_section.find('strong')
    if not strong_tag:
        raise ValueError("Estructura HTML modificada: No se encontró la etiqueta <strong>.")

    tasa_val = strong_tag.text.strip()
    return Decimal(tasa_val.replace(',', '.')).quantize(Decimal('0.0001'))


def _obtener_tasa_por_pydolar() -> Decimal:
    """
    Intento Secundario (Fallback 1): Consumo de librería/API pyDolarVenezuela.
    """
    if not PYDOLAR_DISPONIBLE:
        raise ImportError("La librería 'pyDolarVenezuela' no está instalada en el entorno.")
    
    # Instanciamos el monitor apuntando específicamente al BCV
    monitor = Monitor(BCV)
    tasa_datos = monitor.get_value(monitor_code='usd')
    
    # Dependiendo de la versión de pyDolar, puede retornar un float, string o un dict
    if isinstance(tasa_datos, dict):
        tasa_val = str(tasa_datos.get('price', ''))
    else:
        tasa_val = str(tasa_datos)

    if not tasa_val:
        raise ValueError("pyDolarVenezuela retornó un valor vacío.")

    return Decimal(tasa_val.replace(',', '.')).quantize(Decimal('0.0001'))


def _obtener_tasa_de_emergencia_db() -> Decimal:
    """
    Intento Terciario (Fallback 2): Obtiene el último parámetro global 
    forzado o la última tasa registrada exitosamente en la BD.
    """
    # 1. Buscamos primero si existe una tasa configurada manualmente por el administrador
    parametro, created = ParametroGlobal.objects.get_or_create(
        clave="TASA_BCV_MANUAL",
        defaults={"valor": "0.0000", "descripcion": "Tasa manual de contingencia"}
    )
    
    if parametro.valor and Decimal(parametro.valor) > 0:
        logger.warning(f"Utilizando tasa de contingencia MANUAL configurada en ParametroGlobal: {parametro.valor}")
        return Decimal(parametro.valor).quantize(Decimal('0.0001'))

    # 2. Si no hay tasa manual, degradamos al último registro histórico exitoso
    ultima_tasa = TasaCambio.objects.order_by('-fecha').first()
    if ultima_tasa:
        logger.warning(f"Utilizando última tasa histórica exitosa de la base de datos: {ultima_tasa.valor_bs}")
        return ultima_tasa.valor_bs

    raise LookupError("Sin registros en base de datos. Imposible determinar tasa de cambio.")


def sincronizar_tasa_bcv() -> Decimal:
    """
    Función principal controladora que implementa el patrón de tolerancia a fallos
    para la obtención de la tasa oficial en Bolívares (VES).
    """
    # --- Intento 1: Scraping Tradicional ---
    try:
        tasa_decimal = _obtener_tasa_por_scraping_bcv()
        TasaCambio.objects.create(valor_bs=tasa_decimal)
        logger.info(f"Sincronización exitosa vía Scraping BCV: Bs. {tasa_decimal}")
        return tasa_decimal
    except Exception as e:
        logger.warning(f"Fallo el intento primario (Scraping BCV). Motivo: {e}. Iniciando Fallback 1...")

    # --- Intento 2: Fallback con pyDolarVenezuela ---
    try:
        tasa_decimal = _obtener_tasa_por_pydolar()
        TasaCambio.objects.create(valor_bs=tasa_decimal)
        logger.info(f"Sincronización exitosa vía pyDolarVenezuela: Bs. {tasa_decimal}")
        return tasa_decimal
    except Exception as e:
        logger.error(f"Fallo el intento secundario (pyDolarVenezuela). Motivo: {e}. Iniciando Fallback de Emergencia...")

    # --- Intento 3: Base de Datos (Último recurso) ---
    try:
        tasa_contingencia = _obtener_tasa_de_emergencia_db()
        # NOTA: No creamos un nuevo registro en TasaCambio para evitar bucles de logs o falsos positivos.
        return tasa_contingencia
    except Exception as e:
        logger.critical(f"CRITICAL: El sistema no pudo determinar ninguna tasa de cambio válida. {e}")
        return None


# ──────────────────────────────────────────────────────────────────────────────
# GENERACIÓN DE DOCUMENTOS PDF (REPORTLAB)
# ──────────────────────────────────────────────────────────────────────────────

def generar_pdf_recibo(pago):
    """
    Genera un comprobante de pago profesional en formato PDF.
    """
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    
    octopus_blue = HexColor("#1e293b")
    octopus_gold = HexColor("#f59e0b")

    c.setFillColor(octopus_blue)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(0.8 * inch, height - 1 * inch, "UNIDAD EDUCATIVA COLEGIO OCTOPUS")
    
    c.setFillColor(HexColor("#64748b"))
    c.setFont("Helvetica", 9)
    c.drawString(0.8 * inch, height - 1.2 * inch, "RIF: J-00000000-0")
    c.drawString(0.8 * inch, height - 1.35 * inch, "Coro, Edo. Falcón, Venezuela.")
    
    c.setFillColor(octopus_blue)
    c.setFont("Helvetica-Bold", 12)
    c.drawRightString(width - 0.8 * inch, height - 1 * inch, "RECIBO DE PAGO")
    c.setFont("Helvetica-Bold", 14)
    c.drawRightString(width - 0.8 * inch, height - 1.25 * inch, f"Nº {pago.id:06d}")
    
    c.setStrokeColor(octopus_gold)
    c.setLineWidth(2)
    c.line(0.8 * inch, height - 1.6 * inch, width - 0.8 * inch, height - 1.6 * inch)

    c.setFillColor(octopus_blue)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(0.8 * inch, height - 2.0 * inch, "DATOS DEL ALUMNO / REPRESENTANTE")
    
    c.setFont("Helvetica", 10)
    c.setFillColor(HexColor("#1e293b"))
    c.drawString(0.8 * inch, height - 2.25 * inch, f"Estudiante: {pago.alumno.nombre} {pago.alumno.apellido}")
    c.drawString(0.8 * inch, height - 2.45 * inch, f"Cédula Escolar: {getattr(pago.alumno, 'cedula_escolar', 'Sin Cédula')}")
    c.drawString(0.8 * inch, height - 2.65 * inch, f"Nivel: {getattr(pago.alumno, 'grado_seccion', 'N/D')}")
    c.drawString(0.8 * inch, height - 2.85 * inch, f"Representante: {pago.representante_nombre or getattr(pago.alumno.representante, 'nombre', '')} {getattr(pago.alumno.representante, 'apellido', '')}")
    c.drawString(0.8 * inch, height - 3.05 * inch, f"Documento Representante: {pago.representante_documento or getattr(pago.alumno.representante, 'cedula', 'N/D')}")

    c.drawRightString(width - 0.8 * inch, height - 2.25 * inch, f"Fecha: {pago.fecha_pago.strftime('%d/%m/%Y')}")
    c.drawRightString(width - 0.8 * inch, height - 2.45 * inch, f"Hora: {pago.fecha_pago.strftime('%H:%M %p')}")

    c.setFillColor(HexColor("#f1f5f9"))
    c.rect(0.8 * inch, height - 3.3 * inch, width - 1.6 * inch, 0.3 * inch, fill=1, stroke=0)
    
    c.setFillColor(octopus_blue)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(1.0 * inch, height - 3.2 * inch, "DESCRIPCIÓN DEL CONCEPTO")
    c.drawRightString(width - 1.0 * inch, height - 3.2 * inch, "MONTO USD")

    c.setFont("Helvetica", 11)
    c.drawString(1.0 * inch, height - 3.6 * inch, f"{pago.get_concepto_display().upper()}")
    c.drawRightString(width - 1.0 * inch, height - 3.6 * inch, f"$ {pago.monto_usd:,.2f}")
    
    c.setFont("Helvetica-Oblique", 9)
    c.drawString(1.0 * inch, height - 3.8 * inch, f"Método: {pago.get_metodo_pago_display()} | Ref: {pago.referencia or 'N/A'}")

    c.setStrokeColor(HexColor("#e2e8f0"))
    c.setLineWidth(1)
    c.line(0.8 * inch, height - 4.2 * inch, width - 0.8 * inch, height - 4.2 * inch)

    c.setFont("Helvetica-Bold", 12)
    c.drawString(0.8 * inch, height - 4.6 * inch, "TOTAL A PAGAR (BOLÍVARES):")
    c.drawRightString(width - 0.8 * inch, height - 4.6 * inch, f"Bs. {pago.monto_ves:,.2f}")
    
    c.setFont("Helvetica", 9)
    c.setFillColor(HexColor("#64748b"))
    c.drawString(0.8 * inch, height - 4.8 * inch, f"* Tasa de cambio oficial BCV aplicada: Bs. {pago.tasa_aplicada}")

    c.setDash(1, 2)
    c.line(1.5 * inch, 2.5 * inch, 3.5 * inch, 2.5 * inch)
    c.line(width - 1.5 * inch, 2.5 * inch, width - 3.5 * inch, 2.5 * inch)
    c.setDash(1, 0)
    
    c.setFont("Helvetica", 8)
    c.drawCentredString(2.5 * inch, 2.3 * inch, "Firma del Representante")
    c.drawCentredString(width - 2.5 * inch, 2.3 * inch, "Sello y Firma Autorizada")

    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(octopus_blue)
    c.drawCentredString(width / 2, 1.2 * inch, "ESTE DOCUMENTO NO TIENE VALIDEZ FISCAL SI NO POSEE EL SELLO HÚMEDO DE LA INSTITUCIÓN")
    
    c.setFont("Helvetica", 7)
    c.setFillColor(HexColor("#94a3b8"))
    c.drawCentredString(width / 2, 1.0 * inch, f"Cajero: {pago.usuario_receptor.username.upper()} | ID de Auditoría: {pago.id}-{int(pago.fecha_pago.timestamp())}")

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer


def generar_pdf_inscripcion(inscripcion):
    """
    Genera comprobante de inscripción en PDF con ReportLab.
    """
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter

    azul = HexColor("#0fa3b1")
    jet = HexColor("#2b303a")
    ash = HexColor("#9a8c98")

    c.setFillColor(jet)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(0.8 * inch, height - 1.0 * inch, "UNIDAD EDUCATIVA COLEGIO OCTOPUS")

    c.setFillColor(ash)
    c.setFont("Helvetica", 9)
    c.drawString(0.8 * inch, height - 1.2 * inch, "RIF: J-00000000-0")
    c.drawString(0.8 * inch, height - 1.35 * inch, "Coro, Edo. Falcón, Venezuela.")

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