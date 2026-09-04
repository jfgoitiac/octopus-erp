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
