import axiosInstance from './apiClient';

// Por alumno, no por inscripción — el estudiante puede no estar inscrito
// todavía (es una PRE-inscripción).
export const descargarPreinscripcionBlob = (alumnoId, campos) =>
    axiosInstance.post(
        `secretaria/alumnos/${alumnoId}/preinscripcion/`,
        { campos },
        { responseType: 'blob' }
    );

export const buscarAlumnosPreinscripcion = (buscar, signal) =>
    axiosInstance.get(`secretaria/alumnos/?buscar=${encodeURIComponent(buscar)}&page_size=20`, { signal });

// Genera la planilla de todos los alumnos activos en el backend (síncrono) —
// con varios cientos de alumnos supera el timeout global de axiosInstance
// (15s, apiClient.js), así que este request usa uno propio.
// formato: 'individual' (.zip, un .docx por alumno) | 'unico' (un solo .docx)
export const descargarPreinscripcionMasivaBlob = (campos, formato = 'individual') =>
    axiosInstance.post(
        'secretaria/preinscripcion-masiva/',
        { campos, formato },
        { responseType: 'blob', timeout: 120000 }
    );
