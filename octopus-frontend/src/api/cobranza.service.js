import apiClient from './apiClient';

export const getDeudaAlumno = (cedula, signal) =>
    apiClient.get(`cobranza/buscar/${cedula}/`, { signal });

export const exportarMorososExcel = (busqueda, signal) => {
    const params = {};
    if (busqueda?.trim()) params.buscar = busqueda.trim();
    return apiClient.get('cobranza/morosos/exportar-excel/', {
        params,
        responseType: 'blob',
        signal,
    });
};
