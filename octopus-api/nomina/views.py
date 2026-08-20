from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework import status
from rest_framework.response import Response
from .models import RegistroNomina, Empleado
from .serializers import EmpleadoSerializer
from .utils import GeneradorReciboNomina
from authentication.views import IsSystemAdminOrDirector

class ReciboNominaPDFView(APIView):
    # IDOR fix: antes solo exigía IsAuthenticated, permitiendo a cualquier
    # usuario logueado (docente, cajero, etc.) descargar el recibo de sueldo
    # de cualquier empleado iterando pago_id. Restringido a roles de RRHH/dirección,
    # igual que EmpleadoViewSet en rrhh/views.py.
    permission_classes = [IsSystemAdminOrDirector]

    def get(self, request, pago_id):
        try:
            # Buscamos el registro de nómina por ID (pago_id según el requerimiento del endpoint)
            registro = RegistroNomina.objects.select_related('empleado').get(id=pago_id)
            pdf_buffer = GeneradorReciboNomina.generar_pdf(registro)
            
            filename = f"Recibo_Nomina_{registro.empleado.cedula}_{registro.mes_correspondiente}_{registro.anio_correspondiente}.pdf"
            
            return FileResponse(
                pdf_buffer,
                as_attachment=False,
                filename=filename,
                content_type='application/pdf'
            )
        except RegistroNomina.DoesNotExist:
            return Response({"error": "El recibo de nómina solicitado no existe."}, status=status.HTTP_404_NOT_FOUND)


class VincularEmpleadoRRHHView(APIView):
    """
    Vincula manualmente un nomina.Empleado con su contraparte en rrhh.Empleado.

    Los dos modelos Empleado (rrhh y nomina) son independientes por diseño
    histórico (ver NOTAS_TECNICAS.md). No existe auto-matcheo automático por
    cédula para evitar cruces incorrectos si hay datos sucios; el vínculo es
    siempre una acción explícita de un administrador.

    POST /api/nomina/empleados/<id>/vincular-rrhh/
    body: {"rrhh_empleado_id": <id de rrhh.Empleado>}
    Para desvincular, enviar {"rrhh_empleado_id": null}.
    """
    permission_classes = [IsSystemAdminOrDirector]

    def post(self, request, empleado_id):
        # Import local para evitar dependencia circular / acoplamiento fuerte
        # entre apps a nivel de módulo.
        from rrhh.models import Empleado as EmpleadoRRHH

        empleado_nomina = get_object_or_404(Empleado, id=empleado_id)
        rrhh_empleado_id = request.data.get('rrhh_empleado_id')

        if rrhh_empleado_id in (None, ''):
            empleado_nomina.empleado_rrhh = None
            empleado_nomina.save(update_fields=['empleado_rrhh'])
            return Response(EmpleadoSerializer(empleado_nomina).data, status=status.HTTP_200_OK)

        empleado_rrhh = get_object_or_404(EmpleadoRRHH, id=rrhh_empleado_id)
        empleado_nomina.empleado_rrhh = empleado_rrhh
        empleado_nomina.save(update_fields=['empleado_rrhh'])
        return Response(EmpleadoSerializer(empleado_nomina).data, status=status.HTTP_200_OK)