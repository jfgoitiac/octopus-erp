import re
import unicodedata


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
]

# Estas dos infieren columnas por alineación de texto en vez de líneas reales,
# lo cual es más frágil (ej. rompe palabras sueltas en columnas cuando el PDF
# no tiene ninguna línea de tabla en absoluto). Solo se intentan como último
# recurso, después de que falla el fallback por posición de palabras
# (`_extraer_tabla_por_palabras`), que es más confiable cuando hay un
# encabezado detectable.
_ESTRATEGIAS_TABLA_FRAGILES = [
    {'vertical_strategy': 'text', 'horizontal_strategy': 'text'},
    {'vertical_strategy': 'text', 'horizontal_strategy': 'lines'},
]


def _tabla_es_degenerada(tabla):
    """
    Cuando una tabla solo tiene borde exterior y ninguna línea horizontal
    entre filas de transacción (ej. algunos estados de cuenta de Bancaribe),
    pdfplumber.extract_table() agrupa TODAS las transacciones de la página
    en una sola fila, con cada columna llena de valores separados por "\n".
    Esa fila pasa el chequeo de "len(tabla) > 1" pero es basura: detectamos
    el patrón para descartarla y usar el fallback por posición de palabras.
    """
    return any(
        isinstance(celda, str) and celda.count('\n') > 3
        for fila in tabla
        for celda in fila
    )


_TERMINOS_ENCABEZADO_FECHA = ('fecha',)
_TERMINOS_ENCABEZADO_REF = ('referencia', 'documento', 'comprobante')


def _norm(s):
    s = unicodedata.normalize('NFD', s or '')
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return s.lower().strip()


def _es_fila_encabezado(texto_norm):
    return (
        any(t in texto_norm for t in _TERMINOS_ENCABEZADO_FECHA)
        and any(t in texto_norm for t in _TERMINOS_ENCABEZADO_REF)
    )


def _agrupar_por_fila(words, tol=3):
    """Agrupa palabras del PDF que comparten la misma línea (coordenada Y)."""
    filas = []
    for w in sorted(words, key=lambda w: w['top']):
        for fila in filas:
            if abs(fila[0]['top'] - w['top']) <= tol:
                fila.append(w)
                break
        else:
            filas.append([w])
    return filas


def _extraer_tabla_por_palabras(page):
    """
    Reconstruye filas de transacción a partir de la posición (X, Y) de cada
    palabra del PDF, para páginas donde no hay líneas horizontales que
    separen una fila de otra (ver `_tabla_es_degenerada`). Los límites de
    columna se calculan dinámicamente a partir de la fila de encabezado de
    cada página, así que no depende del layout de un banco específico.
    Las líneas de continuación (sin fecha al inicio — ej. una descripción u
    oficina que no cupo en una sola línea) se anexan a la fila anterior en
    vez de generar una fila nueva.
    """
    words = page.extract_words(use_text_flow=False, keep_blank_chars=False)
    if not words:
        return None

    filas_palabras = sorted(_agrupar_por_fila(words), key=lambda fila: fila[0]['top'])

    header_words = None
    for fila in filas_palabras:
        fila_ordenada = sorted(fila, key=lambda w: w['x0'])
        texto_norm = ' '.join(_norm(w['text']) for w in fila_ordenada)
        if _es_fila_encabezado(texto_norm):
            header_words = fila_ordenada
            break
    if not header_words:
        return None

    # Fusiona palabras del encabezado muy cercanas entre sí (ej. "Nro. Ref.")
    # para que cuenten como una sola columna.
    columnas = []
    for w in header_words:
        if columnas and w['x0'] - columnas[-1]['x1'] < 20:
            columnas[-1]['x1'] = w['x1']
            columnas[-1]['text'] += ' ' + w['text']
        else:
            columnas.append({'x0': w['x0'], 'x1': w['x1'], 'text': w['text']})

    limites = []
    for i, col in enumerate(columnas):
        izq = 0 if i == 0 else (columnas[i - 1]['x1'] + col['x0']) / 2
        der = float('inf') if i == len(columnas) - 1 else (col['x1'] + columnas[i + 1]['x0']) / 2
        limites.append((izq, der))

    def columna_de(x_centro):
        for i, (izq, der) in enumerate(limites):
            if izq <= x_centro < der:
                return i
        return len(columnas) - 1

    filas = [[col['text'] for col in columnas]]
    fila_actual = None

    for fila in filas_palabras:
        fila_ordenada = sorted(fila, key=lambda w: w['x0'])
        texto_norm = ' '.join(_norm(w['text']) for w in fila_ordenada)
        if _es_fila_encabezado(texto_norm):
            continue

        celdas = [[] for _ in columnas]
        for w in fila_ordenada:
            centro = (w['x0'] + w['x1']) / 2
            celdas[columna_de(centro)].append(w['text'])
        celdas = [' '.join(c) for c in celdas]

        tiene_fecha = bool(re.match(r'^\d{2}-[A-Za-z]{3}\.?-?\d{4}$', celdas[0]))

        if tiene_fecha or fila_actual is None:
            fila_actual = celdas
            filas.append(fila_actual)
        else:
            # Línea de continuación (sin fecha): se anexa a la fila anterior
            # en vez de crear una fila nueva.
            for i, val in enumerate(celdas):
                if val:
                    fila_actual[i] = (fila_actual[i] + ' ' + val).strip()

    return filas if len(filas) > 1 else None


def _extraer_tabla_pagina(page):
    for settings in _ESTRATEGIAS_TABLA:
        tabla = page.extract_table(table_settings=settings) if settings else page.extract_table()
        if tabla and len(tabla) > 1 and not _tabla_es_degenerada(tabla):
            return tabla

    tabla = _extraer_tabla_por_palabras(page)
    if tabla:
        return tabla

    for settings in _ESTRATEGIAS_TABLA_FRAGILES:
        tabla = page.extract_table(table_settings=settings)
        if tabla and len(tabla) > 1 and not _tabla_es_degenerada(tabla):
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