"""Base común de las vistas de Auditoría de Cantina."""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import EsDirector


class VistaAuditoria(APIView):
    """Toda vista del módulo hereda de aquí: exclusiva del Director."""
    permission_classes = [EsDirector]


def no_implementado(fase_carril):
    """Respuesta de las vistas stub de la Fase 0 (ver CONTRATO_AUDITORIA_CANTINA.md)."""
    return Response(
        {'detail': f'Pendiente de implementar ({fase_carril}). Ver CONTRATO_AUDITORIA_CANTINA.md.'},
        status=status.HTTP_501_NOT_IMPLEMENTED,
    )
