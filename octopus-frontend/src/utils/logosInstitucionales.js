import axiosInstance from '../api/apiClient';

// Los logos del colegio y AVEC viven en el backend (ConfiguracionSistema).
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
            const [logoColegio, logoAvec] = await Promise.all([
                urlToDataUri(res.data?.logo_colegio),
                urlToDataUri(res.data?.logo_avec),
            ]);
            cache = { logoColegio, logoAvec };
            return cache;
        })
        .catch(() => ({ logoColegio: null, logoAvec: null }))
        .finally(() => { inflight = null; });
    return inflight;
}

export function invalidateLogosInstitucionalesCache() {
    cache = null;
}
