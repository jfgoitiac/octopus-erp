import django_filters
from .models import Pago, Mensualidad


class PagoFilter(django_filters.FilterSet):
    """
    Filtros avanzados para el modelo Pago.

    Query params disponibles:
      - alumno_id               : ID numérico del alumno
      - grado_seccion           : Grado/sección exacto (insensible a mayúsculas)
      - fecha_desde             : Fecha/hora inicio (YYYY-MM-DD o YYYY-MM-DDTHH:MM)
      - fecha_hasta             : Fecha/hora fin (YYYY-MM-DD o YYYY-MM-DDTHH:MM)
      - metodo_pago             : transferencia | pago_movil | punto_de_venta | zelle | efectivo | efectivo_ves
      - estatus                 : completado | anulado | en_revision
      - concepto                : mensualidad | inscripcion | materiales | actividades | multa | otro
      - monto_min               : Monto USD mínimo (inclusivo)
      - monto_max               : Monto USD máximo (inclusivo)
      - representante_documento : Búsqueda parcial (icontains) en cédula/doc. del representante
    """

    alumno_id               = django_filters.NumberFilter(field_name='alumno__id')
    grado_seccion           = django_filters.CharFilter(
        field_name='alumno__grado_seccion', lookup_expr='iexact'
    )
    fecha_desde             = django_filters.DateTimeFilter(
        field_name='fecha_pago', lookup_expr='gte'
    )
    fecha_hasta             = django_filters.DateTimeFilter(
        field_name='fecha_pago', lookup_expr='lte'
    )
    metodo_pago             = django_filters.ChoiceFilter(choices=Pago.METODOS)
    estatus                 = django_filters.ChoiceFilter(choices=Pago.ESTATUS_PAGO)
    concepto                = django_filters.ChoiceFilter(choices=Pago.CONCEPTOS)
    monto_min               = django_filters.NumberFilter(
        field_name='monto_usd', lookup_expr='gte'
    )
    monto_max               = django_filters.NumberFilter(
        field_name='monto_usd', lookup_expr='lte'
    )
    representante_documento = django_filters.CharFilter(lookup_expr='icontains')

    class Meta:
        model = Pago
        fields = ['alumno_id', 'metodo_pago', 'estatus', 'concepto']


class MensualidadFilter(django_filters.FilterSet):
    """
    Filtros avanzados para el modelo Mensualidad.

    Query params disponibles:
      - alumno_id   : ID numérico del alumno
      - grado_seccion: Grado/sección exacto (insensible a mayúsculas)
      - mes         : Número de mes (1-12)
      - anio        : Año (ej. 2025)
      - pagado      : true/false
      - monto_min   : Monto USD mínimo (inclusivo)
      - monto_max   : Monto USD máximo (inclusivo)
    """

    alumno_id    = django_filters.NumberFilter(field_name='alumno__id')
    grado_seccion = django_filters.CharFilter(
        field_name='alumno__grado_seccion', lookup_expr='iexact'
    )
    mes          = django_filters.NumberFilter()
    anio         = django_filters.NumberFilter()
    pagado       = django_filters.BooleanFilter()
    monto_min    = django_filters.NumberFilter(field_name='monto_usd', lookup_expr='gte')
    monto_max    = django_filters.NumberFilter(field_name='monto_usd', lookup_expr='lte')

    class Meta:
        model = Mensualidad
        fields = ['alumno_id', 'mes', 'anio', 'pagado']
