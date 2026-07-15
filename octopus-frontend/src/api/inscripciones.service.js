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

export const listarInscripciones = ({ buscar, page, pageSize }, signal) => {
    const params = new URLSearchParams();
    if (buscar) params.append('buscar', buscar);
    params.append('page', String(page));
    params.append('page_size', String(pageSize));
    return axiosInstance.get(`secretaria/inscripciones/?${params.toString()}`, { signal });
};

// La foto del alumno se sube aparte porque InscripcionSerializer usa escritura
// anidada (alumno.representante) y DRF no soporta objetos anidados en un body
// multipart — solo el endpoint plano de update_info acepta el archivo.
export const subirFotoAlumno = (alumnoId, file) => {
    const formData = new FormData();
    formData.append('foto', file);
    return axiosInstance.patch(`secretaria/alumnos/${alumnoId}/update_info/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
};
