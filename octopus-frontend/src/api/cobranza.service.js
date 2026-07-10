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
