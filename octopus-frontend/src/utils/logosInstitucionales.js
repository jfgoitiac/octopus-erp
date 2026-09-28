import axiosInstance from '../api/apiClient';

// Los logos e imágenes institucionales viven en el backend (ConfiguracionSistema).
// Se cachean en memoria por sesión de pestaña para no repetir el GET/descarga en
// cada recibo/impresión; se invalida al guardar cambios desde Configuración.
let cache = null;
let inflight = null;

const urlToDataUri = async (url) => {
    if (!url) return null;
    try {
        const res = await axiosInstance.get(url, { responseType: 'blob' });
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(res.data);
        });
    } catch {
        return null;
    }
};

export async function getLogosInstitucionales() {
    if (cache) return cache;
    if (inflight) return inflight;
    inflight = axiosInstance.get('secretaria/configuracion/')
        .then(async res => {
            const [logoColegio, encabezadoPersonalizado, piePaginaPersonalizado] = await Promise.all([
                urlToDataUri(res.data?.logo_colegio),
                urlToDataUri(res.data?.encabezado_personalizado),
                urlToDataUri(res.data?.pie_pagina_personalizado),
            ]);
            const d = res.data || {};
            cache = {
                nombre: d.nombre_colegio || '',
                rif: d.rif || '',
                direccion: d.direccion_colegio || '',
                telefono: d.telefono_colegio || '',
                municipioEstado: [d.municipio, d.estado_colegio].filter(Boolean).join(', '),
                logoColegio,
                afiliacionNombre: res.data?.afiliacion_nombre || '',
                encabezadoPersonalizado,
                piePaginaPersonalizado,
            };
            return cache;
        })
        .catch(() => ({ nombre: '', rif: '', direccion: '', telefono: '', municipioEstado: '', logoColegio: null, afiliacionNombre: '', encabezadoPersonalizado: null, piePaginaPersonalizado: null }))
        .finally(() => { inflight = null; });
    return inflight;
}

export function invalidateLogosInstitucionalesCache() {
    cache = null;
}
