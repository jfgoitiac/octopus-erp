from cobranza.permissions import filtrar_por_sede


def egresos_visibles(usuario, queryset):
    """Un get sobre este queryset devuelve 404 si la sede no es visible."""
    return filtrar_por_sede(usuario, queryset, 'sede')
