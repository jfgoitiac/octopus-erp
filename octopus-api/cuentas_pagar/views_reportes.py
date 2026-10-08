from rest_framework.response import Response
from rest_framework.views import APIView

from . import reportes
from .permissions import PuedeVerCxP


class BaseReporteCxP(APIView):
    permission_classes = (PuedeVerCxP,)
    def parametros(self):
        return {**{k: self.request.query_params.get(k) for k in ('sede', 'desde', 'hasta')}, 'usuario': self.request.user}


class TableroCxPView(BaseReporteCxP):
    def get(self, request): return Response(reportes.tablero(**self.parametros()))


class CalendarioCxPView(BaseReporteCxP):
    def get(self, request): return Response(reportes.calendario(**self.parametros()))


class ProyeccionCxPView(BaseReporteCxP):
    def get(self, request): return Response(reportes.proyeccion(**self.parametros()))


class EstadoProveedorCxPView(BaseReporteCxP):
    def get(self, request, proveedor_id): return Response(reportes.estado_proveedor(proveedor_id, sede=self.request.query_params.get('sede'), usuario=self.request.user))


class ReporteCxPView(BaseReporteCxP):
    def get(self, request, nombre):
        try:
            parametros = self.parametros()
            return Response(reportes.reporte(nombre, proveedor=request.query_params.get('proveedor'), corte=request.query_params.get('corte'), **parametros))
        except ValueError:
            return Response({'detalle': 'Informe no válido'}, status=404)
