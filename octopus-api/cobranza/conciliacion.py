class ConciliadorBancario:
    @staticmethod
    def conciliar_zelle(referencia_bancaria, monto_recibido):
        """
        Busca un pago pendiente que coincida con la referencia y el monto.
        """
        from .models import Pago
        try:
            pago = Pago.objects.get(referencia=referencia_bancaria, monto_usd=monto_recibido)
            return {"status": "conciliado", "pago_id": pago.id}
        except Pago.DoesNotExist:
            return {"status": "no_encontrado", "referencia": referencia_bancaria}


class PdfSinTablaError(Exception):
    """El PDF no tiene tablas/texto extraíble (ej. es un escaneo/imagen)."""



# Distintos bancos exportan el PDF con estructuras muy distintas: unos traen
# líneas/bordes de tabla reales, otros solo texto alineado por espacios sin
# ningún borde. No asumimos el formato de ningún banco en particular — se
# prueba cada estrategia de pdfplumber en orden y se usa la primera que
# efectivamente encuentre filas en la página.
_ESTRATEGIAS_TABLA = [
    {},  # default: detecta bordes/líneas reales de la tabla
    {'vertical_strategy': 'text', 'horizontal_strategy': 'text'},  # sin bordes: infiere columnas por alineación de texto
    {'vertical_strategy': 'text', 'horizontal_strategy': 'lines'},
]


def _extraer_tabla_pagina(page):
    for settings in _ESTRATEGIAS_TABLA:
        tabla = page.extract_table(table_settings=settings) if settings else page.extract_table()
        if tabla and len(tabla) > 1:
            return tabla
    return None


def extraer_tabla_pdf(archivo):
    """
    Extrae filas de un estado de cuenta en PDF y las devuelve como
    list[list[str]], en el mismo formato que produce
    XLSX.utils.sheet_to_json(ws, { header: 1 }) en el frontend, para que
    bankParsers.js::genericParse() pueda procesarlas sin cambios.

    Genérico para cualquier banco: no hardcodea columnas ni layout de un
    banco específico (esa detección ya la hace genericParse() por nombre
    de encabezado). Solo funciona con PDFs de texto real (no escaneados) —
    pdfplumber no hace OCR. Si a futuro un banco solo entrega PDFs
    escaneados habría que agregar pytesseract, que no se implementa aquí.
    """
    import pdfplumber

    filas = []
    with pdfplumber.open(archivo) as pdf:
        for page in pdf.pages:
            tabla = _extraer_tabla_pagina(page)
            if not tabla:
                continue
            for fila in tabla:
                filas.append(['' if celda is None else str(celda).strip() for celda in fila])

    if not filas:
        raise PdfSinTablaError(
            'No se detectó ninguna tabla en el PDF. Verifica que sea un estado '
            'de cuenta con texto real (no una imagen escaneada).'
        )

    return filas