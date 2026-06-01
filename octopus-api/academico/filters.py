import django_filters
from .models import Nota, Asistencia


class NotaFilter(django_filters.FilterSet):
    """
    Filtros avanzados para el modelo Nota.

    Query params disponibles:
      - alumno_id        : ID numérico del alumno
      - grado_seccion    : Grado/sección exacto (insensible a mayúsculas), ej. "1ro A"
      - materia_id       : ID numérico de la materia
      - lapso_id         : ID numérico del lapso
      - periodo_escolar  : Período escolar del lapso, ej. "2024-2025"
      - aprobado         : true/false — definitiva >= 10 o < 10
      - definitiva_min   : Nota mínima (inclusiva)
      - definitiva_max   : Nota máxima (inclusiva)
    """

    alumno_id       = django_filters.NumberFilter(field_name='alumno__id')
    grado_seccion   = django_filters.CharFilter(
        field_name='alumno__grado_seccion', lookup_expr='iexact'
    )
    materia_id      = django_filters.NumberFilter(field_name='materia__id')
    lapso_id        = django_filters.NumberFilter(field_name='lapso__id')
    periodo_escolar = django_filters.CharFilter(field_name='lapso__periodo_escolar')
    aprobado        = django_filters.BooleanFilter(method='filter_aprobado')
    definitiva_min  = django_filters.NumberFilter(field_name='definitiva', lookup_expr='gte')
    definitiva_max  = django_filters.NumberFilter(field_name='definitiva', lookup_expr='lte')

    def filter_aprobado(self, queryset, name, value):
        if value:
            return queryset.filter(definitiva__gte=10)
        return queryset.filter(definitiva__lt=10)

    class Meta:
        model = Nota
        fields = ['alumno_id', 'materia_id', 'lapso_id']


class AsistenciaFilter(django_filters.FilterSet):
    """
    Filtros avanzados para el modelo Asistencia.

    Query params disponibles:
      - alumno_id    : ID numérico del alumno
      - grado_seccion: Grado/sección exacto (insensible a mayúsculas)
      - fecha_desde  : Fecha de inicio del rango (YYYY-MM-DD)
      - fecha_hasta  : Fecha de fin del rango (YYYY-MM-DD)
      - mes          : Número de mes (1-12)
      - anio         : Año (ej. 2025)
      - presente     : true/false
      - justificada  : true/false
    """

    alumno_id    = django_filters.NumberFilter(field_name='alumno__id')
    grado_seccion = django_filters.CharFilter(
        field_name='alumno__grado_seccion', lookup_expr='iexact'
    )
    fecha_desde  = django_filters.DateFilter(field_name='fecha', lookup_expr='gte')
    fecha_hasta  = django_filters.DateFilter(field_name='fecha', lookup_expr='lte')
    mes          = django_filters.NumberFilter(field_name='fecha__month')
    anio         = django_filters.NumberFilter(field_name='fecha__year')
    presente     = django_filters.BooleanFilter()
    justificada  = django_filters.BooleanFilter()

    class Meta:
        model = Asistencia
        fields = ['alumno_id', 'presente', 'justificada']
