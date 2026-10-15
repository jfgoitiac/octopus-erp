"""Reportes de auditoría — carril B3 (Fase 2). Contrato §4."""
from .views_base import VistaAuditoria, no_implementado


class ReporteVentasAuditoriaView(VistaAuditoria):
    def get(self, request):
        return no_implementado('Fase 2 · B3')


class ReporteExcepcionesView(VistaAuditoria):
    def get(self, request):
        return no_implementado('Fase 2 · B3')


class ReporteInventarioView(VistaAuditoria):
    def get(self, request):
        return no_implementado('Fase 2 · B3')


class ReporteRentabilidadView(VistaAuditoria):
    def get(self, request):
        return no_implementado('Fase 2 · B3')
