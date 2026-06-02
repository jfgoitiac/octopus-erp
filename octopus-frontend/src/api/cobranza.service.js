import apiClient from './apiClient';

export const getMorosos = (busqueda, signal) => {
    const params = new URLSearchParams({ estatus: 'mora' });
    if (busqueda?.trim()) params.append('buscar', busqueda.trim());
    return apiClient.get(`secretaria/alumnos/?${params}`, { signal });
};

export const getDeudaAlumno = (cedula, signal) =>
    apiClient.get(`cobranza/buscar/${cedula}/`, { signal });

export const exportarMorososExcel = (busqueda, signal) => {
    const params = new URLSearchParams({ estatus: 'mora' });
    if (busqueda?.trim()) params.append('buscar', busqueda.trim());
    return apiClient.get(`secretaria/exportar-alumnos-excel/?${params}`, {
        responseType: 'blob',
        signal,
    });
};
