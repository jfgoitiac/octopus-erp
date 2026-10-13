import apiClient from '../api/apiClient';

// WhatsApp (Meta) por sede — docs/CONTRATO_WHATSAPP_POR_SEDE.md.
// Los secretos llegan enmascarados ("••••1234"); nunca se reenvían así.
const BASE = 'notificaciones/whatsapp-sedes/';

export const listarWhatsAppSedes = () =>
    apiClient.get(BASE).then(r => r.data.results || []);

export const guardarWhatsAppSede = (sedeId, body) =>
    apiClient.patch(`${BASE}${sedeId}/`, body).then(r => r.data);

// Quita el número propio de la sede: vuelve a usar la configuración general.
export const quitarWhatsAppSede = (sedeId) =>
    apiClient.delete(`${BASE}${sedeId}/`).then(r => r.data);

export const probarWhatsAppSede = (sedeId, destino) =>
    apiClient.post('notificaciones/probar/', { canal: 'whatsapp', destino, sede_id: sedeId })
        .then(r => r.data);
