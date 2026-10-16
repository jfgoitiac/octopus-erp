"""
Fuente de verdad para el criterio de "saldo negativo sostenido" en cantina.
Un alumno entra en este estado cuando TarjetaPrepago.saldo < 0.
Los dias de recordatorio (por defecto 1, 3 y 7) son configurables en
ParametroCantina.dias_alerta_saldo_negativo.
No genera intereses ni bloquea nada por si mismo -- solo decide CUANDO notificar.
El bloqueo real del pago con tarjeta ya ocurre en el momento de la venta
cuando el saldo proyectado excede `limite_credito` (ver views.RegistrarVentaView).
"""
from datetime import date


def dias_en_negativo(tarjeta):
    if tarjeta.saldo_negativo_desde is None:
        return 0
    return (date.today() - tarjeta.saldo_negativo_desde).days


def cuentas_cxc_morosas(dias_min=None):
    """Titulares de CxC (representantes y clientes generales) con deuda pendiente.

    Los clientes generales (personal/otros) entran al listado pero NO reciben
    avisos automáticos: `recibe_avisos` es False para ellos. Cualquier tarea de
    notificación futura debe filtrar por ese campo (ver NOTAS_TECNICAS.md)."""
    from django.utils import timezone

    from .models import CargoCantina

    pendientes = (
        CargoCantina.objects.filter(estado='pendiente')
        .select_related('representante', 'cliente')
    )
    por_titular = {}
    ahora = timezone.now()
    for cargo in pendientes:
        if cargo.cliente_id:
            titular = cargo.cliente
            tipo = titular.tipo
            nombre, doc, tel = titular.nombre_completo, titular.documento or '', titular.telefono
            clave = (tipo, cargo.cliente_id)
        else:
            titular = cargo.representante
            tipo = 'representante'
            nombre, doc, tel = f'{titular.nombre} {titular.apellido}'.strip(), titular.cedula, titular.telefono
            clave = (tipo, cargo.representante_id)
        fila = por_titular.setdefault(clave, {
            'tipo': tipo, 'id': clave[1], 'nombre': nombre, 'documento': doc, 'telefono': tel,
            'saldo_usd': 0, 'desde': cargo.creado_en, 'recibe_avisos': tipo == 'representante',
        })
        fila['saldo_usd'] += cargo.saldo_usd
        fila['desde'] = min(fila['desde'], cargo.creado_en)

    filas = []
    for fila in por_titular.values():
        fila['dias_deuda_mas_antigua'] = max((ahora - fila.pop('desde')).days, 0)
        fila['saldo_usd'] = str(fila['saldo_usd'])
        if dias_min is None or fila['dias_deuda_mas_antigua'] >= dias_min:
            filas.append(fila)
    filas.sort(key=lambda f: f['dias_deuda_mas_antigua'], reverse=True)
    return filas


def debe_notificarse_hoy(tarjeta, dias_configurados):
    return dias_en_negativo(tarjeta) in dias_configurados


def parsear_dias_configurados(cadena):
    """Convierte el string de ParametroCantina.dias_alerta_saldo_negativo
    (ej. '1, 3,7,') en una lista de enteros, tolerando espacios y tokens
    vacios. Un token no numerico (typo en la config) se ignora en silencio
    en vez de romper la tarea Celery que consume este valor."""
    dias = []
    for token in (cadena or '').split(','):
        token = token.strip()
        if not token:
            continue
        try:
            dias.append(int(token))
        except ValueError:
            continue
    return dias
