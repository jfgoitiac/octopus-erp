from django.urls import path

from .views import (
    AjustarCreditoTarjetaView,
    AnularVentaView,
    AprobarRecargaView,
    AsignarTarjetaView,
    BancosCantinaView,
    BuscarRepresentantePorCedulaView,
    BuscarTarjetaParaReponerView,
    BuscarTarjetaSinAsignarView,
    BuscarTarjetaView,
    CategoriasListCreateView,
    CierreCajaCantinaView,
    ExportarVentasExcelView,
    GenerarLoteTarjetasView,
    MovimientoInventarioCreateView,
    ParametroCantinaView,
    ProductoBuscarPorCodigoView,
    ProductoDetailView,
    ProductosListCreateView,
    RecargarTarjetaCajeroView,
    RecargasPendientesView,
    RechazarRecargaView,
    ReciboVentaPDFView,
    RegistrarVentaView,
    ReponerTarjetaView,
    ReporteMorosidadView,
    ReporteStockCriticoView,
    ReporteVentasView,
    TarjetasListView,
    TasaVigenteCantinaView,
)

app_name = 'cantina'

# NOTA: login/refresh del cajero se unificaron con el resto del staff —
# ver POST /api/token/ y /api/token/refresh/ (config/urls.py, sobre
# CookieTokenObtainPairView / CookieTokenRefreshView).

urlpatterns = [
    # Fase 1 — Inventario (§8 FASE 1 de cantina.md)
    path('productos/', ProductosListCreateView.as_view(), name='cantina-productos'),
    path('productos/<int:pk>/', ProductoDetailView.as_view(), name='cantina-producto-detalle'),
    path('productos/buscar-codigo/', ProductoBuscarPorCodigoView.as_view(), name='cantina-producto-buscar-codigo'),
    path('categorias/', CategoriasListCreateView.as_view(), name='cantina-categorias'),
    path('inventario/movimiento/', MovimientoInventarioCreateView.as_view(), name='cantina-inventario-movimiento'),
    path('reportes/stock-critico/', ReporteStockCriticoView.as_view(), name='cantina-stock-critico'),

    # Fase 2 — Generación y asignación de tarjetas QR (§8 FASE 2 de cantina.md)
    path('tarjetas/generar-lote/', GenerarLoteTarjetasView.as_view(), name='cantina-generar-lote'),
    path('tarjetas/sin-asignar/buscar/', BuscarTarjetaSinAsignarView.as_view(), name='cantina-buscar-sin-asignar'),
    path('tarjetas/reponer/buscar/', BuscarTarjetaParaReponerView.as_view(), name='cantina-buscar-para-reponer'),
    path('representantes/buscar/', BuscarRepresentantePorCedulaView.as_view(), name='cantina-buscar-representante'),
    path('tarjetas/<int:tarjeta_id>/asignar/', AsignarTarjetaView.as_view(), name='cantina-asignar-tarjeta'),
    path('tarjetas/<int:tarjeta_id>/reponer/', ReponerTarjetaView.as_view(), name='cantina-reponer-tarjeta'),

    # Fase 3 — Recargas, moneda dual y validación de referencias cruzada (§8 FASE 3 de cantina.md)
    path('bancos/', BancosCantinaView.as_view(), name='cantina-bancos'),
    path('tasa-vigente/', TasaVigenteCantinaView.as_view(), name='cantina-tasa-vigente'),
    path('tarjetas/buscar/', BuscarTarjetaView.as_view(), name='cantina-buscar-tarjeta'),
    path('tarjetas/', TarjetasListView.as_view(), name='cantina-tarjetas-lista'),
    path('tarjetas/recargar/', RecargarTarjetaCajeroView.as_view(), name='cantina-recargar-cajero'),
    path('recargas/pendientes/', RecargasPendientesView.as_view(), name='cantina-recargas-pendientes'),
    path('recargas/<int:pk>/aprobar/', AprobarRecargaView.as_view(), name='cantina-recarga-aprobar'),
    path('recargas/<int:pk>/rechazar/', RechazarRecargaView.as_view(), name='cantina-recarga-rechazar'),

    # Fase 4 — POS y ventas (§8 FASE 4 de cantina.md)
    path('ventas/registrar/', RegistrarVentaView.as_view(), name='cantina-registrar-venta'),
    path('ventas/<int:venta_id>/anular/', AnularVentaView.as_view(), name='cantina-anular-venta'),
    path('ventas/<int:venta_id>/recibo/', ReciboVentaPDFView.as_view(), name='cantina-recibo'),

    # Fase 5 — Cierre de caja (§8 FASE 5 de cantina.md)
    path('cierre-caja/', CierreCajaCantinaView.as_view(), name='cantina-cierre-caja'),

    # Fase 7 — Reportes y reimpresión de tickets (§8 FASE 7 de cantina.md)
    path('reportes/ventas/', ReporteVentasView.as_view(), name='cantina-reporte-ventas'),
    path('reportes/ventas/excel/', ExportarVentasExcelView.as_view(), name='cantina-reporte-ventas-excel'),

    # Parámetros, ajuste de crédito por tarjeta y reporte de morosidad
    path('parametros/', ParametroCantinaView.as_view(), name='cantina-parametros'),
    path('tarjetas/<int:tarjeta_id>/credito/', AjustarCreditoTarjetaView.as_view(), name='cantina-ajustar-credito'),
    path('reportes/morosos/', ReporteMorosidadView.as_view(), name='cantina-reporte-morosos'),
]
