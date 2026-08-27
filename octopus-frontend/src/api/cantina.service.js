// Cliente de negocio del módulo cantina (login/JWT propios, separado del
// panel admin — ver src/cantina/). baseURL ya apunta a /api/cantina/, por
// eso las rutas de abajo NO llevan el prefijo 'cantina/' (antes lo llevaban
// porque usaban el apiClient genérico del admin, cuyo baseURL es /api/).
import cantinaApiClient from '../cantina/api/cantinaApiClient';

/* ── Inventario / Productos ── */

export const getProductos = (params, signal) =>
  cantinaApiClient.get('productos/', { params, signal });

export const crearProducto = (payload, signal) =>
  cantinaApiClient.post('productos/', payload, { signal });

export const actualizarProducto = (id, payload, signal) =>
  cantinaApiClient.patch(`productos/${id}/`, payload, { signal });

export const eliminarProducto = (id, signal) =>
  cantinaApiClient.delete(`productos/${id}/`, { signal });

export const buscarProductoPorCodigo = (codigo, signal) =>
  cantinaApiClient.get('productos/buscar-codigo/', { params: { codigo }, signal });

/* ── Categorías ── */

export const getCategorias = (signal) =>
  cantinaApiClient.get('categorias/', { signal });

export const crearCategoria = (payload, signal) =>
  cantinaApiClient.post('categorias/', payload, { signal });

/* ── Inventario / Movimientos ── */

export const registrarMovimientoInventario = (payload, signal) =>
  cantinaApiClient.post('inventario/movimiento/', payload, { signal });

/* ── Reportes ── */

export const getStockCritico = (signal) =>
  cantinaApiClient.get('reportes/stock-critico/', { signal });

/* ── Tarjetas (§5.1/§5.7 cantina.md) ── */

// Genera un lote de N tarjetas nuevas y devuelve el .zip con los PNG listos
// para imprimir — se pide como blob para poder disparar la descarga manual.
export const generarLoteTarjetas = (cantidad, signal) =>
  cantinaApiClient.post('tarjetas/generar-lote/', { cantidad }, { signal, responseType: 'blob' });

// Ubica una tarjeta 'sin_asignar' por código (QR) o serial (impreso en la
// tarjeta física) durante el paso 1 del wizard de asignación.
export const buscarTarjetaSinAsignar = (query, signal) =>
  cantinaApiClient.get('tarjetas/sin-asignar/buscar/', { params: query, signal });

// Paso 2 del wizard: trae el representante y la lista de sus alumnos por cédula.
export const buscarRepresentantePorCedula = (cedula, signal) =>
  cantinaApiClient.get('representantes/buscar/', { params: { cedula }, signal });

// Paso 3 del wizard: vincula la tarjeta al alumno elegido.
export const asignarTarjeta = (tarjetaId, alumnoId, signal) =>
  cantinaApiClient.post(`tarjetas/${tarjetaId}/asignar/`, { alumno_id: alumnoId }, { signal });

// Reposición por extravío/daño — regenera el código, mismo alumno y saldo.
export const reponerTarjeta = (tarjetaId, motivo, signal) =>
  cantinaApiClient.post(`tarjetas/${tarjetaId}/reponer/`, { motivo }, { signal });

// Ubica una tarjeta YA asignada (activa/bloqueada/extraviada) por código o
// serial — usado por el flujo standalone de ReponerTarjetaModal (cuando no
// llega ya resuelta desde el conflicto de AsignarTarjetaModal). A diferencia
// de buscarTarjetaSinAsignar, esta NO filtra por estado 'sin_asignar'.
export const buscarTarjetaParaReponer = (query, signal) =>
  cantinaApiClient.get('tarjetas/reponer/buscar/', { params: query, signal });

// Busca una tarjeta ACTIVA por código escaneado o serial — usada por el POS
// (§5.6, BuscarTarjetaView) y reutilizada aquí por RecargaCajeroModal para
// resolver a qué tarjeta se le acredita la recarga (§7.3bis cantina.md).
export const buscarTarjetaActiva = (query, signal) =>
  cantinaApiClient.get('tarjetas/buscar/', { params: query, signal });

// Listado de tarjetas (admin) — soporta filtro por estado (§7.3bis, tabla
// pendiente de Fase 3: 'sin_asignar' | 'activa' | 'bloqueada' | 'extraviada').
export const getTarjetas = (params, signal) =>
  cantinaApiClient.get('tarjetas/', { params, signal });

/* ── Recargas (§5.6/§5.9 cantina.md) ── */

// Catálogo de bancos institucionales (cobranza.BancoInstitucional, GET
// BancosCantinaView) — puebla el selector de banco receptor en el formulario
// de recarga, sin duplicar el modelo.
export const getBancosCantina = (signal) =>
  cantinaApiClient.get('bancos/', { signal });

// Última tasa BCV registrada (TasaVigenteCantinaView) — el cajero no tiene
// el JWT del panel admin, así que no puede usar el hook useTasaBCV
// existente (apunta a /api/cobranza/stats/ con el token admin); este
// endpoint propio permite convertir un monto ingresado en VES a USD antes
// de enviarlo, porque el backend solo acepta `monto_usd`.
export const getTasaVigenteCantina = (signal) =>
  cantinaApiClient.get('tasa-vigente/', { signal });

// Recarga en caja (efectivo o transferencia/pago móvil/zelle presencial),
// aprobada al instante — NO pasa por el estado 'pendiente' (RecargarTarjetaCajeroView).
export const recargarTarjetaCajero = (payload, signal) =>
  cantinaApiClient.post('tarjetas/recargar/', payload, { signal });

// Recargas del portal en estado 'pendiente' de revisión (RecargasPendientesView).
export const getRecargasPendientes = (signal) =>
  cantinaApiClient.get('recargas/pendientes/', { signal });

export const aprobarRecarga = (id, signal) =>
  cantinaApiClient.post(`recargas/${id}/aprobar/`, {}, { signal });

export const rechazarRecarga = (id, signal) =>
  cantinaApiClient.post(`recargas/${id}/rechazar/`, {}, { signal });

/* ── Ventas / POS (§5.6/§7.2/§8 FASE 4 cantina.md) ──
 *
 * Estas dos funciones son el ÚNICO punto de contacto con los nombres de
 * campo exactos que expone `RegistrarVentaView`/`ReciboVentaPDFView` — si el
 * backend cambia el contrato, se ajusta acá y no en los componentes del POS.
 *
 * Contrato verificado contra octopus-api/cantina/views.py (RegistrarVentaView,
 * líneas ~785-956) y cantina/serializers.py (VentaCantinaSerializer):
 *
 *   POST ventas/registrar/
 *   Body: {
 *     items: [{ producto_id, cantidad }, ...],
 *     metodo_pago: 'efectivo' | 'efectivo_ves' | 'tarjeta_prepago',
 *     tarjeta_codigo: 'CANT-XXXXXXXXXX',   // solo si metodo_pago === 'tarjeta_prepago'
 *   }
 *   201 → VentaCantinaSerializer: {
 *     id, alumno, alumno_nombre, tarjeta, tarjeta_serial, cajero,
 *     cajero_username, metodo_pago, total_usd, tasa_aplicada, total_ves,
 *     estado, saldo_tarjeta_despues,
 *     detalles: [{ id, producto: { id, nombre }, cantidad, precio_unitario, subtotal }],
 *     creado_en, anulada_en, anulada_por, anulada_por_username,
 *   }
 *   400 → { error: 'mensaje claro' }  (nota: este endpoint usa la clave
 *   'error', NO 'detail' como el resto de vistas de cantina — se maneja acá
 *   revisando ambas para no romper si el backend homogeniza esto después)
 */
export const registrarVenta = (payload, signal) =>
  cantinaApiClient.post('ventas/registrar/', payload, { signal });

// GET ventas/<id>/recibo/ → FileResponse (PDF), regenerado siempre desde
// VentaCantina/DetalleVentaCantina (nunca se guarda un PDF estático) — mismo
// patrón de descarga de blob que generarLoteTarjetas.
export const descargarReciboVenta = (ventaId, signal) =>
  cantinaApiClient.get(`ventas/${ventaId}/recibo/`, { signal, responseType: 'blob' });

/* ── Apertura de caja por cajero (hasta 3 simultáneas) ──
 *
 * GET apertura-caja/ → { apertura: null } si el cajero autenticado no tiene
 *   ninguna apertura 'abierta', o { apertura: { id, cajero, cajero_username,
 *   fecha_hora_apertura, monto_inicial, estado, cerrada_en } } si sí.
 *
 * POST apertura-caja/ con { monto_inicial } → 201 con la apertura creada, o
 *   400 { detail: 'mensaje' } si el cajero ya tiene una abierta, o si ya hay
 *   3 aperturas abiertas simultáneamente en el sistema.
 */
export const getAperturaCajaActual = (signal) =>
  cantinaApiClient.get('apertura-caja/', { signal });

export const abrirCajaCantina = (montoInicial, signal) =>
  cantinaApiClient.post('apertura-caja/', { monto_inicial: montoInicial }, { signal });

/* ── Cierre de caja (§5.6/§8 FASE 5 cantina.md) ──
 *
 * GET cierre-caja/ → { ya_cerrado: true, id, fecha, total_ventas,
 *   total_tarjeta, total_efectivo, total_recargas_efectivo, conteo_fisico,
 *   diferencia, observaciones, cerrado_en, cajero } si el cajero autenticado
 *   ya cerró caja hoy, o { ya_cerrado: false, total_ventas, total_tarjeta,
 *   total_efectivo, total_recargas_efectivo } (resumen preliminar) si no.
 *   Todos los montos vienen como string decimal — se formatean en la UI.
 *
 * POST cierre-caja/ con { conteo_fisico, observaciones } → 201 con el mismo
 *   shape que ya_cerrado:true, o 400 { detail: 'mensaje' } si ya cerró hoy
 *   (condición de carrera con otra pestaña).
 */
export const getCierreCajaHoy = (signal) =>
  cantinaApiClient.get('cierre-caja/', { signal });

export const cerrarCajaCantina = (payload, signal) =>
  cantinaApiClient.post('cierre-caja/', payload, { signal });

/* ── Reportes de ventas (§7.4/§8 FASE 7 cantina.md) ──
 *
 * Contrato real confirmado de `ReporteVentasView` (cantina/views.py):
 *
 *   GET reportes/ventas/?fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD&alumno_id=<opcional>
 *   200 → {
 *     fecha_inicio, fecha_fin,
 *     ventas: [ /* VentaCantinaSerializer — incluye TODAS las ventas del
 *                 rango sin importar estado (id, alumno, alumno_nombre,
 *                 tarjeta, tarjeta_serial, cajero, cajero_username,
 *                 metodo_pago, total_usd, tasa_aplicada, total_ves, estado,
 *                 saldo_tarjeta_despues, detalles, creado_en, anulada_en,
 *                 anulada_por, anulada_por_username) *\/ ],
 *     totales: { total_vendido_usd, cantidad_ventas },  // solo estado='completada'
 *     productos_mas_vendidos: [{ producto_id, nombre, cantidad_total, monto_total }, ...],  // solo completadas
 *     ventas_por_dia: [{ fecha: 'YYYY-MM-DD', total_usd }, ...],  // solo completadas, sin días vacíos
 *   }
 *
 * Nota: `totales` no incluye total en VES — CantinaReportes.jsx lo deriva
 * sumando `total_ves` de las ventas no anuladas devueltas en `ventas`.
 */
export const getReporteVentas = (params, signal) =>
  cantinaApiClient.get('reportes/ventas/', { params, signal });

// Descarga el .xlsx del rango — mismo patrón de blob que generarLoteTarjetas.
export const exportarVentasExcel = (params, signal) =>
  cantinaApiClient.get('reportes/ventas/excel/', { params, signal, responseType: 'blob' });

// Reimpresión de ticket histórico (§7.4): reutiliza `descargarReciboVenta`
// (ya definida arriba, Fase 4) — la misma vista `ReciboVentaPDFView` sirve
// tanto para el ticket recién cobrado en el POS como para la reimpresión
// desde el reporte, incluyendo ventas anuladas (el PDF ya marca "ANULADA").

/* ── Parámetros de crédito y morosidad ──
 *
 * GET/PUT parametros/ → { limite_credito_default: "5.00", dias_alerta_saldo_negativo: "1,3,7" }
 * El límite por defecto solo aplica a tarjetas NUEVAS al asignarse — no
 * reescribe retroactivamente `limite_credito` de tarjetas ya existentes.
 */
export const getParametrosCantina = (signal) =>
  cantinaApiClient.get('parametros/', { signal });

export const actualizarParametrosCantina = (data, signal) =>
  cantinaApiClient.put('parametros/', data, { signal });

// Ajuste manual del límite de crédito de una tarjeta puntual — devuelve la
// tarjeta completa (TarjetaPrepagoSerializer), mismo shape que getTarjetas/
// buscarTarjetaActiva.
export const ajustarCreditoTarjeta = (tarjetaId, limiteCredito, signal) =>
  cantinaApiClient.patch(`tarjetas/${tarjetaId}/credito/`, { limite_credito: limiteCredito }, { signal });

// Reporte de tarjetas con saldo negativo (morosos), ordenado por
// dias_en_negativo descendente. dias_min es opcional (filtra días mínimos
// en negativo).
export const getReporteMorosos = ({ diasMin } = {}, signal) =>
  cantinaApiClient.get('reportes/morosos/', {
    params: diasMin ? { dias_min: diasMin } : undefined,
    signal,
  });
