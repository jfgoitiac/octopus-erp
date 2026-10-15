"""Bitácora, alertas, parámetros y reapertura de caja — carril B4 (Fase 2). Contrato §5–§7."""
from cantina.permissions import EsAdminCantina

from .views_base import VistaAuditoria, no_implementado


class BitacoraListView(VistaAuditoria):
    def get(self, request):
        return no_implementado('Fase 2 · B4')


class VerificarBitacoraView(VistaAuditoria):
    def get(self, request):
        return no_implementado('Fase 2 · B4')


class AlertasListView(VistaAuditoria):
    def get(self, request):
        return no_implementado('Fase 2 · B4')


class AlertasResumenView(VistaAuditoria):
    def get(self, request):
        return no_implementado('Fase 2 · B4')


class AtenderAlertaView(VistaAuditoria):
    def post(self, request, pk):
        return no_implementado('Fase 2 · B4')


class ParametrosAuditoriaView(VistaAuditoria):
    def get(self, request):
        return no_implementado('Fase 2 · B4')

    def put(self, request):
        return no_implementado('Fase 2 · B4')


class ReabrirCajaView(VistaAuditoria):
    # D4: la reapertura la autoriza director o administrador (no el cajero).
    permission_classes = [EsAdminCantina]

    def post(self, request, pk):
        return no_implementado('Fase 2 · B4')
