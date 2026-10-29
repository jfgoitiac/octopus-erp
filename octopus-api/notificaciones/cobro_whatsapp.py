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

from .services import _config_colegio, montos_ref

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
    {'token': '{{recargo.aviso}}', 'etiqueta': 'Recordatorio para evitar recargos',
     'boton': '+ Aviso de recargo'},
    {'token': '{{mensualidades.detalle}}', 'etiqueta': 'Detalle de mensualidades pendientes',
     'boton': '+ Detalle de mensualidades'},
    {'token': '{{subtotal.principal}}', 'etiqueta': 'Subtotal de mensualidades',
     'boton': '+ Subtotal mensualidades'},
    {'token': '{{subtotal.recargos}}', 'etiqueta': 'Subtotal de recargos',
     'boton': '+ Subtotal recargos'},
    {'token': '{{total.final}}', 'etiqueta': 'Total final adeudado', 'boton': '+ Total final'},
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

    Los montos del grupo se suman a partir de los mismos renglones que el
    mensaje detalla (mensualidades vencidas con su recargo + inscripciones
    impagas), así `{{total.final}}` siempre cuadra con `{{mensualidades.detalle}}`.
    Las mensualidades son las vencidas según cobranza.mora.q_mensualidad_vencida
    (la cuota del mes que todavía no vence no se cobra).
    """
    from cobranza.mora import calcular_dias_atraso, q_mensualidad_vencida
    from cobranza.models import CuotaInscripcion, Mensualidad
    from cobranza.recargos import resolver_recargo
    from django.db.models import F
    hoy = hoy or timezone.localdate()
    alumnos = list(alumnos_anotados)
    pendientes = (
        Mensualidad.objects.filter(alumno__in=alumnos).filter(q_mensualidad_vencida(hoy))
        .filter(monto_usd__gt=F('monto_pagado'))
        .select_related('alumno').prefetch_related('lineas_recargo').order_by('anio', 'mes')
    )
    mensualidades_por_alumno = {}
    cache_reglas = {}
    for mensualidad in pendientes:
        recargo = resolver_recargo(mensualidad, hoy, _cache_reglas=cache_reglas)
        mensualidades_por_alumno.setdefault(mensualidad.alumno_id, []).append({
            'mes': mensualidad.get_mes_display(), 'anio': mensualidad.anio,
            'principal_usd': mensualidad.monto_usd - mensualidad.monto_pagado,
            'recargo_usd': recargo['monto_usd'] if recargo else Decimal('0.00'),
        })
    otros_por_alumno = {}
    inscripciones = CuotaInscripcion.objects.filter(
        alumno__in=alumnos, pagado=False, monto_usd__gt=F('monto_pagado'))
    for cuota in inscripciones:
        otros_por_alumno.setdefault(cuota.alumno_id, []).append({
            'concepto': f'Inscripción {cuota.periodo_escolar}'.strip(),
            'saldo_usd': cuota.monto_usd - cuota.monto_pagado,
        })

    grupos = {}
    orden = []
    for a in alumnos:
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
                'subtotal_principal': Decimal('0.00'),
                'subtotal_recargos': Decimal('0.00'),
                'subtotal_otros': Decimal('0.00'),
                'mensualidades': [],
                'otros': [],
            }
            orden.append(cedula)
        nombre = f'{a.nombre} {a.apellido}'
        dias_atraso = calcular_dias_atraso(a, hoy)
        grupo = grupos[cedula]
        mensualidades = mensualidades_por_alumno.get(a.id, [])
        otros = otros_por_alumno.get(a.id, [])
        monto_alumno = (
            sum((m['principal_usd'] + m['recargo_usd'] for m in mensualidades), Decimal('0.00'))
            + sum((o['saldo_usd'] for o in otros), Decimal('0.00'))
        )
        grupo['alumnos'].append({
            'nombre': nombre,
            'monto_adeudado': monto_alumno,
            'meses_adeudados': len(mensualidades),
            'dias_atraso': dias_atraso,
        })
        grupo['monto_total'] += monto_alumno
        grupo['meses_total'] += len(mensualidades)
        grupo['dias_atraso_max'] = max(grupo['dias_atraso_max'], dias_atraso)
        for mensualidad in mensualidades:
            mensualidad['alumno'] = nombre
            grupo['mensualidades'].append(mensualidad)
            grupo['subtotal_principal'] += mensualidad['principal_usd']
            grupo['subtotal_recargos'] += mensualidad['recargo_usd']
        for otro in otros:
            otro['alumno'] = nombre
            grupo['otros'].append(otro)
            grupo['subtotal_otros'] += otro['saldo_usd']

    return [grupos[c] for c in orden]


def _monto_cobro(monto_usd):
    """'REF. 100,00 (Bs. 4.050,00)': mismo formato REF. + bolívares a la
    tasa BCV vigente que el portal y los avisos de mora."""
    m = montos_ref(monto_usd)
    return f"{m['monto_ref']} ({m['monto_bs']})" if m['monto_bs'] else m['monto_ref']


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

    renglones = [
        f"• {m['alumno']} — {m['mes']} {m['anio']}: {_monto_cobro(m['principal_usd'])}"
        + (f" + recargo {_monto_cobro(m['recargo_usd'])}" if m['recargo_usd'] else '')
        for m in grupo.get('mensualidades', [])
    ]
    # Inscripción impaga: forma parte del total, así que también va en el detalle.
    renglones += [
        f"• {o['alumno']} — {o['concepto']}: {_monto_cobro(o['saldo_usd'])}"
        for o in grupo.get('otros', [])
    ]
    detalle_mensualidades = '\n'.join(renglones) or 'No hay mensualidades vencidas detallables.'
    reemplazos = {
        '{{representante.nombre}}': grupo['representante_nombre'],
        '{{alumno.nombre}}': alumno_texto,
        '{{monto}}': _monto_cobro(grupo['monto_total']),
        '{{meses}}': str(grupo['meses_total']),
        '{{dias_atraso}}': str(grupo['dias_atraso_max']),
        '{{colegio.nombre}}': cfg['nombre_colegio'],
        '{{portal.link}}': cfg['portal_url'],
        '{{datos_bancarios}}': _datos_bancarios_texto(),
        # El aviso se agrega al final para que no interrumpa el detalle ni el total.
        '{{recargo.aviso}}': '',
        '{{mensualidades.detalle}}': detalle_mensualidades,
        '{{subtotal.principal}}': _monto_cobro(grupo.get('subtotal_principal', Decimal('0.00'))),
        '{{subtotal.recargos}}': _monto_cobro(grupo.get('subtotal_recargos', Decimal('0.00'))),
        '{{total.final}}': _monto_cobro(grupo['monto_total']),
    }
    mensaje = plantilla.cuerpo
    for token, valor in reemplazos.items():
        mensaje = mensaje.replace(token, valor)
    recordatorio = 'Paga a tiempo para evitar recargos.'
    if recordatorio not in mensaje:
        mensaje = f"{mensaje.rstrip()}\n\n{recordatorio}"
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
