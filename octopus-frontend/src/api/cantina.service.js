// Cliente de negocio del módulo cantina (login/JWT propios, separado del
// panel admin — ver src/cantina/). baseURL ya apunta a /api/cantina/, por
// eso las rutas de abajo NO llevan el prefijo 'cantina/' (antes lo llevaban
// porque usaban el apiClient genérico del admin, cuyo baseURL es /api/).
import cantinaApiClient from '../cantina/api/cantinaApiClient';

/* ── Inventario / Productos ── */

export const getProductos = (params, signal) =>
  cantinaApiClient.get('productos/', { params, signal });

// Plantillas de venta (combos del POS): productos + cantidades predefinidos.
export const getPlantillasVenta = (params, signal) =>
  cantinaApiClient.get('plantillas-venta/', { params, signal });

export const crearPlantillaVenta = (payload) =>
  cantinaApiClient.post('plantillas-venta/', payload);

export const actualizarPlantillaVenta = (id, payload) =>
  cantinaApiClient.put(`plantillas-venta/${id}/`, payload);

export const eliminarPlantillaVenta = (id) =>
  cantinaApiClient.delete(`plantillas-venta/${id}/`);

export const crearProducto = (payload, signal) =>
  cantinaApiClient.post('productos/', payload, { signal });

export const actualizarProducto = (id, payload, signal) =>
  cantinaApiClient.patch(`productos/${id}/`, payload, { signal });

export const eliminarProducto = (id, signal) =>
  cantinaApiClient.delete(`productos/${id}/`, { signal });

export const buscarProductoPorCodigo = (codigo, signal) =>
  cantinaApiClient.get('productos/buscar-codigo/', { params: { codigo }, signal });

/* ── Categorías ── */

// `params.area` ('cantina' | 'libreria') filtra las categorías por caja; las
// categorías y los productos llevan `area` en create/update (default 'cantina').
export const getCategorias = (signal, params) =>
  cantinaApiClient.get('categorias/', { params, signal });

export const crearCategoria = (payload, signal) =>
  cantinaApiClient.post('categorias/', payload, { signal });

/* ── Inventario / Movimientos ── */

// Body: { producto, tipo: 'entrada' | 'salida' | 'ajuste' | 'merma', cantidad, motivo }
// `merma` lleva cantidad positiva (descuenta stock); `motivo` es obligatorio
// para `ajuste` y `merma` (CONTRATO_AUDITORIA_CANTINA.md §8).
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

// Búsqueda operacional única: resuelve QR/serial sin filtrar estado y permite
// buscar tarjetas asignadas por nombre/cédula para la pantalla unificada.
export const buscarTarjetaOperacion = (query, signal) =>
  cantinaApiClient.get('tarjetas/operacion/buscar/', { params: query, signal });

// Paso 2 del wizard: trae el representante y la lista de sus alumnos por cédula.
export const buscarRepresentantePorCedula = (cedula, signal) =>
  cantinaApiClient.get('representantes/buscar/', { params: { cedula }, signal });

// Paso 3 del wizard: vincula la tarjeta al titular elegido — { alumno_id } o { cliente_id }.
export const asignarTarjeta = (tarjetaId, titular, signal) =>
  cantinaApiClient.post(`tarjetas/${tarjetaId}/asignar/`, titular, { signal });

// Asignación + primera recarga atómicas: el backend confirma ambas o ninguna.
export const asignarYRecargarTarjeta = (tarjetaId, payload, signal) =>
  cantinaApiClient.post(`tarjetas/${tarjetaId}/asignar-y-recargar/`, payload, { signal });

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

// Tasa que Cantina aplica hoy. El backend conserva la autoridad sobre el
// valor, la fuente y el permiso para cambiarla; las pantallas solo usan este
// contrato para mostrar equivalencias.
export const getTasaVigenteCantina = (signal) =>
  cantinaApiClient.get('tasa-vigente/', { signal });

// Activa o actualiza la tasa propia de Cantina. Cada cambio agrega una fila al
// historial inmutable del backend.
export const activarTasaPersonalizadaCantina = (payload, signal) =>
  cantinaApiClient.post('tasa/', payload, { signal });

// Desactiva el modo personalizado y devuelve Cantina a la BCV vigente.
export const restablecerTasaBcvCantina = (signal) =>
  cantinaApiClient.post('tasa/restablecer-bcv/', {}, { signal });

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

// Historial operativo y reversos de recargas. Una anulación nunca borra la
// recarga original; el backend devuelve el saldo proyectado y permisos.
export const getHistorialRecargas = (params, signal) =>
  cantinaApiClient.get('recargas/', { params, signal });

export const anularRecarga = (id, payload, signal) =>
  cantinaApiClient.post(`recargas/${id}/anular/`, payload, { signal });

export const corregirRecarga = (id, payload, signal) =>
  cantinaApiClient.post(`recargas/${id}/corregir/`, payload, { signal });

export const descargarComprobanteAnulacionRecarga = (id, signal) =>
  cantinaApiClient.get(`recargas/${id}/comprobante-anulacion/`, { signal, responseType: 'blob' });

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
 *     metodo_pago: 'tarjeta_prepago' | 'credito_representante' | uno de cobranza.Pago.METODOS
 *       ('transferencia' | 'pago_movil' | 'punto_de_venta' | 'zelle' | 'efectivo' | 'efectivo_ves'),
 *     tarjeta_codigo: 'CANT-XXXXXXXXXX',   // solo si metodo_pago === 'tarjeta_prepago'
 *     // Métodos bancarios (transferencia/pago_movil/punto_de_venta/zelle):
 *     banco_receptor, referencia, numero_lote (solo punto_de_venta),
 *     // Cargo a cuenta (CxC, §3.3 PROMPT_CANTINA_CXC.md):
 *     representante_id, alumno_id?,
 *     // Auditoría (CONTRATO_AUDITORIA_CANTINA.md §8):
 *     descuento_usd: '0.00',             // ≥ 0 y ≤ subtotal
 *     motivo_descuento,                  // obligatorio si descuento_usd > 0
 *     origen_producto: 'escaner' | 'manual' | 'mixto',
 *     origen_alumno: 'escaner' | 'manual' | 'no_aplica',
 *   }
 *   El área de la venta la hereda el backend de la apertura del cajero (el
 *   frontend NO la envía); productos de otra área → 400.
 *   201 → VentaCantinaSerializer: {
 *     id, area, alumno, alumno_nombre, tarjeta, tarjeta_serial, cajero,
 *     cajero_username, metodo_pago, total_usd, tasa_aplicada, total_ves,
 *     estado, saldo_tarjeta_despues,
 *     descuento_usd, motivo_descuento, motivo_anulacion, es_manual,
 *     origen_producto, origen_alumno,      // total_usd ya es el NETO
 *     detalles: [{ id, producto: { id, nombre }, cantidad, precio_unitario, subtotal }],
 *     creado_en, anulada_en, anulada_por, anulada_por_username,
 *   }
 *   400 → { error: 'mensaje claro' }  (nota: este endpoint usa la clave
 *   'error', NO 'detail' como el resto de vistas de cantina — se maneja acá
 *   revisando ambas para no romper si el backend homogeniza esto después)
 */
export const registrarVenta = (payload, signal) =>
  cantinaApiClient.post('ventas/registrar/', payload, { signal });

// POST ventas/<id>/anular/ — `motivo` obligatorio (no vacío) → motivo_anulacion
// (CONTRATO_AUDITORIA_CANTINA.md §8). 400 si ya estaba anulada; 403 si es
// una venta a cuenta y el usuario no es administrador/director.
export const anularVenta = (ventaId, motivo, signal) =>
  cantinaApiClient.post(`ventas/${ventaId}/anular/`, { motivo }, { signal });

// GET ventas/<id>/recibo/ → FileResponse (PDF), regenerado siempre desde
// VentaCantina/DetalleVentaCantina (nunca se guarda un PDF estático) — mismo
// patrón de descarga de blob que generarLoteTarjetas.
export const descargarReciboVenta = (ventaId, signal) =>
  cantinaApiClient.get(`ventas/${ventaId}/recibo/`, { signal, responseType: 'blob' });

/* ── Apertura de caja por cajero (hasta 3 simultáneas POR ÁREA) ──
 *
 * GET apertura-caja/ → { apertura: null } si el cajero autenticado no tiene
 *   ninguna apertura 'abierta', o { apertura: { id, area: 'cantina'|'libreria',
 *   cajero, cajero_username, fecha_hora_apertura, monto_inicial, estado,
 *   cerrada_en } } si sí.
 *
 * POST apertura-caja/ con { monto_inicial, area } (area obligatoria) → 201 con
 *   la apertura creada, o 400 { detail: 'mensaje' } si el cajero ya tiene una
 *   abierta, o si ya hay 3 aperturas abiertas en esa área.
 */
export const getAperturaCajaActual = (signal) =>
  cantinaApiClient.get('apertura-caja/', { signal });

export const abrirCajaCantina = (montoInicial, area, signal) =>
  cantinaApiClient.post('apertura-caja/', { monto_inicial: montoInicial, area }, { signal });

/* ── Cierre de caja (§5.6/§8 FASE 5 cantina.md) ──
 *
 * GET cierre-caja/ → { ya_cerrado: true, id, area, fecha, total_ventas,
 *   total_tarjeta, total_efectivo, total_recargas_efectivo, conteo_fisico,
 *   diferencia, observaciones, cerrado_en, cajero, totales_por_metodo } si el
 *   cajero autenticado ya cerró caja hoy, o { ya_cerrado: false, area,
 *   total_ventas, total_tarjeta, total_efectivo, total_recargas_efectivo,
 *   totales_por_metodo } (resumen preliminar) si no.
 *   totales_por_metodo: JSON { <metodo_pago>: <monto USD string> } con
 *   ventas + abonos CxC + recargas de ESA apertura (D11 del prompt CxC).
 *   Todos los montos vienen como string decimal — se formatean en la UI.
 *
 * POST cierre-caja/ con { conteo_usd, conteo_ves, observaciones } → 201 con el
 *   mismo shape que ya_cerrado:true, o 400 { detail: 'mensaje' } si ya cerró
 *   hoy (condición de carrera con otra pestaña) o el monto no es válido.
 *
 * GET cierre-caja/ultimo/ → último cierre del cajero autenticado, con
 *   ya_cerrado:true, o 404 si no tiene ninguno.
 *
 * `desglose` (GET y POST): { origen, arqueo } por moneda; {} en cierres antiguos.
 */
export const getCierreCajaHoy = (signal) =>
  cantinaApiClient.get('cierre-caja/', { signal });

export const getUltimoCierreCaja = (signal) =>
  cantinaApiClient.get('cierre-caja/ultimo/', { signal });

export const cerrarCajaCantina = (payload, signal) =>
  cantinaApiClient.post('cierre-caja/', payload, { signal });

/* ── Reportes de ventas (§7.4/§8 FASE 7 cantina.md) ──
 *
 * Contrato real confirmado de `ReporteVentasView` (cantina/views.py):
 *
 *   GET reportes/ventas/?fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD&alumno_id=<opcional>&area=<opcional>&cajero=<id opcional>
 *   200 → {
 *     fecha_inicio, fecha_fin,
 *     ventas: [ /* VentaCantinaSerializer — incluye TODAS las ventas del
 *                 rango sin importar estado (id, area, alumno, alumno_nombre,
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

/* ── Cuentas por cobrar a representantes (CxC) ──
 *
 * Contrato: PROMPT_CANTINA_CXC.md §3.3. Todas las rutas cuelgan de cxc/.
 *
 * GET cxc/buscar/?q=  → [{ id, cedula, nombre, apellido, telefono, saldo_usd,
 *   limite_usd, bloqueado, alumnos: [{ id, nombre, apellido, grado_seccion }] }]
 * POST cxc/abonos/ body { representante_id, fecha_pago?, motivo?, lineas: [{
 *   metodo_pago, monto_usd?, monto_ves?, tasa_aplicada?, banco_receptor?,
 *   referencia?, numero_lote? }] }
 */
// Búsqueda unificada: devuelve representantes y clientes generales (campo `tipo`).
// `paraVenta` excluye clientes inactivos (no admiten ventas nuevas).
export const buscarRepresentantesCxc = (q, signal, { paraVenta = false } = {}) =>
  cantinaApiClient.get('cxc/buscar/', { params: { q, para_venta: paraVenta ? 1 : undefined }, signal });

/* Clientes generales (personal / otros) de CxC. */
export const listarClientesCxc = (params, signal) =>
  cantinaApiClient.get('cxc/clientes/', { params, signal });

export const crearClienteCxc = (payload, signal) =>
  cantinaApiClient.post('cxc/clientes/', payload, { signal });

export const actualizarClienteCxc = (clienteId, payload, signal) =>
  cantinaApiClient.patch(`cxc/clientes/${clienteId}/`, payload, { signal });

export const estadoCuentaClienteCxc = (clienteId, params, signal) =>
  cantinaApiClient.get(`cxc/clientes/${clienteId}/estado-cuenta/`, { params, signal });

export const actualizarCreditoClienteCxc = (clienteId, payload, signal) =>
  cantinaApiClient.patch(`cxc/clientes/${clienteId}/credito/`, payload, { signal });

export const listarCuentasCxc = (params, signal) =>
  cantinaApiClient.get('cxc/cuentas/', { params, signal });

export const exportarCuentasCxc = (params, signal) =>
  cantinaApiClient.get('cxc/cuentas/excel/', { params, signal, responseType: 'blob' });

export const estadoCuentaCxc = (representanteId, params, signal) =>
  cantinaApiClient.get(`cxc/representantes/${representanteId}/estado-cuenta/`, { params, signal });

export const actualizarCreditoCxc = (representanteId, payload, signal) =>
  cantinaApiClient.patch(`cxc/representantes/${representanteId}/credito/`, payload, { signal });

export const registrarAbonoCxc = (payload, signal) =>
  cantinaApiClient.post('cxc/abonos/', payload, { signal });

export const listarTarjetasPagoDeuda = (representanteId, signal) =>
  cantinaApiClient.get(`cxc/representantes/${representanteId}/pago-tarjeta/`, { signal });

export const pagarDeudaConTarjeta = (representanteId, payload, signal) =>
  cantinaApiClient.post(`cxc/representantes/${representanteId}/pago-tarjeta/`, payload, { signal });

export const anularAbonoCxc = (operacionUuid, motivo, signal) =>
  cantinaApiClient.post(`cxc/abonos/${operacionUuid}/anular/`, { motivo }, { signal });

// PDF del recibo del abono — se pide como blob, igual que descargarReciboVenta.
export const reciboAbonoCxcUrl = (operacionUuid, signal) =>
  cantinaApiClient.get(`cxc/abonos/${operacionUuid}/recibo/`, { signal, responseType: 'blob' });
