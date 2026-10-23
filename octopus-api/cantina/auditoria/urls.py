"""
Rutas de la Auditoría de Cantina, montadas en /api/cantina/auditoria/.

Fase 0 registra TODAS las rutas (con vistas stub que responden 501) para que
los carriles paralelos no tengan que tocar este archivo. Ver
CONTRATO_AUDITORIA_CANTINA.md.
"""
from django.urls import path

from .views_bitacora import (
    AlertasListView,
    AlertasResumenView,
    AtenderAlertaView,
    BitacoraListView,
    ParametrosAuditoriaView,
    ReabrirCajaView,
    VerificarBitacoraView,
)
from .views_cierres import (
    AdjuntosCierreView,
    CierreDetalleView,
    CierresListView,
    HistorialCierreView,
    RevisarCierreView,
)
from .views_correcciones import CorregirVentaView, NotasCierreView, VentasBuscarView
from .views_panel import PanelEjecutivoView
from .views_reportes import (
    ReporteExcepcionesView,
    ReporteInventarioView,
    ReporteRentabilidadView,
    ReporteVentasAuditoriaView,
)

urlpatterns = [
    # §2 Panel ejecutivo
    path('panel/', PanelEjecutivoView.as_view(), name='auditoria-panel'),

    # §3 Cierres diarios
    path('cierres/', CierresListView.as_view(), name='auditoria-cierres'),
    path('cierres/<int:pk>/', CierreDetalleView.as_view(), name='auditoria-cierre-detalle'),
    path('cierres/<int:pk>/revision/', RevisarCierreView.as_view(), name='auditoria-cierre-revision'),
    path('cierres/<int:pk>/adjuntos/', AdjuntosCierreView.as_view(), name='auditoria-cierre-adjuntos'),
    path('cierres/<int:pk>/historial/', HistorialCierreView.as_view(), name='auditoria-cierre-historial'),
    path('cierres/<int:pk>/reabrir/', ReabrirCajaView.as_view(), name='auditoria-cierre-reabrir'),

    # §10 Correcciones
    path('ventas/', VentasBuscarView.as_view(), name='auditoria-ventas'),
    path('ventas/<int:pk>/corregir/', CorregirVentaView.as_view(), name='auditoria-venta-corregir'),
    path('cierres/<int:pk>/notas/', NotasCierreView.as_view(), name='auditoria-cierre-notas'),

    # §4 Reportes
    path('reportes/ventas/', ReporteVentasAuditoriaView.as_view(), name='auditoria-reporte-ventas'),
    path('reportes/excepciones/', ReporteExcepcionesView.as_view(), name='auditoria-reporte-excepciones'),
    path('reportes/inventario/', ReporteInventarioView.as_view(), name='auditoria-reporte-inventario'),
    path('reportes/rentabilidad/', ReporteRentabilidadView.as_view(), name='auditoria-reporte-rentabilidad'),

    # §5 Bitácora
    path('bitacora/', BitacoraListView.as_view(), name='auditoria-bitacora'),
    path('bitacora/verificar/', VerificarBitacoraView.as_view(), name='auditoria-bitacora-verificar'),

    # §6 Alertas
    path('alertas/', AlertasListView.as_view(), name='auditoria-alertas'),
    path('alertas/resumen/', AlertasResumenView.as_view(), name='auditoria-alertas-resumen'),
    path('alertas/<int:pk>/atender/', AtenderAlertaView.as_view(), name='auditoria-alerta-atender'),

    # §7 Parámetros
    path('parametros/', ParametrosAuditoriaView.as_view(), name='auditoria-parametros'),
]
