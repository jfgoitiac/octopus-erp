from fpdf import FPDF
from io import BytesIO

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