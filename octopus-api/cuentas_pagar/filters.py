from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

SITUACIONES = ('vencida', 'vence_hoy', 'por_vencer', 'al_dia')


def _ventana_por_vencer():
    from .models import ConfiguracionRecordatorios
    cfg = ConfiguracionRecordatorios.objects.first()
    return cfg.ventana_por_vencer if cfg else 7


def filtrar_por_situacion(queryset, situacion, hoy=None):
    """Replica en BD la clasificación de services.situacion (misma ventana configurable).

    Solo las cuentas abiertas (no pagadas ni anuladas) tienen situación de vencimiento;
    'pagada' y 'anulada' se aceptan como valores y filtran por estado.
    """
    if situacion in ('pagada', 'anulada'):
        return queryset.filter(estado=situacion)
    if situacion not in SITUACIONES:
        return queryset.none()
    hoy = hoy or timezone.localdate()
    abiertas = queryset.exclude(estado__in=('pagada', 'anulada'))
    limite = hoy + timedelta(days=_ventana_por_vencer())
    if situacion == 'vencida':
        return abiertas.filter(fecha_vencimiento__lt=hoy)
    if situacion == 'vence_hoy':
        return abiertas.filter(fecha_vencimiento=hoy)
    if situacion == 'por_vencer':
        return abiertas.filter(fecha_vencimiento__gt=hoy, fecha_vencimiento__lte=limite)
    return abiertas.filter(fecha_vencimiento__gt=limite)


def filtrar_cuentas(queryset, params):
    for campo in ('sede','estado','proveedor','categoria','prioridad','moneda'):
        if params.get(campo): queryset=queryset.filter(**{campo:params[campo]})
    if params.get('situacion'): queryset=filtrar_por_situacion(queryset, params['situacion'])
    if params.get('desde'): queryset=queryset.filter(fecha_vencimiento__gte=params['desde'])
    if params.get('hasta'): queryset=queryset.filter(fecha_vencimiento__lte=params['hasta'])
    if params.get('q'): queryset=queryset.filter(Q(numero__icontains=params['q'])|Q(concepto__icontains=params['q']))
    return queryset


def filtrar_plantillas(queryset, params):
    for campo in ('sede', 'proveedor'):
        if params.get(campo): queryset = queryset.filter(**{campo: params[campo]})
    activa = params.get('activa')
    if activa is not None and activa != '':
        queryset = queryset.filter(activa=str(activa).lower() in ('1', 'true', 'si', 'on'))
    return queryset
