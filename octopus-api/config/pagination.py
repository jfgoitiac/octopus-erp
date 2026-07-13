from rest_framework.pagination import PageNumberPagination


class StandardResultsPagination(PageNumberPagination):
    """Paginación estándar reutilizable para listados largos (alumnos, representantes, etc.)."""
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100
