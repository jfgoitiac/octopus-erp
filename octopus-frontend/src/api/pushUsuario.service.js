import apiClient from './apiClient';

// Web Push de usuarios del panel (administrativos y docentes).
const URL = 'notificaciones/push/usuario/';

export const getEstadoPushUsuario = () => apiClient.get(URL);

export const suscribirPushUsuario = (subscription) =>
    apiClient.post(URL, { endpoint: subscription.endpoint, keys: subscription.toJSON().keys });

export const desuscribirPushUsuario = (endpoint) =>
    apiClient.delete(URL, { data: { endpoint } });
