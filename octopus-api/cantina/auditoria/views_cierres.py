"""Cierres diarios y su revisión — carril B2 (Fase 1). Contrato §3."""
from .views_base import VistaAuditoria, no_implementado


class CierresListView(VistaAuditoria):
    def get(self, request):
        return no_implementado('Fase 1 · B2')


class CierreDetalleView(VistaAuditoria):
    def get(self, request, pk):
        return no_implementado('Fase 1 · B2')


class RevisarCierreView(VistaAuditoria):
    def post(self, request, pk):
        return no_implementado('Fase 1 · B2')


class AdjuntosCierreView(VistaAuditoria):
    def post(self, request, pk):
        return no_implementado('Fase 1 · B2')


class HistorialCierreView(VistaAuditoria):
    def get(self, request, pk):
        return no_implementado('Fase 1 · B2')
