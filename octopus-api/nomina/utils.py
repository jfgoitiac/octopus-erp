import datetime
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from io import BytesIO
from decimal import Decimal

class GeneradorArchivoBancario:
    @staticmethod
    def generar_txt_banesco(registros_nomina):
        """
        Genera una cadena de texto formateada para el servicio de Nómina Banesco.
        Formato simplificado: Identificador + Cédula (10) + Monto (12) + Cuenta (20).
        """
        lineas = []
        for registro in registros_nomina:
            # Ejemplo de formateo de posición fija
            cedula = registro.empleado.cedula.zfill(10)
            # El monto debe ir sin puntos ni comas, 2 decimales implícitos (ej: 100,50 -> 000000010050)
            monto = str(int(registro.total_pagar_ves * 100)).zfill(12)
            # En un entorno real, se usaría el número de cuenta guardado en el perfil del empleado
            cuenta_dummy = "01340000000000000000" 
            
            linea = f"N{cedula}{monto}{cuenta_dummy}"
            lineas.append(linea)
            
        return "\n".join(lineas)

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

        # 1. Cabecera Institucional
        c.setFillColor(azul_primario)
        c.setFont("Helvetica-Bold", 14)
        c.drawString(0.8 * inch, height - 0.8 * inch, "UNIDAD EDUCATIVA COLEGIO OCTOPUS")
        
        c.setFillColor(gris_text)
        c.setFont("Helvetica", 9)
        c.drawString(0.8 * inch, height - 1.0 * inch, "RIF: J-00000000-0 | Recursos Humanos")
        
        c.setFillColor(azul_primario)
        c.setFont("Helvetica-Bold", 11)
        c.drawRightString(width - 0.8 * inch, height - 0.8 * inch, "RECIBO DE PAGO INDIVIDUAL")
        c.setFont("Helvetica", 9)
        c.drawRightString(width - 0.8 * inch, height - 1.0 * inch, f"ID Control: #{registro.id:06d}")

        c.setStrokeColor(naranja_accent)
        c.setLineWidth(1.5)
        c.line(0.8 * inch, height - 1.2 * inch, width - 0.8 * inch, height - 1.2 * inch)

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
            ("Seguro Social (SSO 4%)", None, registro.monto_sso),
            ("Ley de Política Habitacional (LPH 1%)", None, registro.monto_lph),
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

        c.showPage()
        c.save()
        buffer.seek(0)
        return buffer