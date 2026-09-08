"""
Generación de constancias en PDF (ReportLab).

Único punto de entrada público: `generar_pdf_constancia(constancia)`. La
firma está congelada (acordada con el agente que implementa los endpoints
DRF de `constancias`) — no cambiarla.

Diseño del membrete institucional
----------------------------------
No existe hoy un generador de PDF compartido a nivel de proyecto: cada app
que ya emite PDFs desde el backend con ReportLab (`cobranza/utils.py` para
recibos de pago, `nomina/utils.py` para recibos de nómina) trae su propia
copia local, casi idéntica, de la función `_get_config_colegio()` y de la
lógica "si hay banner personalizado (`encabezado_personalizado` /
`pie_pagina_personalizado`), usarlo; si no, armar un encabezado/pie
estructurado". No hay ningún módulo común que importar, así que este
archivo repite ese mismo criterio de forma independiente (mismo patrón,
implementación propia) en vez de acoplarse a `cobranza` o `nomina`.

A diferencia de esos dos generadores (que, cuando no hay banner
personalizado, arman el encabezado solo con texto e ignoran
`ConfiguracionSistema.logo_colegio`), aquí sí se dibuja `logo_colegio` como
imagen junto al texto cuando está disponible y no hay
`encabezado_personalizado` — así lo pide la especificación de este módulo.

Manejo de errores
------------------
Esta función NUNCA lanza excepción por: imágenes institucionales faltantes
(logo, encabezado, pie, firma, sello — cualquiera puede estar ausente) ni
por HTML con estructura inesperada dentro de `html_renderizado` (un
fragmento que no se pueda convertir limpiamente a un flowable de ReportLab
se inserta como texto plano). El PDF siempre se genera, aunque salga
incompleto. Solo se deja propagar una excepción si ReportLab no puede
construir el documento base (error verdaderamente irrecuperable) — nunca se
envuelve en un mensaje genérico que oculte la causa real.
"""

import logging
import os
import re
from io import BytesIO
from xml.sax.saxutils import escape as _xml_escape

from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.platypus import (
    Image as RLImage,
    ListFlowable,
    ListItem,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

logger = logging.getLogger(__name__)

PAGE_SIZE = letter
MARGIN = 0.8 * inch
HEADER_RESERVE = 1.35 * inch   # espacio reservado arriba para el membrete
FOOTER_RESERVE = 1.1 * inch    # espacio reservado abajo para el pie + número

AZUL = HexColor("#1e293b")
GRIS = HexColor("#64748b")
DORADO = HexColor("#f59e0b")
TEXTO = HexColor("#1e293b")


# ──────────────────────────────────────────────────────────────────────────
# Datos institucionales (filesystem directo, nunca por HTTP)
# ──────────────────────────────────────────────────────────────────────────

def _safe_image_path(campo_imagen):
    """Devuelve la ruta local de un ImageField si el archivo existe en
    disco, o None. Nunca lanza excepción -- cualquier ImageField vacío,
    roto o con storage inaccesible simplemente se trata como "sin imagen".
    """
    if not campo_imagen:
        return None
    try:
        path = campo_imagen.path
    except Exception:
        return None
    try:
        return path if os.path.exists(path) else None
    except Exception:
        return None


def _get_config_colegio():
    """Datos del colegio + rutas de imágenes institucionales, leídos
    directo de `secretaria.ConfiguracionSistema` (fila única). Nunca lanza
    excepción: si el modelo no tiene fila, o algo falla, devuelve valores
    por defecto vacíos.
    """
    try:
        from secretaria.models import ConfiguracionSistema
        cfg = ConfiguracionSistema.objects.order_by('id').first()
    except Exception:
        logger.warning("constancias.pdf: no se pudo leer ConfiguracionSistema", exc_info=True)
        cfg = None

    if not cfg:
        return {
            'nombre': 'UNIDAD EDUCATIVA',
            'rif': '',
            'direccion': '',
            'logo_path': None,
            'encabezado_path': None,
            'pie_path': None,
        }

    partes_dir = []
    if getattr(cfg, 'direccion_colegio', ''):
        partes_dir.append(cfg.direccion_colegio)
    municipio = getattr(cfg, 'municipio', '') or ''
    estado = getattr(cfg, 'estado_colegio', '') or ''
    if municipio and estado:
        partes_dir.append(f"{municipio}, Edo. {estado}")
    elif municipio or estado:
        partes_dir.append(municipio or estado)

    return {
        'nombre': getattr(cfg, 'nombre_colegio', '') or 'UNIDAD EDUCATIVA',
        'rif': f"RIF: {cfg.rif}" if getattr(cfg, 'rif', '') else '',
        'direccion': " | ".join(partes_dir),
        'logo_path': _safe_image_path(getattr(cfg, 'logo_colegio', None)),
        'encabezado_path': _safe_image_path(getattr(cfg, 'encabezado_personalizado', None)),
        'pie_path': _safe_image_path(getattr(cfg, 'pie_pagina_personalizado', None)),
    }


def _get_firmante():
    """Datos del firmante configurado (`constancias.ConfiguracionFirmante`,
    fila única). Nunca lanza excepción: si no hay fila configurada, o algo
    falla, devuelve None -- el llamador se encarga de dejar la línea de
    firma en blanco en ese caso.
    """
    try:
        from constancias.models import ConfiguracionFirmante
        f = ConfiguracionFirmante.objects.first()
    except Exception:
        logger.warning("constancias.pdf: no se pudo leer ConfiguracionFirmante", exc_info=True)
        f = None

    if not f:
        return None

    cedula = f"{f.nacionalidad}-{f.cedula}" if getattr(f, 'cedula', '') else ''
    return {
        'nombre': getattr(f, 'nombre', '') or '',
        'cedula': cedula,
        'cargo': getattr(f, 'cargo', '') or '',
        'firma_path': _safe_image_path(getattr(f, 'firma_imagen', None)),
        'sello_path': _safe_image_path(getattr(f, 'sello_imagen', None)),
    }


# ──────────────────────────────────────────────────────────────────────────
# Conversión de html_renderizado (whitelist ya sanitizada) a flowables
# ──────────────────────────────────────────────────────────────────────────
# Whitelist esperada: p, strong, em, u, ul, ol, li, span[style limitado],
# br, h1-h3. El contenido ya viene sanitizado en otra capa (nunca <script>
# ni tags peligrosos), pero esta conversión igual nunca debe lanzar
# excepción: cualquier fragmento que no encaje limpiamente cae a texto
# plano dentro de un Paragraph simple.

_BLOCK_RE = re.compile(
    r'<(?P<tag>h1|h2|h3|p|ul|ol)\b[^>]*>(?P<content>.*?)</(?P=tag)>',
    re.IGNORECASE | re.DOTALL,
)
_LI_RE = re.compile(r'<li\b[^>]*>(.*?)</li>', re.IGNORECASE | re.DOTALL)

# Tags inline permitidos que se preservan (y luego se traducen) al escapar
# el texto de un bloque -- todo lo demás se trata como texto literal.
_INLINE_ALLOWED_RE = re.compile(
    r'</?(?:strong|em|u|br|span)(?:\s[^>]*)?/?>',
    re.IGNORECASE,
)


def _proteger_y_escapar(fragment):
    """Escapa entidades XML (&, <, >) en el texto de `fragment` sin tocar
    los tags inline de la whitelist, para que ni el HTML ya sanitizado
    rompa el mini-parser XML de reportlab.platypus.Paragraph.
    """
    if not fragment:
        return ''
    tokens = []

    def _stash(m):
        tokens.append(m.group(0))
        return f'\x00{len(tokens) - 1}\x00'

    protegido = _INLINE_ALLOWED_RE.sub(_stash, fragment)
    escapado = _xml_escape(protegido)

    def _restore(m):
        return tokens[int(m.group(1))]

    return re.sub(r'\x00(\d+)\x00', _restore, escapado)


def _span_open_tags(style):
    style = (style or '').lower()
    tags = ''
    if 'bold' in style or 'font-weight' in style and 'normal' not in style:
        tags += '<b>'
    if 'italic' in style:
        tags += '<i>'
    if 'underline' in style:
        tags += '<u>'
    return tags


def _convertir_inline(texto_escapado):
    """Traduce los tags inline de la whitelist al marcado que entiende
    `reportlab.platypus.Paragraph` (strong->b, em->i; u y br ya son
    nativos; span[style] se traduce a b/i/u simples o se descarta).
    """
    txt = texto_escapado
    txt = re.sub(r'<\s*strong\s*>', '<b>', txt, flags=re.IGNORECASE)
    txt = re.sub(r'<\s*/\s*strong\s*>', '</b>', txt, flags=re.IGNORECASE)
    txt = re.sub(r'<\s*em\s*>', '<i>', txt, flags=re.IGNORECASE)
    txt = re.sub(r'<\s*/\s*em\s*>', '</i>', txt, flags=re.IGNORECASE)
    txt = re.sub(r'<\s*br\s*/?\s*>', '<br/>', txt, flags=re.IGNORECASE)
    txt = re.sub(r'<\s*u\s*>', '<u>', txt, flags=re.IGNORECASE)
    txt = re.sub(r'<\s*/\s*u\s*>', '</u>', txt, flags=re.IGNORECASE)

    def _span_start(m):
        style = m.group(1) if m.lastindex else ''
        return _span_open_tags(style)

    txt = re.sub(r'<span[^>]*style="([^"]*)"[^>]*>', _span_start, txt, flags=re.IGNORECASE)
    txt = re.sub(r'<span[^>]*>', '', txt, flags=re.IGNORECASE)
    txt = re.sub(r'</span>', '', txt, flags=re.IGNORECASE)
    return txt


def _html_a_markup(fragment):
    return _convertir_inline(_proteger_y_escapar(fragment))


def _texto_plano(html):
    sin_tags = re.sub(r'<[^>]+>', ' ', html or '')
    return _xml_escape(re.sub(r'\s+', ' ', sin_tags).strip())


def _parrafo_seguro(markup, style):
    """Crea un Paragraph; si el marcado no es válido para el mini-parser
    XML de reportlab (estructura inesperada en html_renderizado), cae a
    texto plano sin tags. Nunca lanza excepción.
    """
    try:
        return Paragraph(markup, style)
    except Exception:
        logger.warning("constancias.pdf: fragmento no convertible a Paragraph, se usa texto plano",
                        exc_info=True)
        try:
            # `markup` ya viene con las entidades (&, <, >) de su texto
            # original escapadas -- aquí solo se eliminan los tags de
            # marcado (<b>, <i>, <u>, <br/>...) que quedaron mal formados,
            # sin volver a escapar el texto (evitaría un doble-escapado).
            plano = re.sub(r'<[^>]+>', ' ', markup or '')
            return Paragraph(plano, style)
        except Exception:
            return Paragraph('', style)


def _construir_flowables_desde_html(html_renderizado, styles):
    """Convierte `constancia.html_renderizado` (HTML whitelist ya
    sanitizado, incluye el anexo si la plantilla lo tenía habilitado) a una
    lista de flowables de ReportLab. Nunca lanza excepción: ante cualquier
    fallo de estructura, degrada a un único párrafo de texto plano con todo
    el contenido.
    """
    flowables = []
    html_renderizado = html_renderizado or ''

    try:
        last_end = 0
        for m in _BLOCK_RE.finditer(html_renderizado):
            suelto = html_renderizado[last_end:m.start()]
            if suelto.strip():
                flowables.append(_parrafo_seguro(_html_a_markup(suelto), styles['p']))

            tag = m.group('tag').lower()
            contenido = m.group('content')

            if tag in ('h1', 'h2', 'h3'):
                texto = _html_a_markup(contenido).strip()
                if texto:
                    flowables.append(_parrafo_seguro(texto, styles['h']))
            elif tag == 'p':
                texto = _html_a_markup(contenido).strip()
                if texto:
                    flowables.append(_parrafo_seguro(texto, styles['p']))
            elif tag in ('ul', 'ol'):
                items = []
                for li_m in _LI_RE.finditer(contenido):
                    texto_li = _html_a_markup(li_m.group(1)).strip()
                    if texto_li:
                        items.append(texto_li)
                if items:
                    try:
                        lf = ListFlowable(
                            [ListItem(_parrafo_seguro(t, styles['li']), leftIndent=6) for t in items],
                            bulletType='bullet' if tag == 'ul' else '1',
                            leftIndent=18,
                        )
                        flowables.append(lf)
                    except Exception:
                        logger.warning("constancias.pdf: no se pudo maquetar lista <%s>, se usa texto plano",
                                        tag, exc_info=True)
                        for t in items:
                            flowables.append(_parrafo_seguro(t, styles['p']))

            last_end = m.end()

        cola = html_renderizado[last_end:]
        if cola.strip():
            flowables.append(_parrafo_seguro(_html_a_markup(cola), styles['p']))
    except Exception:
        logger.exception("constancias.pdf: fallo convirtiendo html_renderizado a flowables, "
                          "se usa texto plano completo")
        flowables = [_parrafo_seguro(_texto_plano(html_renderizado), styles['p'])]

    if not flowables:
        # El cuerpo nunca debe quedar vacío por una plantilla mal formada.
        flowables = [_parrafo_seguro(_texto_plano(html_renderizado), styles['p'])]

    return flowables


# ──────────────────────────────────────────────────────────────────────────
# Estilos
# ──────────────────────────────────────────────────────────────────────────

def _construir_estilos():
    base = getSampleStyleSheet()
    return {
        'titulo': ParagraphStyle(
            'TituloConstancia', parent=base['Heading1'], alignment=TA_CENTER,
            fontName='Helvetica-Bold', fontSize=14, leading=18, textColor=AZUL, spaceAfter=6,
        ),
        'p': ParagraphStyle(
            'CuerpoConstancia', parent=base['BodyText'], alignment=TA_JUSTIFY,
            fontName='Helvetica', fontSize=11, leading=16, spaceAfter=10, textColor=TEXTO,
        ),
        'h': ParagraphStyle(
            'SubtituloConstancia', parent=base['Heading3'], alignment=TA_LEFT,
            fontName='Helvetica-Bold', fontSize=12, leading=15, textColor=AZUL,
            spaceBefore=6, spaceAfter=6,
        ),
        'li': ParagraphStyle(
            'ItemListaConstancia', parent=base['BodyText'], alignment=TA_JUSTIFY,
            fontName='Helvetica', fontSize=11, leading=15, textColor=TEXTO,
        ),
        'firma_nombre': ParagraphStyle(
            'FirmaNombre', parent=base['Normal'], alignment=TA_CENTER,
            fontName='Helvetica-Bold', fontSize=10, leading=13, textColor=AZUL,
        ),
        'firma_cargo': ParagraphStyle(
            'FirmaCargo', parent=base['Normal'], alignment=TA_CENTER,
            fontName='Helvetica', fontSize=9, leading=12, textColor=GRIS,
        ),
    }


# ──────────────────────────────────────────────────────────────────────────
# Bloque de firma
# ──────────────────────────────────────────────────────────────────────────

def _imagen_segura(path, target_h):
    """Carga `path` como RLImage escalada a `target_h` de alto conservando
    proporción. Devuelve None si el archivo falta o no se puede leer --
    nunca lanza excepción.
    """
    if not path:
        return None
    try:
        img = ImageReader(path)
        img_w, img_h = img.getSize()
        if not img_w or not img_h:
            return None
        target_w = target_h * (img_w / img_h)
        return RLImage(path, width=target_w, height=target_h)
    except Exception:
        logger.warning("constancias.pdf: no se pudo cargar imagen %s", path, exc_info=True)
        return None


def _bloque_firma(constancia, firmante, styles):
    flowables = []
    salio_firmada = bool(getattr(constancia, 'salio_firmada', False))

    nombre_firmante = (firmante or {}).get('nombre') or ''
    cargo_firmante = (firmante or {}).get('cargo') or ''
    firma_path = (firmante or {}).get('firma_path') if salio_firmada else None
    sello_path = (firmante or {}).get('sello_path') if salio_firmada else None

    imagenes = []
    firma_img = _imagen_segura(firma_path, 0.55 * inch)
    if firma_img:
        imagenes.append(firma_img)
    sello_img = _imagen_segura(sello_path, 0.55 * inch)
    if sello_img:
        imagenes.append(sello_img)

    if imagenes:
        try:
            tabla_imgs = Table([imagenes], hAlign='CENTER')
            tabla_imgs.setStyle(TableStyle([
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ]))
            flowables.append(tabla_imgs)
            flowables.append(Spacer(1, 0.05 * inch))
        except Exception:
            logger.warning("constancias.pdf: no se pudo maquetar la fila de firma/sello", exc_info=True)

    linea = '_' * 42
    flowables.append(_parrafo_seguro(linea, styles['firma_nombre']))
    if salio_firmada and nombre_firmante:
        flowables.append(_parrafo_seguro(_xml_escape(nombre_firmante), styles['firma_nombre']))
        if cargo_firmante:
            flowables.append(_parrafo_seguro(_xml_escape(cargo_firmante), styles['firma_cargo']))
    # Si salio_firmada es False, la línea queda en blanco para firma manual
    # (sin nombre/cargo/imagen debajo), tal como pide la especificación.

    return flowables


# ──────────────────────────────────────────────────────────────────────────
# Encabezado y pie institucional (dibujados por página vía onPage)
# ──────────────────────────────────────────────────────────────────────────

def _dibujar_encabezado(c, colegio):
    width, height = PAGE_SIZE
    content_width = width - 2 * MARGIN
    max_header_h = HEADER_RESERVE - 0.35 * inch
    y_top = height - 0.45 * inch

    encabezado_path = colegio.get('encabezado_path')
    logo_path = colegio.get('logo_path')

    if encabezado_path:
        img = ImageReader(encabezado_path)
        img_w, img_h = img.getSize()
        if img_w and img_h:
            banner_h = content_width * (img_h / img_w)
            if banner_h > max_header_h:
                banner_h = max_header_h
                banner_w = banner_h * (img_w / img_h)
            else:
                banner_w = content_width
            x = MARGIN + (content_width - banner_w) / 2
            c.drawImage(img, x, y_top - banner_h, width=banner_w, height=banner_h, mask='auto')
            return

    text_x = MARGIN
    if logo_path:
        img = ImageReader(logo_path)
        img_w, img_h = img.getSize()
        if img_w and img_h:
            logo_h = min(max_header_h, 0.7 * inch)
            logo_w = logo_h * (img_w / img_h)
            c.drawImage(img, MARGIN, y_top - logo_h, width=logo_w, height=logo_h, mask='auto')
            text_x = MARGIN + logo_w + 0.2 * inch

    c.setFillColor(AZUL)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(text_x, y_top - 0.25 * inch, (colegio.get('nombre') or '').upper())

    c.setFillColor(GRIS)
    c.setFont("Helvetica", 8)
    y_linea = y_top - 0.42 * inch
    if colegio.get('rif'):
        c.drawString(text_x, y_linea, colegio['rif'])
        y_linea -= 0.15 * inch
    if colegio.get('direccion'):
        c.drawString(text_x, y_linea, colegio['direccion'])


def _dibujar_pie(c, colegio, numero):
    width, height = PAGE_SIZE
    content_width = width - 2 * MARGIN
    pie_path = colegio.get('pie_path')

    if pie_path:
        img = ImageReader(pie_path)
        img_w, img_h = img.getSize()
        if img_w and img_h:
            pie_h = content_width * (img_h / img_w)
            max_pie_h = FOOTER_RESERVE - 0.3 * inch
            if pie_h > max_pie_h:
                pie_w = max_pie_h * (img_w / img_h)
                pie_h = max_pie_h
            else:
                pie_w = content_width
            x = MARGIN + (content_width - pie_w) / 2
            c.drawImage(img, x, 0.45 * inch, width=pie_w, height=pie_h, mask='auto')
    else:
        c.setFillColor(GRIS)
        c.setFont("Helvetica", 7)
        partes = [p for p in [colegio.get('direccion'), colegio.get('rif')] if p]
        if partes:
            c.drawCentredString(width / 2, 0.5 * inch, "  |  ".join(partes))

    if numero:
        c.setFillColor(GRIS)
        c.setFont("Helvetica", 7)
        c.drawRightString(width - MARGIN, 0.3 * inch, f"Número: {numero}")


# ──────────────────────────────────────────────────────────────────────────
# Función pública
# ──────────────────────────────────────────────────────────────────────────

def generar_pdf_constancia(constancia: "ConstanciaEmitida") -> bytes:
    """Genera el PDF de una constancia ya emitida. Devuelve los bytes del
    PDF. Nunca lanza excepción por imágenes faltantes (logo, encabezado,
    pie de página, firma, sello) -- si faltan, simplemente no las incluye
    y el documento sale sin esa imagen, nunca rompe la generación.

    No mantiene estado global entre llamadas: puede invocarse una vez por
    persona sin problema (cada llamada consulta la configuración
    institucional y del firmante de forma independiente).
    """
    colegio = _get_config_colegio()
    firmante = _get_firmante()
    styles = _construir_estilos()

    try:
        tipo_display = constancia.get_tipo_display()
    except Exception:
        tipo_display = (getattr(constancia, 'tipo', '') or '').upper()

    numero = getattr(constancia, 'numero', '') or ''

    story = [
        Spacer(1, 0.1 * inch),
        _parrafo_seguro(_xml_escape(f"CONSTANCIA DE {(tipo_display or '').upper()}"), styles['titulo']),
        Spacer(1, 0.25 * inch),
    ]
    story.extend(_construir_flowables_desde_html(getattr(constancia, 'html_renderizado', '') or '', styles))
    story.append(Spacer(1, 0.5 * inch))
    story.extend(_bloque_firma(constancia, firmante, styles))

    def _on_page(c, _doc):
        try:
            _dibujar_encabezado(c, colegio)
        except Exception:
            logger.warning("constancias.pdf: fallo dibujando encabezado institucional", exc_info=True)
        try:
            _dibujar_pie(c, colegio, numero)
        except Exception:
            logger.warning("constancias.pdf: fallo dibujando pie de página institucional", exc_info=True)

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=PAGE_SIZE,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=HEADER_RESERVE,
        bottomMargin=FOOTER_RESERVE,
        title=f"Constancia {numero}".strip(),
    )
    # Si ReportLab no logra construir el documento base, la excepción se
    # deja propagar tal cual (error irrecuperable, no se enmascara).
    doc.build(story, onFirstPage=_on_page, onLaterPages=_on_page)

    buffer.seek(0)
    return buffer.getvalue()
