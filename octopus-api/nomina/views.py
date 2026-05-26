from django.http import FileResponse
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from rest_framework.response import Response
from .models import RegistroNomina
from .utils import GeneradorReciboNomina

class ReciboNominaPDFView(APIView):
    permission_classes = [IsAuthenticated]

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