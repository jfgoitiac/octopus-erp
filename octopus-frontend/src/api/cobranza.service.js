import apiClient from './apiClient';

export const getDeudaAlumno = (cedula, signal) =>
    apiClient.get(`cobranza/buscar/${cedula}/`, { signal });

export const getCuotaInscripcionAlumno = (alumnoId, signal) =>
    apiClient.get(`cobranza/cuota-inscripcion-alumno/${alumnoId}/`, { signal });

export const getMensualidadesAlumno = (alumnoId, signal) =>
    apiClient.get(`cobranza/mensualidades-alumno/${alumnoId}/`, { signal });

export const exportarMorososExcel = (busqueda, signal) => {
    const params = {};
    if (busqueda?.trim()) params.buscar = busqueda.trim();
    return apiClient.get('cobranza/morosos/exportar-excel/', {
        params,
        responseType: 'blob',
        signal,
    });
};

export const getBancos = (signal) =>
    apiClient.get('cobranza/bancos/', signal ? { signal } : undefined);

/* ── Recibo de cobranza (motor único en el backend) ── */

export const getReciboPdf = (pagoId, signal) =>
    apiClient.get(`cobranza/recibo/${pagoId}/`, { responseType: 'blob', signal });

export const prepararReciboWhatsApp = (pagoId) =>
    apiClient.post(`cobranza/recibo/${pagoId}/whatsapp/`);

export const sincronizarTasa = (signal) =>
    apiClient.post('cobranza/sincronizar-tasa/', {}, signal ? { signal } : undefined);

/* ── Clasificación manual de pagos (desglose contable) ── */

export const getEstadoClasificacionPagos = (params, signal) =>
    apiClient.get('cobranza/pagos/estado-clasificacion/', { params, signal });

export const crearClasificacionPago = (pagoId, payload, signal) =>
    apiClient.post(`cobranza/pagos/${pagoId}/clasificacion/`, payload, { signal });

export const clasificarPagosBatch = (payload, signal) =>
    apiClient.post('cobranza/pagos/clasificacion/batch/', payload, { signal });

export const actualizarClasificacionLinea = (lineaId, payload, signal) =>
    apiClient.patch(`cobranza/pagos/clasificacion/${lineaId}/`, payload, { signal });

export const eliminarClasificacionLinea = (lineaId, signal) =>
    apiClient.delete(`cobranza/pagos/clasificacion/${lineaId}/`, { signal });

export const getDesgloseContable = (params, signal) =>
    apiClient.get('cobranza/pagos/desglose-contable/', { params, signal });

/* ── Corrección de Pagos ── */

export const listarPagos = (params, signal) =>
    apiClient.get('cobranza/pagos/lista/', { params, signal });

export const corregirPago = (pagoId, payload, signal) =>
    apiClient.patch(`cobranza/pagos/${pagoId}/corregir/`, payload, { signal });

export const obtenerElegibilidadMontoPago = (pagoId, signal) =>
    apiClient.get(`cobranza/pagos/${pagoId}/elegibilidad-monto/`, { signal });

export const cargarPagoRetroactivo = (payload, signal) =>
    apiClient.post('cobranza/pagos/retroactivo/', payload, { signal });

export const anularPago = (pagoId, motivo, signal) =>
    apiClient.post(`cobranza/pagos/${pagoId}/anular/`, { motivo }, { signal });

/* ── Módulo de Solvencia (dashboard, reportes por concepto, estado de cuenta) ── */

export const getConceptosCobrables = (signal) =>
    apiClient.get('cobranza/conceptos-cobrables/', { signal });

export const getSolvenciaMensual = (params, signal) =>
    apiClient.get('cobranza/solvencia-mensual/', { params, signal });

export const getResumenPorConcepto = (params, signal) =>
    apiClient.get('cobranza/estado-por-concepto/resumen/', { params, signal });

export const getEstadoPorConcepto = (params, signal) =>
    apiClient.get('cobranza/estado-por-concepto/', { params, signal });

export const exportarEstadoPorConceptoExcel = (params, signal) =>
    apiClient.get('cobranza/estado-por-concepto/exportar-excel/', {
        params,
        responseType: 'blob',
        signal,
    });

export const getEstadoCuentaRepresentante = (representanteId, params, signal) =>
    apiClient.get(`cobranza/representantes/${representanteId}/estado-cuenta/`, { params, signal });

/* ── Cobranza Inteligente (toggle por sede) ── */

export const getCobranzaInteligente = (sedeId, signal) =>
    apiClient.get('cobranza/inteligente/configuracion/', {
        params: sedeId ? { sede: sedeId } : undefined,
        signal,
    });

export const actualizarCobranzaInteligente = (sedeId, datos) =>
    apiClient.patch('cobranza/inteligente/configuracion/', datos, {
        params: sedeId ? { sede: sedeId } : undefined,
    });

/* ── Cobranza Inteligente (gestión y dashboard) ── */

const parametrosSede = (sedeId) => (sedeId ? { sede: sedeId } : undefined);
const BASE_INT = 'cobranza/inteligente';

export const getBandejaInteligente = (sedeId, signal) =>
    apiClient.get(`${BASE_INT}/bandeja/`, { params: parametrosSede(sedeId), signal });

export const accionCicloInteligente = (cicloId, datos) =>
    apiClient.post(`${BASE_INT}/ciclos/${cicloId}/acciones/`, datos);

export const getPagosRevisionInteligente = (sedeId, signal) =>
    apiClient.get(`${BASE_INT}/pagos-revision/`, { params: parametrosSede(sedeId), signal });

export const getConveniosInteligente = (signal) =>
    apiClient.get(`${BASE_INT}/convenios/`, { signal });

export const crearConvenioInteligente = (datos) =>
    apiClient.post(`${BASE_INT}/convenios/`, datos);

export const pagarCuotaConvenio = (cuotaId) =>
    apiClient.post(`${BASE_INT}/convenios/cuotas/${cuotaId}/pagar/`);

export const cancelarConvenioInteligente = (convenioId) =>
    apiClient.post(`${BASE_INT}/convenios/${convenioId}/cancelar/`);

export const getDashboardInteligente = (sedeId, signal) =>
    apiClient.get(`${BASE_INT}/dashboard/`, { params: parametrosSede(sedeId), signal });

export const getLineaBaseInteligente = (sedeId, signal) =>
    apiClient.get(`${BASE_INT}/linea-base/`, { params: parametrosSede(sedeId), signal });

export const guardarLineaBaseInteligente = (sedeId, datos) =>
    apiClient.put(`${BASE_INT}/linea-base/`, datos, { params: parametrosSede(sedeId) });

export const getHistorialCobranzaInteligente = (sedeId, signal) =>
    apiClient.get('cobranza/inteligente/configuracion/historial/', {
        params: sedeId ? { sede: sedeId } : undefined,
        signal,
    });
