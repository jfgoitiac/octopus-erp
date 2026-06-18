import axiosInstance from './apiClient';

export const buscarRepresentante = (cedula, signal) =>
    axiosInstance.get(`secretaria/representante/${encodeURIComponent(cedula)}/`, { signal });

export const fetchAlumnosPorRepresentante = (cedula, signal) =>
    axiosInstance.get(`secretaria/alumnos/?buscar=${encodeURIComponent(cedula)}`, { signal });

export const fetchConfiguracionInscripcion = (signal) =>
    Promise.all([
        axiosInstance.get('secretaria/configuracion-grados/', { signal }),
        axiosInstance.get('secretaria/configuracion/', { signal }),
    ]);

export const crearInscripcion = (payload) =>
    axiosInstance.post('secretaria/inscripcion-nueva/', payload);

export const descargarComprobanteBlob = (id) =>
    axiosInstance.get(`secretaria/inscripciones/${id}/comprobante/`, { responseType: 'blob' });
