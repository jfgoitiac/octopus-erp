import datetime
import logging
import os
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from io import BytesIO
from decimal import Decimal

logger = logging.getLogger(__name__)


def _safe_image_path(campo_imagen):
    """Devuelve la ruta local del ImageField si el archivo existe en disco, o None."""
    if not campo_imagen:
        return None
    try:
        path = campo_imagen.path
    except (ValueError, NotImplementedError):
        return None
    return path if os.path.exists(path) else None


def _get_config_colegio():
    """
    Retorna nombre/RIF del colegio y las rutas de los banners personalizados
    (encabezado/pie) desde ConfiguracionSistema — mismo criterio que
    cobranza.utils._get_config_colegio, para que el recibo de nómina use el
    encabezado real del colegio en vez de un nombre de ejemplo fijo.
    """
    from secretaria.models import ConfiguracionSistema
    cfg = ConfiguracionSistema.objects.order_by('id').first()
    if not cfg:
        return "UNIDAD EDUCATIVA", "", None, None
    nombre = cfg.nombre_colegio or "UNIDAD EDUCATIVA"
    rif = f"RIF: {cfg.rif}" if cfg.rif else ""
    return nombre, rif, _safe_image_path(cfg.encabezado_personalizado), _safe_image_path(cfg.pie_pagina_personalizado)

class GeneradorArchivoBancario:
    @staticmethod
    def generar_txt_banesco(registros_nomina):
        """
        Genera una cadena de texto formateada para el servicio de Nómina Banesco.
        Formato simplificado: Identificador + Cédula (10) + Monto (12) + Cuenta (20).

        Devuelve (texto, cedulas_omitidas). Los empleados sin cuenta bancaria
        vinculada en RRHH se omiten del archivo (no hay a dónde transferir);
        el llamador debe avisar de `cedulas_omitidas` antes de enviar el archivo al banco.
        """
        lineas = []
        omitidos = []
        for registro in registros_nomina:
            empleado_rrhh = getattr(registro.empleado, 'empleado_rrhh', None)
            cuenta = (getattr(empleado_rrhh, 'numero_cuenta', '') or '').strip()
            if not empleado_rrhh or not cuenta:
                omitidos.append(registro.empleado.cedula)
                continue
            cedula = registro.empleado.cedula.lstrip('VEve-').zfill(10)
            # El monto debe ir sin puntos ni comas, 2 decimales implícitos (ej: 100,50 -> 000000010050)
            monto = str(int(registro.total_pagar_ves * 100)).zfill(12)
            cuenta_fmt = cuenta.zfill(20)

            linea = f"N{cedula}{monto}{cuenta_fmt}"
            lineas.append(linea)

        return "\n".join(lineas), omitidos

class GeneradorReciboNomina:
    """
    Servicio para la creación de comprobantes de pago de nómina en PDF utilizando ReportLab.
    """
    @staticmethod
    def generar_pdf(registro):
        buffer = BytesIO()
        c = canvas.Canvas(buffer, pagesize=letter)
        width, height = letter

        # Colores corporativos (Basados en el branding de Octopus ERP)
        azul_primario = HexColor("#1e293b")
        naranja_accent = HexColor("#f59e0b")
        gris_soft = HexColor("#f1f5f9")
        gris_text = HexColor("#475569")

        nombre_colegio, rif_colegio, encabezado_path, pie_path = _get_config_colegio()

        # 1. Cabecera Institucional
        # Divisor dorado en la posición original — si el banner personalizado
        # ocupa más espacio, el resto del documento se desplaza hacia abajo
        # con c.translate (mismo patrón que cobranza.utils._draw_colegio_header).
        default_bottom = height - 1.2 * inch
        banner_dibujado = False

        if encabezado_path:
            try:
                img = ImageReader(encabezado_path)
                img_w, img_h = img.getSize()
                content_width = width - 1.6 * inch
                banner_h = content_width * (img_h / img_w)
                banner_top = height - 0.6 * inch
                c.drawImage(img, 0.8 * inch, banner_top - banner_h, width=content_width,
                            height=banner_h, mask='auto')

                titulo_y = banner_top - banner_h - 0.25 * inch
                c.setFillColor(azul_primario)
                c.setFont("Helvetica-Bold", 11)
                c.drawRightString(width - 0.8 * inch, titulo_y, "RECIBO DE PAGO INDIVIDUAL")
                c.setFont("Helvetica", 9)
                c.drawRightString(width - 0.8 * inch, titulo_y - 0.2 * inch, f"ID Control: #{registro.id:06d}")

                new_bottom = titulo_y - 0.2 * inch - 0.15 * inch
                extra_offset = max(0, default_bottom - new_bottom)
                banner_dibujado = True
            except Exception:
                logger.warning("No se pudo dibujar el encabezado_personalizado en el recibo de nómina.")

        if not banner_dibujado:
            c.setFillColor(azul_primario)
            c.setFont("Helvetica-Bold", 14)
            c.drawString(0.8 * inch, height - 0.8 * inch, nombre_colegio.upper())

            c.setFillColor(gris_text)
            c.setFont("Helvetica", 9)
            pie_texto = f"{rif_colegio} | Recursos Humanos" if rif_colegio else "Recursos Humanos"
            c.drawString(0.8 * inch, height - 1.0 * inch, pie_texto)

            c.setFillColor(azul_primario)
            c.setFont("Helvetica-Bold", 11)
            c.drawRightString(width - 0.8 * inch, height - 0.8 * inch, "RECIBO DE PAGO INDIVIDUAL")
            c.setFont("Helvetica", 9)
            c.drawRightString(width - 0.8 * inch, height - 1.0 * inch, f"ID Control: #{registro.id:06d}")
            extra_offset = 0

        c.setStrokeColor(naranja_accent)
        c.setLineWidth(1.5)
        c.line(0.8 * inch, default_bottom, width - 0.8 * inch, default_bottom)

        if extra_offset:
            c.translate(0, -extra_offset)

        # 2. Información del Empleado
        emp = registro.empleado
        c.setFillColor(azul_primario)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(0.8 * inch, height - 1.6 * inch, "INFORMACIÓN DEL EMPLEADO")
        
        c.setFont("Helvetica", 9)
        c.drawString(0.8 * inch, height - 1.85 * inch, f"Nombre completo: {emp.nombre} {emp.apellido}")
        c.drawString(0.8 * inch, height - 2.05 * inch, f"Documento / C.I.: {emp.cedula}")
        c.drawString(0.8 * inch, height - 2.25 * inch, f"Cargo / Puesto:   {emp.get_tipo_personal_display().title()}")
        
        c.drawRightString(width - 0.8 * inch, height - 1.85 * inch, f"Mes: {registro.mes_correspondiente} / {registro.anio_correspondiente}")
        c.drawRightString(width - 0.8 * inch, height - 2.05 * inch, f"Fecha de Pago: {registro.fecha_proceso.strftime('%d/%m/%Y')}")

        # 3. Desglose de Conceptos (Tabla)
        y_table = height - 2.8 * inch
        c.setFillColor(gris_soft)
        c.rect(0.8 * inch, y_table - 0.15 * inch, width - 1.6 * inch, 0.25 * inch, fill=1, stroke=0)
        
        c.setFillColor(azul_primario)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(1.0 * inch, y_table, "DESCRIPCIÓN DEL CONCEPTO")
        c.drawRightString(width - 2.5 * inch, y_table, "ASIGNACIONES")
        c.drawRightString(width - 1.0 * inch, y_table, "DEDUCCIONES")

        c.setFont("Helvetica", 9)
        y = y_table - 0.35 * inch
        ls = 0.22 * inch

        # Conceptos y Columnas
        bono_ves = (registro.bono_usd * registro.tasa_pago_bono).quantize(Decimal('0.01'))
        
        filas = [
            ("Sueldo Mensual Base", emp.sueldo_base_ves, None),
            ("Bono de Alimentación (Cestaticket)", registro.monto_cestaticket, None),
            (f"Incentivo Especial ({registro.bono_usd} USD)", bono_ves, None),
            (f"Seguro Social (SSO {registro.porcentaje_sso_aplicado * 100}%)", None, registro.monto_sso),
            (f"Ley de Política Habitacional (LPH {registro.porcentaje_lph_aplicado * 100}%)", None, registro.monto_lph),
        ]

        for desc, asigna, deduc in filas:
            c.drawString(1.0 * inch, y, desc)
            if asigna: c.drawRightString(width - 2.5 * inch, y, f"{asigna:,.2f}")
            if deduc: c.drawRightString(width - 1.0 * inch, y, f"{deduc:,.2f}")
            y -= ls

        # 4. Totales
        y -= 0.2 * inch
        c.setStrokeColor(HexColor("#cbd5e1"))
        c.line(0.8 * inch, y + 0.1 * inch, width - 0.8 * inch, y + 0.1 * inch)
        
        c.setFillColor(azul_primario)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(0.8 * inch, y - 0.1 * inch, "NETO A PAGAR (BOLÍVARES):")
        c.drawRightString(width - 0.8 * inch, y - 0.1 * inch, f"Bs. {registro.total_pagar_ves:,.2f}")

        # 5. Firmas
        c.setDash(1, 2)
        c.line(1.5 * inch, 1.8 * inch, 3.5 * inch, 1.8 * inch)
        c.line(width - 1.5 * inch, 1.8 * inch, width - 3.5 * inch, 1.8 * inch)
        c.setDash(1, 0)
        
        c.setFont("Helvetica", 8)
        c.drawCentredString(2.5 * inch, 1.6 * inch, "Firma del Trabajador")
        c.drawCentredString(width - 2.5 * inch, 1.6 * inch, "Sello y Firma Autorizada")

        # 6. Banner de pie de página personalizado (opcional)
        if pie_path:
            try:
                pie_img = ImageReader(pie_path)
                pie_w, pie_h_src = pie_img.getSize()
                content_width = width - 1.6 * inch
                pie_h = content_width * (pie_h_src / pie_w)
                c.drawImage(pie_img, 0.8 * inch, 0.5 * inch, width=content_width, height=pie_h,
                            mask='auto')
            except Exception:
                logger.warning("No se pudo dibujar el pie_pagina_personalizado en el recibo de nómina.")

        c.showPage()
        c.save()
        buffer.seek(0)
        return buffer