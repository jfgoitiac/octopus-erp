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

export const actualizarClasificacionLinea = (lineaId, payload, signal) =>
    apiClient.patch(`cobranza/pagos/clasificacion/${lineaId}/`, payload, { signal });

export const eliminarClasificacionLinea = (lineaId, signal) =>
    apiClient.delete(`cobranza/pagos/clasificacion/${lineaId}/`, { signal });

export const getDesgloseContable = (params, signal) =>
    apiClient.get('cobranza/pagos/desglose-contable/', { params, signal });
