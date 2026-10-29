"""
Plantillas de aviso al representante (comprobante aprobado / rechazado).

Texto plano con tokens `{{grupo.campo}}`, mismo esquema de reemplazo que
notificaciones/cobro_whatsapp.py. El texto sale de `PlantillaAviso` (lo
edita el colegio); si la fila falta o está inactiva se usa
`TEXTOS_POR_DEFECTO`, así un aviso nunca sale vacío.
"""
from decimal import Decimal

TOKENS_AVISO = [
    {'token': '{{representante.nombre}}', 'etiqueta': 'Nombre del representante'},
    {'token': '{{alumno.nombre}}', 'etiqueta': 'Nombre del alumno'},
    {'token': '{{mensualidad}}', 'etiqueta': 'Mensualidad (mes y año)'},
    {'token': '{{monto}}', 'etiqueta': 'Monto'},
    {'token': '{{referencia}}', 'etiqueta': 'Referencia del pago'},
    {'token': '{{motivo}}', 'etiqueta': 'Motivo del rechazo'},
    {'token': '{{colegio.nombre}}', 'etiqueta': 'Nombre del colegio'},
    {'token': '{{portal.link}}', 'etiqueta': 'Enlace al portal'},
]

# Copiados en la migración 0014 (semilla). Si se cambian aquí, las filas ya
# sembradas no cambian: este texto solo se usa cuando la plantilla falta o
# está inactiva.
TEXTOS_POR_DEFECTO = {
    'comprobante_rechazado': {
        'nombre': 'Comprobante rechazado',
        'asunto': 'Su comprobante de {{mensualidad}} fue rechazado',
        'cuerpo': (
            'Hola {{representante.nombre}}:\n\n'
            'Revisamos el comprobante que nos envió para la mensualidad de '
            '{{mensualidad}} de {{alumno.nombre}} y, por ahora, no pudimos aprobarlo.\n\n'
            'Motivo: {{motivo}}\n\n'
            'Puede enviarnos un nuevo comprobante desde el portal cuando lo tenga listo: '
            '{{portal.link}}\n\n'
            'Si tiene alguna duda, escríbanos y con gusto le ayudamos.\n\n'
            '{{colegio.nombre}}'
        ),
    },
    'comprobante_aprobado': {
        'nombre': 'Comprobante aprobado',
        'asunto': 'Recibimos su pago de {{mensualidad}}',
        'cuerpo': (
            'Hola {{representante.nombre}}:\n\n'
            '¡Gracias! Aprobamos su comprobante de {{mensualidad}} de {{alumno.nombre}} '
            'por {{monto}} (referencia {{referencia}}).\n\n'
            'Puede ver el detalle y su estado de cuenta en el portal: {{portal.link}}\n\n'
            '{{colegio.nombre}}'
        ),
    },
}


def plantilla_vigente(clave):
    """(asunto, cuerpo) de la plantilla activa, o el texto por defecto."""
    from .models import PlantillaAviso
    plantilla = PlantillaAviso.objects.filter(clave=clave, activa=True).first()
    if plantilla and (plantilla.asunto or '').strip() and (plantilla.cuerpo or '').strip():
        return plantilla.asunto, plantilla.cuerpo
    defecto = TEXTOS_POR_DEFECTO[clave]
    return defecto['asunto'], defecto['cuerpo']


def renderizar_texto(texto, valores):
    """Reemplaza cada token conocido por su valor (vacío si no viene)."""
    for item in TOKENS_AVISO:
        token = item['token']
        texto = texto.replace(token, str(valores.get(token, '') or ''))
    return texto


def renderizar_aviso(clave, valores):
    """(asunto, cuerpo) ya renderizados para `clave` con `valores`
    ({'{{token}}': valor})."""
    asunto, cuerpo = plantilla_vigente(clave)
    return renderizar_texto(asunto, valores).strip(), renderizar_texto(cuerpo, valores).strip()


def valores_comprobante(comprobante):
    """Tokens de un ComprobantePago ya resuelto. `{{monto}}` es, si fue
    aprobado en caja, lo abonado a SU mensualidad en esa operación (o el total
    del pago si no hay aplicación registrada); si no, el saldo pendiente."""
    from cobranza.deudas import saldo_deuda
    from cobranza.recibo_cobranza import fmt_bs
    from .services import _config_colegio

    mensualidad = comprobante.mensualidad
    alumno = mensualidad.alumno
    rep = alumno.representante
    cfg = _config_colegio()
    if comprobante.estatus == 'aprobado' and comprobante.pago_id:
        from cobranza.deudas import aplicaciones_operacion
        abono = next((
            a.monto_abonado_usd for a in aplicaciones_operacion(comprobante.pago)
            if a.content_type.model == 'mensualidad' and a.object_id == mensualidad.id
        ), None)
        monto = abono if abono is not None else comprobante.pago.monto_usd
    else:
        monto = saldo_deuda(mensualidad)
    referencia = comprobante.referencia_bancaria or (
        comprobante.pago.referencia if comprobante.pago_id else ''
    )
    return {
        '{{representante.nombre}}': f'{rep.nombre} {rep.apellido}'.strip(),
        '{{alumno.nombre}}': f'{alumno.nombre} {alumno.apellido}'.strip(),
        '{{mensualidad}}': f'{mensualidad.get_mes_display()} {mensualidad.anio}',
        '{{monto}}': f'REF. {fmt_bs(Decimal(str(monto or 0)))}',
        '{{referencia}}': referencia or '',
        '{{motivo}}': comprobante.observaciones or '',
        '{{colegio.nombre}}': cfg['nombre_colegio'],
        '{{portal.link}}': cfg['portal_url'],
    }
