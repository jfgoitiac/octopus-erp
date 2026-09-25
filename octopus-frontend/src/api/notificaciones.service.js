import apiClient from './apiClient';

export const listarPlantillasWhatsApp = (signal) =>
    apiClient.get('notificaciones/plantillas-whatsapp/', signal ? { signal } : undefined);

export const crearPlantillaWhatsApp = (data) =>
    apiClient.post('notificaciones/plantillas-whatsapp/', data);

export const actualizarPlantillaWhatsApp = (id, data) =>
    apiClient.patch(`notificaciones/plantillas-whatsapp/${id}/`, data);

export const eliminarPlantillaWhatsApp = (id) =>
    apiClient.delete(`notificaciones/plantillas-whatsapp/${id}/`);

export const obtenerVariablesWhatsApp = (signal) =>
    apiClient.get('notificaciones/plantillas-whatsapp/variables/', signal ? { signal } : undefined);

export const previsualizarCobroWhatsApp = (data) =>
    apiClient.post('notificaciones/cobro-whatsapp/previsualizar/', data);

export const registrarEnvioManualCobroWhatsApp = (data) =>
    apiClient.post('notificaciones/cobro-whatsapp/registrar-envio-manual/', data);

export const listarLogsCobroWhatsApp = ({ page = 1, pageSize = 20 } = {}, signal) =>
    apiClient.get('notificaciones/logs/', {
        params: { canal: 'whatsapp', tipo: 'cobro_whatsapp', page, page_size: pageSize },
        ...(signal ? { signal } : {}),
    });
