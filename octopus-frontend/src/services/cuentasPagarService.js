import apiClient from '../api/apiClient';

// Durante Fase 2 se puede activar VITE_CXP_STUBS=true; Fase 3 lo apaga sin cambiar consumidores.
export const USE_STUBS = false;
const hoy = new Date().toISOString().slice(0, 10);
let cuentas = [{ id: 1, numero: 'CXP-000001', proveedor: 1, proveedor_nombre: 'Servicios Andes', categoria: 1, categoria_nombre: 'Servicios básicos', concepto: 'Internet octubre', moneda: 'USD', monto_documento: '85.00', monto_usd: '85.00', monto_ves: '12750.00', saldo: '85.00', tasa_aplicada: '150.0000', fecha_emision: hoy, fecha_vencimiento: hoy, prioridad: 'alta', estado: 'pendiente', situacion: 'vence_hoy', origen: 'manual', pagos: [], historial: [] }];
const response = (data) => Promise.resolve({ data });
const id = () => Math.max(0, ...cuentas.map((x) => x.id)) + 1;
const stub = (fn, fallback) => (...args) => response(fn ? fn(...args) : fallback);
export const listarCuentas = USE_STUBS ? stub((params = {}) => ({ results: cuentas.filter((x) => !params.estado || x.estado === params.estado) })) : (params = {}) => apiClient.get('cuentas-por-pagar/', { params });
export const obtenerCuenta = USE_STUBS ? stub((cuentaId) => cuentas.find((x) => x.id === Number(cuentaId))) : (cuentaId) => apiClient.get(`cuentas-por-pagar/${cuentaId}/`);
export const crearCuenta = USE_STUBS ? stub((body) => { const nueva = { ...body, id: id(), numero: `CXP-${String(id()).padStart(6, '0')}`, estado: 'pendiente', situacion: 'al_dia', saldo: body.monto_documento, monto_usd: body.moneda === 'USD' ? body.monto_documento : (Number(body.monto_documento) / Number(body.tasa_aplicada || 1)).toFixed(2), monto_ves: body.moneda === 'VES' ? body.monto_documento : (Number(body.monto_documento) * Number(body.tasa_aplicada || 1)).toFixed(2), pagos: [], historial: [] }; cuentas = [nueva, ...cuentas]; return nueva; }) : (body) => apiClient.post('cuentas-por-pagar/', body);
export const actualizarCuenta = (cuentaId, body) => apiClient.patch(`cuentas-por-pagar/${cuentaId}/`, body);
export const pagarCuenta = USE_STUBS ? stub((cuentaId, body) => { const c = cuentas.find((x) => x.id === Number(cuentaId)); const aplicado = Number(body.monto_aplicado); c.pagos.push({ id: c.pagos.length + 1, ...body, estado: 'valido' }); c.saldo = Math.max(0, Number(c.saldo) - aplicado).toFixed(2); c.estado = Number(c.saldo) <= .01 ? 'pagada' : 'parcial'; return { pago: c.pagos.at(-1), saldo: c.saldo, estado: c.estado, egreso_id: c.estado === 'pagada' ? 101 : null }; }) : (cuentaId, body) => apiClient.post(`cuentas-por-pagar/${cuentaId}/pagar/`, body);
export const aplazarCuenta = (cuentaId, body) => apiClient.post(`cuentas-por-pagar/${cuentaId}/aplazar/`, body);
export const posponerRecordatorio = (cuentaId, body) => apiClient.post(`cuentas-por-pagar/${cuentaId}/posponer-recordatorio/`, body);
export const acuerdoCuotas = (cuentaId, body) => apiClient.post(`cuentas-por-pagar/${cuentaId}/acuerdo-cuotas/`, body);
export const confirmarMonto = (cuentaId, body) => apiClient.post(`cuentas-por-pagar/${cuentaId}/confirmar-monto/`, body);
export const anularCuenta = (cuentaId, body) => apiClient.post(`cuentas-por-pagar/${cuentaId}/anular/`, body);
export const duplicarCuenta = (cuentaId) => apiClient.post(`cuentas-por-pagar/${cuentaId}/duplicar/`);
export const listarPagos = (cuentaId) => apiClient.get(`cuentas-por-pagar/${cuentaId}/pagos/`);
export const anularPago = (pagoId, body) => apiClient.post(`cuentas-por-pagar/pagos/${pagoId}/anular/`, body);
export const subirComprobantePago = (pagoId, form) => apiClient.post(`cuentas-por-pagar/pagos/${pagoId}/adjuntos/`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
export const pagarMultiple = (body) => apiClient.post('cuentas-por-pagar/pagos-multiples/', body);
export const listarPlantillas = (params = {}) => apiClient.get('cuentas-por-pagar/plantillas/', { params });
export const crearPlantilla = (body) => apiClient.post('cuentas-por-pagar/plantillas/', body);
export const actualizarPlantilla = (plantillaId, body) => apiClient.patch(`cuentas-por-pagar/plantillas/${plantillaId}/`, body);
export const obtenerConfiguracionRecordatorios = () => apiClient.get('cuentas-por-pagar/configuracion/');
export const actualizarConfiguracionRecordatorios = (body) => apiClient.patch('cuentas-por-pagar/configuracion/', body);
