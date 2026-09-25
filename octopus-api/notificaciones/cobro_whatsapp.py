"""
Servicio de cobranza por WhatsApp: agrupa la mora por representante (un
representante con varios hijos recibe UN solo mensaje, no uno por hijo) y
renderiza plantillas de texto plano con tokens {{grupo.campo}}.

Reutiliza cobranza/mora.py como fuente de verdad única del cálculo de mora
-- este módulo no vuelve a calcular montos, solo agrupa y da formato.
"""
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from .services import _config_colegio

TOKENS_DISPONIBLES = [
    {'token': '{{representante.nombre}}', 'etiqueta': 'Nombre del representante',
     'boton': '+ Nombre del representante'},
    {'token': '{{alumno.nombre}}', 'etiqueta': 'Nombre del alumno',
     'boton': '+ Nombre del alumno'},
    {'token': '{{monto}}', 'etiqueta': 'Monto que debe', 'boton': '+ Monto que debe'},
    {'token': '{{meses}}', 'etiqueta': 'Meses que debe', 'boton': '+ Meses que debe'},
    {'token': '{{dias_atraso}}', 'etiqueta': 'Días de atraso', 'boton': '+ Días de atraso'},
    {'token': '{{colegio.nombre}}', 'etiqueta': 'Nombre del colegio', 'boton': '+ Nombre del colegio'},
    {'token': '{{portal.link}}', 'etiqueta': 'Enlace al portal', 'boton': '+ Enlace al portal'},
    {'token': '{{datos_bancarios}}', 'etiqueta': 'Datos bancarios', 'boton': '+ Datos bancarios'},
]


def _datos_bancarios_texto():
    from cobranza.models import BancoInstitucional
    bancos = BancoInstitucional.objects.filter(activo=True)
    if not bancos:
        return ''
    lineas = ['*Datos bancarios*']
    for b in bancos:
        tipos = ', '.join(b.tipos or []) or 'Transferencia'
        cuenta = f' — {b.numero_cuenta}' if b.numero_cuenta else ''
        lineas.append(f'{b.nombre} ({tipos}){cuenta}')
    return '\n'.join(lineas)


def agrupar_morosos_por_representante(alumnos_anotados, hoy=None):
    """
    Recibe un queryset/lista ya anotado con cobranza.mora.annotate_mora_detalle
    (mismo criterio que ListaMorososView) y agrupa por representante.
    Devuelve una lista de dicts, uno por representante con deuda.
    """
    from cobranza.mora import calcular_dias_atraso

    grupos = {}
    orden = []
    for a in alumnos_anotados:
        rep = a.representante
        if rep is None:
            continue
        cedula = rep.cedula
        if cedula not in grupos:
            grupos[cedula] = {
                'representante_cedula': cedula,
                'representante_nombre': f'{rep.nombre} {rep.apellido}',
                'representante_telefono': rep.telefono or '',
                'alumnos': [],
                'monto_total': Decimal('0.00'),
                'meses_total': 0,
                'dias_atraso_max': 0,
            }
            orden.append(cedula)
        dias_atraso = calcular_dias_atraso(a, hoy)
        grupo = grupos[cedula]
        grupo['alumnos'].append({
            'nombre': f'{a.nombre} {a.apellido}',
            'monto_adeudado': a.monto_adeudado,
            'meses_adeudados': a.meses_adeudados,
            'dias_atraso': dias_atraso,
        })
        grupo['monto_total'] += a.monto_adeudado
        grupo['meses_total'] += a.meses_adeudados
        grupo['dias_atraso_max'] = max(grupo['dias_atraso_max'], dias_atraso)

    return [grupos[c] for c in orden]


def renderizar_mensaje_cobro(grupo, plantilla):
    """
    Reemplaza los tokens de `plantilla.cuerpo` con los datos reales del
    grupo (salida de agrupar_morosos_por_representante). El frontend nunca
    calcula montos: todo sale de aquí.
    """
    cfg = _config_colegio()
    nombres_alumnos = [al['nombre'] for al in grupo['alumnos']]
    if len(nombres_alumnos) <= 1:
        alumno_texto = nombres_alumnos[0] if nombres_alumnos else ''
    else:
        alumno_texto = ', '.join(nombres_alumnos[:-1]) + ' y ' + nombres_alumnos[-1]

    reemplazos = {
        '{{representante.nombre}}': grupo['representante_nombre'],
        '{{alumno.nombre}}': alumno_texto,
        '{{monto}}': f"${grupo['monto_total']:.2f} USD",
        '{{meses}}': str(grupo['meses_total']),
        '{{dias_atraso}}': str(grupo['dias_atraso_max']),
        '{{colegio.nombre}}': cfg['nombre_colegio'],
        '{{portal.link}}': cfg['portal_url'],
        '{{datos_bancarios}}': _datos_bancarios_texto(),
    }
    mensaje = plantilla.cuerpo
    for token, valor in reemplazos.items():
        mensaje = mensaje.replace(token, valor)
    return mensaje


def hubo_envio_reciente(representante_cedula, horas=24):
    from .models import NotificacionLog
    limite = timezone.now() - timedelta(hours=horas)
    return NotificacionLog.objects.filter(
        canal='whatsapp', tipo='cobro_whatsapp',
        representante_cedula=representante_cedula,
        fecha_envio__gte=limite,
    ).exists()


def ultimo_envio(representante_cedula):
    from .models import NotificacionLog
    return NotificacionLog.objects.filter(
        canal='whatsapp', tipo='cobro_whatsapp',
        representante_cedula=representante_cedula,
    ).order_by('-fecha_envio').first()
