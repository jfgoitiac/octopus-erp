from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from portal.authentication import PortalJWTAuthentication
from secretaria.models import Alumno

from .services import calcular_rendimiento_alumno


class RendimientoAlumnoPortalView(APIView):
    """GET — rendimiento de un hijo del representante autenticado.
    Solo devuelve datos si el alumno pertenece a ese representante."""
    authentication_classes = [PortalJWTAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, alumno_id):
        rep = request.user.representante_portal.representante
        try:
            alumno = Alumno.objects.get(pk=alumno_id, representante=rep)
        except Alumno.DoesNotExist:
            return Response(
                {'error': 'Este alumno no está disponible para tu cuenta.'},
                status=status.HTTP_404_NOT_FOUND
            )
        return Response(calcular_rendimiento_alumno(alumno))
