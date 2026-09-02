from fpdf import FPDF
from io import BytesIO

MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
            'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

class ReciboPDF(FPDF):
    def header(self):
        self.set_font('Arial', 'B', 15)
        self.cell(0, 10, 'INSTITUCION EDUCATIVA OCTOPUS', 0, 1, 'C')
        self.set_font('Arial', '', 10)
        self.cell(0, 5, 'RIF: J-12345678-0', 0, 1, 'C')
        self.ln(10)

    def footer(self):
        self.set_y(-15)
        self.set_font('Arial', 'I', 8)
        self.cell(0, 10, f'Pagina {self.page_no()}', 0, 0, 'C')

def generar_recibo_pdf(pago):
    pdf = ReciboPDF()
    pdf.add_page()
    pdf.set_font("Arial", size=12)

    # Cuerpo del Recibo
    pdf.set_fill_color(230, 230, 230)
    pdf.cell(0, 10, f"RECIBO DE PAGO #000{pago.id}", 1, 1, 'C', fill=True)
    pdf.ln(5)

    pdf.cell(0, 10, f"Fecha: {pago.fecha_pago.strftime('%d/%m/%Y %H:%M')}", 0, 1)
    pdf.cell(0, 10, f"Alumno: {pago.alumno.nombre} {pago.alumno.apellido}", 0, 1)
    pdf.cell(0, 10, f"Cedula Escolar: {pago.alumno.cedula_escolar}", 0, 1)
    
    pdf.ln(5)
    pdf.set_font("Arial", 'B', 12)
    pdf.cell(0, 10, "DETALLES DEL PAGO", 0, 1)
    pdf.set_font("Arial", size=12)

    mensualidades = list(pago.mensualidades_pagadas.all().order_by('anio', 'mes'))
    if mensualidades:
        # Desglose línea por línea: mensualidad, seguida inmediatamente de
        # su recargo por pago tardío si aplicó (LineaRecargoPago, snapshot
        # inmutable). Si el pago está a tiempo, no hay línea de recargo —
        # se ve igual que la única línea agregada que se mostraba antes.
        recargos_por_mensualidad = {
            r.mensualidad_id: r for r in pago.lineas_recargo.all()
        }
        total_mensualidades = 0
        for m in mensualidades:
            pdf.cell(140, 8, f"Mensualidad {MESES_ES[m.mes - 1]} {m.anio}", 1)
            pdf.cell(0, 8, f"{m.monto_usd} $", 1, 1)
            total_mensualidades += m.monto_usd

            recargo = recargos_por_mensualidad.get(m.id)
            if recargo:
                pdf.cell(140, 8, "Recargo por pago tardio", 1)
                pdf.cell(0, 8, f"{recargo.monto_usd} $", 1, 1)
                total_mensualidades += recargo.monto_usd

        pdf.set_font("Arial", 'B', 12)
        pdf.cell(140, 8, "Total", 1)
        pdf.cell(0, 8, f"{total_mensualidades} $", 1, 1)
        pdf.set_font("Arial", size=12)
        pdf.ln(2)
    else:
        pdf.cell(90, 10, f"Monto en Divisas:", 1)
        pdf.cell(0, 10, f"{pago.monto_usd} USD", 1, 1)

    pdf.cell(90, 10, f"Tasa Aplicada:", 1)
    pdf.cell(0, 10, f"{pago.tasa_aplicada} VES", 1, 1)
    
    pdf.cell(90, 10, f"Total Pagado (Bs):", 1)
    pdf.cell(0, 10, f"{pago.monto_ves} VES", 1, 1)
    
    pdf.ln(10)
    pdf.cell(0, 10, f"Metodo: {pago.get_metodo_pago_display()}", 0, 1)
    pdf.cell(0, 10, f"Referencia: {pago.referencia or 'N/A'}", 0, 1)

    # Retornar como bytes
    return pdf.output()