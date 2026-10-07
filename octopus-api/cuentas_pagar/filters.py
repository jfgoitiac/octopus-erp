from django.db.models import Q

def filtrar_cuentas(queryset, params):
    for campo in ('sede','estado','proveedor','categoria','prioridad','moneda'):
        if params.get(campo): queryset=queryset.filter(**{campo:params[campo]})
    if params.get('desde'): queryset=queryset.filter(fecha_vencimiento__gte=params['desde'])
    if params.get('hasta'): queryset=queryset.filter(fecha_vencimiento__lte=params['hasta'])
    if params.get('q'): queryset=queryset.filter(Q(numero__icontains=params['q'])|Q(concepto__icontains=params['q']))
    return queryset
