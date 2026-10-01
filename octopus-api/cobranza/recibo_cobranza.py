"""
Motor único del recibo de cobranza.

Es el ÚNICO generador del "RECIBO DE PAGO - COBRANZA ESCOLAR": lo usan el
panel (al cobrar y al reimprimir desde Comprobantes), el portal de
representantes, el correo de pago confirmado y el envío por WhatsApp. Antes
el recibo se dibujaba en el navegador (printReciboCobranza.jsx) y el backend
tenía otros dos diseños distintos; ahora en todos lados sale el mismo
documento, con el mismo N° de recibo.

Encabezado y pie: los recortes de Configuración (encabezado_personalizado /
pie_pagina_personalizado). Sin recortes, se dibuja el membrete estructurado
(logo + datos del colegio arriba, línea y dirección abajo).

Medidas en puntos PDF sobre A4, tomadas del recibo de referencia aprobado.
"""
import logging
from decimal import Decimal, InvalidOperation
from io import BytesIO
from xml.sax.saxutils import escape

from django.utils import timezone
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.platypus import Flowable, Paragraph, Table, TableStyle

logger = logging.getLogger(__name__)

NAVY = HexColor('#0D3B84')
RED = HexColor('#E53935')
SELLO = HexColor('#D32F2F')
BORDER = HexColor('#BDBDBD')
CAJA = HexColor('#333333')
TEXT = HexColor('#111111')
GRIS = HexColor('#888888')

MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
            'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

# Geometría de la página (pt)
ANCHO_PAGINA, ALTO_PAGINA = A4
MARGEN_X = 60
MARGEN_SUP = 40
BASE_PIE = 80          # el pie se apoya a esta altura desde el borde inferior
SEPARACION = 15        # espacio entre bloques


# ──────────────────────────────────────────────────────────────────────────────
# DATOS
# ──────────────────────────────────────────────────────────────────────────────

def _dec(valor):
    try:
        return Decimal(str(valor)) if valor not in (None, '') else Decimal('0')
    except (InvalidOperation, ValueError):
        return Decimal('0')


def fmt_bs(valor):
    """1234.5 → '1.234,50' (formato es-VE, igual que fmtN/fmtZ del frontend)."""
    texto = f"{_dec(valor):,.2f}"
    return texto.replace(',', '_').replace('.', ',').replace('_', '.')


def pago_principal(pago):
    """Primer pago de la operación: su factura_id es el N° de recibo."""
    from .models import Pago
    return (
        Pago.objects.filter(operacion_uuid=pago.operacion_uuid)
        .select_related('alumno', 'alumno__representante', 'usuario_receptor', 'banco_receptor')
        .prefetch_related('solvencias_generadas')
        .order_by('id')
        .first()
    ) or pago


def numero_recibo(pago):
    principal = pago_principal(pago)
    return principal.factura_id or f"#{principal.id}"


def datos_recibo(pago):
    """
    Datos del recibo de la operación a la que pertenece `pago`. Misma lógica
    que tenía imprimirReciboComprobante.js (reimpresión del panel y portal):
    líneas desde el desglose de conceptos del comprobante, detección de abono
    parcial y lista de hermanos cuando la operación cubrió a varios alumnos.
    """
    from .serializers import ComprobanteSerializer

    principal = pago_principal(pago)
    c = ComprobanteSerializer(principal).data
    fecha = timezone.localtime(principal.fecha_pago)
    tasa = _dec(principal.tasa_aplicada)

    def to_ves(ves, usd):
        v = _dec(ves)
        return v if v > 0 else _dec(usd) * tasa

    mes_str = MESES_ES[fecha.month - 1].capitalize()
    periodo_label = f"{mes_str} {fecha.year}"

    desglose = c.get('desglose_conceptos') or []
    if desglose:
        items = [{
            'concepto': dc.get('concepto_display') or dc.get('concepto') or c.get('concepto_display') or '',
            'descripcion': dc.get('descripcion') or periodo_label,
            'monto_ves': to_ves(dc.get('monto_ves'), dc.get('monto_usd')),
            'alumno': dc.get('alumno') or None,
        } for dc in desglose]
    else:
        items = [{
            'concepto': c.get('concepto_display') or '',
            'descripcion': periodo_label,
            'monto_ves': to_ves(c.get('total_ves') or c.get('monto_ves'), c.get('total_usd') or c.get('monto_usd')),
            'alumno': None,
        }]

    # Abono parcial: el backend no guarda a qué línea se aplicó cada abono;
    # se detecta comparando lo pagado contra lo que suman las líneas.
    total_lineas_usd = sum((_dec(dc.get('monto_usd')) for dc in desglose), Decimal('0'))
    pagado_usd = _dec(c.get('total_usd') or c.get('monto_usd'))
    es_abono = total_lineas_usd > 0 and pagado_usd > 0 and pagado_usd < total_lineas_usd - Decimal('0.05')
    saldo_usd = max(Decimal('0'), total_lineas_usd - pagado_usd)
    nota_abono = ''
    if es_abono:
        monto_abono_ves = to_ves(c.get('total_ves'), pagado_usd)
        if len(items) == 1:
            items[0]['monto_ves'] = monto_abono_ves
            items[0]['descripcion'] = f"{items[0]['descripcion']} (ABONO — saldo pendiente: ${saldo_usd:.2f})"
        else:
            nota_abono = (f"ABONO PARCIAL: se abonaron ${pagado_usd:.2f} de ${total_lineas_usd:.2f}. "
                          f"Saldo pendiente: ${saldo_usd:.2f}.")

    alumnos_operacion = list(dict.fromkeys(it['alumno'] for it in items if it['alumno']))
    if len(alumnos_operacion) > 1:
        nombre_estudiante = ', '.join(alumnos_operacion)
    else:
        nombre_estudiante = f"{c.get('nombre_alumno') or ''} {c.get('apellido_alumno') or ''}".strip()

    rep = getattr(principal.alumno, 'representante', None)
    ci_representante = (c.get('representante_documento') or getattr(rep, 'cedula', '')
                        or c.get('cedula_escolar') or '')

    return {
        'nro_recibo': c.get('factura_id') or f"#{principal.id}",
        'mes': mes_str,
        'anio': fecha.year,
        'fecha_pago': fecha.strftime('%d/%m/%Y'),
        'nombre_estudiante': nombre_estudiante,
        'grado': c.get('grado') or '',
        'representante': c.get('representante_nombre') or '',
        'ci_representante': ci_representante,
        'items': items,
        'hay_varios_alumnos': len(alumnos_operacion) > 1,
        'observaciones': ' '.join(x for x in (c.get('observaciones'), nota_abono) if x),
        'numero_solvencia': c.get('numero_solvencia'),
    }


def _imagen(campo):
    """ImageField → ImageReader (o None). Se lee por el storage, no por ruta."""
    if not campo:
        return None
    try:
        with campo.open('rb') as f:
            return ImageReader(BytesIO(f.read()))
    except Exception as exc:  # archivo faltante o imagen corrupta: se usa el fallback
        logger.warning('No se pudo leer la imagen %s del membrete: %s', getattr(campo, 'name', ''), exc)
        return None


def membrete_colegio():
    """Encabezado/pie y datos del colegio, de Configuración (misma fuente que el panel)."""
    from secretaria.models import ConfiguracionSistema
    cfg = ConfiguracionSistema.objects.order_by('id').first()
    if not cfg:
        return {'nombre': '', 'rif': '', 'direccion': '', 'telefono': '', 'municipio_estado': '',
                'afiliacion': '', 'logo': None, 'encabezado': None, 'pie': None}
    return {
        'nombre': cfg.nombre_colegio or '',
        'rif': cfg.rif or '',
        'direccion': cfg.direccion_colegio or '',
        'telefono': cfg.telefono_colegio or '',
        'municipio_estado': ', '.join(x for x in (cfg.municipio, cfg.estado_colegio) if x),
        'afiliacion': cfg.afiliacion_nombre or '',
        'logo': _imagen(cfg.logo_colegio),
        'encabezado': _imagen(cfg.encabezado_personalizado),
        'pie': _imagen(cfg.pie_pagina_personalizado),
    }


# ──────────────────────────────────────────────────────────────────────────────
# DIBUJO
# ──────────────────────────────────────────────────────────────────────────────

def _estilo(nombre, size, bold=False, color=TEXT, align=TA_LEFT):
    return ParagraphStyle(
        nombre, fontName='Helvetica-Bold' if bold else 'Helvetica',
        fontSize=size, leading=size * 1.2, textColor=color, alignment=align,
    )


EST_SECCION = _estilo('seccion', 10, bold=True, color=NAVY, align=TA_CENTER)
EST_COLUMNA = _estilo('columna', 7, align=TA_CENTER)
EST_C = _estilo('c', 7, align=TA_CENTER)
EST_L = _estilo('l', 7)
EST_LB = _estilo('lb', 7, bold=True)
EST_R = _estilo('r', 7, align=TA_RIGHT)
EST_TOTAL = _estilo('total', 11, bold=True, color=RED, align=TA_RIGHT)
EST_SOLVENCIA = _estilo('solvencia', 8, bold=True, color=NAVY)
EST_OBS_TITULO = _estilo('obs_titulo', 12, bold=True, color=NAVY)
EST_OBS = _estilo('obs', 8)


def _p(texto, estilo):
    return Paragraph(escape(str(texto or '')) or '&nbsp;', estilo)


def _estilo_tabla(extra=()):
    return TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.6, BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        *extra,
    ])


class _SelloPagado(Flowable):
    """Sello PAGADO: anillo rojo grueso, anillo interior punteado y el texto
    cruzado en diagonal, como un sello de goma."""

    LADO = 92

    def wrap(self, *_):
        return self.LADO, self.LADO

    def draw(self):
        cv = self.canv
        r = self.LADO / 2
        cv.saveState()
        cv.translate(r, r)
        cv.setStrokeColor(SELLO)
        cv.setLineWidth(2.4)
        cv.circle(0, 0, r - 1.5, stroke=1, fill=0)
        cv.setLineWidth(0.9)
        cv.setDash(1, 1.6)
        cv.circle(0, 0, r - 6, stroke=1, fill=0)
        cv.setDash()
        cv.circle(0, 0, r - 9, stroke=1, fill=0)
        cv.rotate(20)
        cv.setFillColor(SELLO)
        cv.setFont('Helvetica-Bold', 21)
        cv.drawCentredString(0, -7, 'PAGADO', charSpace=2.5)
        cv.restoreState()


class _Pagina:
    """Cursor vertical sobre el A4."""

    def __init__(self, cv):
        self.cv = cv
        self.x = MARGEN_X
        self.ancho = ANCHO_PAGINA - 2 * MARGEN_X
        self.tope = ALTO_PAGINA - MARGEN_SUP
        self.limite = 40
        self.y = self.tope

    def nueva_pagina(self):
        self.cv.showPage()
        self.y = self.tope

    def tabla(self, tabla, separacion=SEPARACION):
        """Dibuja la tabla en el cursor; si no cabe, la parte entre páginas."""
        pendiente = tabla
        while pendiente is not None:
            _, alto = pendiente.wrapOn(self.cv, self.ancho, self.y)
            disponible = self.y - self.limite
            if alto <= disponible:
                pendiente.drawOn(self.cv, self.x, self.y - alto)
                self.y -= alto
                break
            partes = pendiente.split(self.ancho, disponible)
            if len(partes) < 2:
                self.nueva_pagina()
                continue
            primera, pendiente = partes[0], partes[1]
            _, alto = primera.wrapOn(self.cv, self.ancho, disponible)
            primera.drawOn(self.cv, self.x, self.y - alto)
            self.nueva_pagina()
        self.y -= separacion


def _dibujar_encabezado(pag, membrete):
    cv = pag.cv
    if membrete['encabezado']:
        iw, ih = membrete['encabezado'].getSize()
        alto = pag.ancho * ih / iw
        cv.drawImage(membrete['encabezado'], pag.x, pag.y - alto, pag.ancho, alto, mask='auto')
        pag.y -= alto + 22
        return

    # Sin recorte: logo a la izquierda + datos del colegio centrados.
    lineas = ['República Bolivariana de Venezuela', 'Ministerio del Poder Popular para la Educación']
    if membrete['nombre']:
        lineas.append(membrete['nombre'])
    if membrete['afiliacion']:
        lineas.append(f"Afiliado a {membrete['afiliacion']}")
    if membrete['municipio_estado']:
        lineas.append(membrete['municipio_estado'])
    if membrete['telefono']:
        lineas.append(f"Teléfono: {membrete['telefono']}")
    if membrete['rif']:
        lineas.append(membrete['rif'])

    size, alto_linea, lado_logo = 8, 10.7, 70
    alto_texto = alto_linea * len(lineas)
    alto_fila = max(lado_logo, alto_texto)

    if membrete['logo']:
        iw, ih = membrete['logo'].getSize()
        escala = min(lado_logo / iw, lado_logo / ih)
        w, h = iw * escala, ih * escala
        cv.drawImage(membrete['logo'], pag.x, pag.y - (alto_fila + h) / 2, w, h, mask='auto')

    centro = pag.x + pag.ancho / 2
    y = pag.y - (alto_fila - alto_texto) / 2 - size
    cv.setFillColor(TEXT)
    cv.setFont('Helvetica', size)
    for texto in lineas:
        cv.drawCentredString(centro, y, texto)
        y -= alto_linea
    pag.y -= alto_fila + 22


def _dibujar_titulo(pag, d):
    cv = pag.cv
    nro = str(d['nro_recibo'] or '—')
    alto, top = 41, pag.y
    cv.setStrokeColor(CAJA)
    cv.setLineWidth(0.8)
    cv.roundRect(pag.x, top - alto, pag.ancho, alto, 4, stroke=1, fill=0)

    cv.setFillColor(TEXT)
    cv.setFont('Helvetica-Bold', 12)
    cv.drawString(pag.x + 18, top - 17, 'RECIBO DE PAGO - COBRANZA ESCOLAR')
    cv.setFont('Helvetica', 10)
    cv.drawString(pag.x + 18, top - 33, f"Periodo: {d['mes']} {d['anio']}   Fecha: {d['fecha_pago']}")

    x_der = pag.x + pag.ancho - 12
    ancho_nro = cv.stringWidth(nro, 'Helvetica-Bold', 15)
    centro_nro = x_der - ancho_nro / 2
    cv.setFont('Helvetica', 10)
    cv.drawCentredString(centro_nro, top - 14, 'Nº RECIBO')
    cv.setFillColor(NAVY)
    cv.setFont('Helvetica-Bold', 15)
    cv.drawRightString(x_der, top - 32, nro)
    pag.y -= alto + 23


def _tabla_estudiante(pag, d):
    filas = [
        [_p('DATOS DEL ESTUDIANTE Y REPRESENTANTE', EST_SECCION), '', '', ''],
        [_p(t, EST_COLUMNA) for t in ('NOMBRES Y APELLIDOS DEL ESTUDIANTE', 'GRADO',
                                      'REPRESENTANTE', 'C.I. REPRESENTANTE')],
        [_p(d['nombre_estudiante'], EST_C), _p(d['grado'], EST_C),
         _p(d['representante'], EST_C), _p(d['ci_representante'], EST_C)],
    ]
    anchos = [pag.ancho * f for f in (0.358, 0.142, 0.25, 0.25)]
    return Table(filas, colWidths=anchos, rowHeights=[27, 25, None], style=_estilo_tabla([
        ('SPAN', (0, 0), (-1, 0)),
        ('TOPPADDING', (0, 2), (-1, 2), 6),
        ('BOTTOMPADDING', (0, 2), (-1, 2), 6),
    ]))


def _tabla_conceptos(pag, d):
    varios = d['hay_varios_alumnos']
    proporciones = (0.20, 0.24, 0.30, 0.26) if varios else (0.34, 0.374, 0.286)
    anchos = [pag.ancho * f / sum(proporciones) for f in proporciones]
    n = len(anchos)

    encabezados = (['ESTUDIANTE'] if varios else []) + ['CONCEPTO', 'PERIODO', 'MONTO BS.']
    filas = [
        [_p('DETALLE DE CONCEPTOS PAGADOS', EST_SECCION)] + [''] * (n - 1),
        [_p(t, EST_COLUMNA) for t in encabezados],
    ]
    altos = [21, 16]
    total = Decimal('0')
    for it in d['items']:
        monto = _dec(it['monto_ves'])
        total += monto
        fila = [_p(it['alumno'] or '—', EST_L)] if varios else []
        fila += [
            _p(str(it['concepto']).upper(), EST_LB),
            _p(str(it['descripcion']).upper(), EST_C),
            _p(f"Bs. {fmt_bs(monto)}" if monto else '', EST_R),
        ]
        filas.append(fila)
        altos.append(None)
    for _ in range(max(0, 3 - len(d['items']))):
        filas.append([_p('', EST_L)] * n)
        altos.append(22)

    fila_total = len(filas)
    filas.append([_p('TOTAL PAGADO', EST_TOTAL)] + [''] * (n - 2) + [_p(fmt_bs(total), EST_TOTAL)])
    altos.append(23)
    extra = [
        ('SPAN', (0, 0), (-1, 0)),
        ('SPAN', (0, fila_total), (n - 2, fila_total)),
    ]
    if d['numero_solvencia']:
        fila_solv = len(filas)
        filas.append([_p(f"SOLVENCIA: {d['numero_solvencia']}", EST_SOLVENCIA)] + [''] * (n - 1))
        altos.append(None)
        extra.append(('SPAN', (0, fila_solv), (-1, fila_solv)))
    return Table(filas, colWidths=anchos, rowHeights=altos, repeatRows=2, style=_estilo_tabla(extra))


def _tabla_observaciones(pag, d):
    ancho_izq = pag.ancho * 0.714
    celda_izq = [_p('OBSERVACIONES:', EST_OBS_TITULO), _p(d['observaciones'], EST_OBS)]
    _, alto_obs = celda_izq[1].wrap(ancho_izq - 6, ALTO_PAGINA)
    return Table(
        [[celda_izq, _SelloPagado()]],
        colWidths=[ancho_izq, pag.ancho - ancho_izq],
        rowHeights=[max(92, alto_obs + 30)],
        style=_estilo_tabla([
            ('VALIGN', (0, 0), (0, 0), 'TOP'),
            ('TOPPADDING', (0, 0), (0, 0), 6),
            ('ALIGN', (1, 0), (1, 0), 'CENTER'),
        ]),
    )


def _alto_pie(pag, membrete):
    if membrete['pie']:
        iw, ih = membrete['pie'].getSize()
        return pag.ancho * ih / iw
    return 18


def _dibujar_pie(pag, membrete):
    alto = _alto_pie(pag, membrete)
    if pag.y - alto < pag.limite:
        pag.nueva_pagina()
    base = min(BASE_PIE, pag.y - alto)
    cv = pag.cv
    if membrete['pie']:
        cv.drawImage(membrete['pie'], pag.x, base, pag.ancho, alto, mask='auto')
        return
    cv.setStrokeColor(NAVY)
    cv.setLineWidth(0.8)
    cv.line(pag.x, base + alto, pag.x + pag.ancho, base + alto)
    cv.setFillColor(TEXT)
    cv.setFont('Helvetica', 7.5)
    cv.drawCentredString(pag.x + pag.ancho / 2, base + 4, membrete['direccion'])


def generar_pdf_recibo(pago):
    """
    PDF del recibo de cobranza de la operación de `pago` (cualquier fila de la
    operación sirve: se usa siempre el primer pago). Acepta también una lista
    de pagos de la operación. Devuelve un BytesIO al inicio, listo para
    FileResponse o para adjuntar.
    """
    if isinstance(pago, (list, tuple)):
        pago = pago[0]
    d = datos_recibo(pago)
    membrete = membrete_colegio()

    buffer = BytesIO()
    cv = canvas.Canvas(buffer, pagesize=A4)
    cv.setTitle(f"Recibo {d['nro_recibo']}")
    pag = _Pagina(cv)

    _dibujar_encabezado(pag, membrete)
    _dibujar_titulo(pag, d)
    pag.tabla(_tabla_estudiante(pag, d))
    pag.tabla(_tabla_conceptos(pag, d))
    pag.tabla(_tabla_observaciones(pag, d), separacion=0)
    _dibujar_pie(pag, membrete)

    cv.showPage()
    cv.save()
    buffer.seek(0)
    return buffer


def nombre_archivo_recibo(pago):
    return f"Recibo_{numero_recibo(pago).lstrip('#')}.pdf"


# ──────────────────────────────────────────────────────────────────────────────
# ENLACE PÚBLICO (WhatsApp)
# ──────────────────────────────────────────────────────────────────────────────

DIAS_VIGENCIA_ENLACE = 30
_SALT_ENLACE = 'cobranza.recibo-publico'


def firmar_enlace_recibo(pago):
    """Token firmado (SECRET_KEY) con el id del primer pago de la operación."""
    from django.core import signing
    return signing.dumps(pago_principal(pago).id, salt=_SALT_ENLACE, compress=True)


def leer_enlace_recibo(token):
    """id del pago del token, o None si es inválido o venció."""
    from django.core import signing
    try:
        return signing.loads(token, salt=_SALT_ENLACE, max_age=DIAS_VIGENCIA_ENLACE * 24 * 3600)
    except signing.BadSignature:  # incluye SignatureExpired
        return None
