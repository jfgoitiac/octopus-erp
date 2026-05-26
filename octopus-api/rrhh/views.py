from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.http import HttpResponse
from django.utils import timezone
from decimal import Decimal, InvalidOperation

from .models import Empleado
from .serializers import EmpleadoSerializer
from cobranza.models import TasaCambio
from authentication.views import IsSystemAdminOrDirector


class EmpleadoViewSet(viewsets.ModelViewSet):
    queryset = Empleado.objects.all()
    serializer_class = EmpleadoSerializer
    # CORRECCIÓN 1: solo un permiso — IsSystemAdminOrDirector
    # ya incluye la verificación de autenticación internamente
    permission_classes = [IsSystemAdminOrDirector]

    def get_queryset(self):
        if not self.request.user.is_authenticated:
            return Empleado.objects.none()
        return Empleado.objects.filter(activo=True)

    @action(detail=False, methods=['get'])
    def exportar_txt(self, request):
        try:
            tasa_actual = TasaCambio.objects.latest('fecha').valor_bs
        except TasaCambio.DoesNotExist:
            return Response(
                {"error": "No se ha registrado ninguna tasa de cambio."},
                status=status.HTTP_400_BAD_REQUEST
            )

        empleados = self.get_queryset()
        lines = []

        for emp in empleados:
            try:
                # CORRECCIÓN 2: protección contra sueldo_base nulo
                sueldo = Decimal(str(emp.sueldo_base or 0))
                monto_bs = (sueldo * tasa_actual).quantize(Decimal('0.01'))
                line = (
                    f"{emp.cedula};"
                    f"{emp.nombre} {emp.apellido};"
                    f"{monto_bs};"
                    f"PAGO NOMINA {timezone.now().strftime('%Y-%m')}"
                )
                lines.append(line)
            except (InvalidOperation, TypeError):
                # Si un empleado tiene datos corruptos, lo saltamos
                # sin romper toda la exportación
                continue

        content = "\n".join(lines)
        response = HttpResponse(content, content_type='text/plain')
        response['Content-Disposition'] = (
            f'attachment; filename="NOMINA_OCTOPUS_'
            f'{timezone.now().strftime("%Y%m%d")}.txt"'
        )
        return response

    @action(detail=False, methods=['get'])
    def get_choices(self, request):
        return Response(
            {"cargos": ["Profesor", "Administrativo", "Mantenimiento", "Director"]},
            status=status.HTTP_200_OK
        )