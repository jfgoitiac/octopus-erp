from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import reportes


class BaseReporteCxP(APIView):
    permission_classes = (IsAuthenticated,)
    def parametros(self): return {k: self.request.query_params.get(k) for k in ('sede', 'desde', 'hasta')}


class TableroCxPView(BaseReporteCxP):
    def get(self, request): return Response(reportes.tablero(**self.parametros()))


class CalendarioCxPView(BaseReporteCxP):
    def get(self, request): return Response(reportes.calendario(**self.parametros()))


class ProyeccionCxPView(BaseReporteCxP):
    def get(self, request): return Response(reportes.proyeccion(**self.parametros()))


class EstadoProveedorCxPView(BaseReporteCxP):
    def get(self, request, proveedor_id): return Response(reportes.estado_proveedor(proveedor_id, **self.parametros()))


class ReporteCxPView(BaseReporteCxP):
    def get(self, request, nombre):
        try:
            return Response(reportes.reporte(nombre, proveedor=request.query_params.get('proveedor'), corte=request.query_params.get('corte'), **self.parametros()))
        except ValueError:
            return Response({'detalle': 'Informe no válido'}, status=404)
