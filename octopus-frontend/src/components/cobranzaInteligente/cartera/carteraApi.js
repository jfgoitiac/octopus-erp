import apiClient from '../../../api/apiClient';

const BASE = 'cobranza/inteligente';
const TAM_PAGINA = 100;
const MAX_PAGINAS = 20;

/** Todos los ciclos abiertos de `cartera/` (la vista pagina de a 100). */
export async function getCarteraCompleta(sedeId, signal) {
    const resultados = [];
    for (let page = 1; page <= MAX_PAGINAS; page += 1) {
        const { data } = await apiClient.get(`${BASE}/cartera/`, {
            params: { ...(sedeId ? { sede: sedeId } : {}), page, page_size: TAM_PAGINA }, signal,
        });
        resultados.push(...(data.results || []));
        if (!data.next) break;
    }
    return resultados;
}

export const getExpedienteRepresentante = (representanteId, signal) =>
    apiClient.get(`${BASE}/representantes/${representanteId}/expediente/`, { signal });
