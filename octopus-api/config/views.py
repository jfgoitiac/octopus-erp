from django.db import DatabaseError, connections
from django.http import JsonResponse


def healthcheck(request):
    """Readiness check for the reverse proxy and external monitoring.

    The endpoint is deliberately public and does not reveal implementation
    details. A successful response proves that Django and its primary database
    connection are available.
    """
    try:
        with connections['default'].cursor() as cursor:
            cursor.execute('SELECT 1')
            cursor.fetchone()
    except DatabaseError:
        return JsonResponse({'status': 'unavailable'}, status=503)

    return JsonResponse({'status': 'ok'})
