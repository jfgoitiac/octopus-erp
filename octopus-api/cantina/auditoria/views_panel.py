"""Panel ejecutivo — carril B2 (Fase 1). Contrato §2."""
from .views_base import VistaAuditoria, no_implementado


class PanelEjecutivoView(VistaAuditoria):
    def get(self, request):
        return no_implementado('Fase 1 · B2')
