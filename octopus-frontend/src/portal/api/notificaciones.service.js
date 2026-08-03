import portalClient from './portalClient';

/**
 * Estado agregado de la cuenta: si tiene alguna suscripción push activa y
 * qué tipos tiene habilitados.
 */
export const getEstadoPush = () => portalClient.get('notificaciones/push/suscribir/');

/**
 * Registra (o reactiva) la suscripción Web Push del navegador actual para el
 * representante autenticado.
 * @param {PushSubscription} subscription - resultado de pushManager.subscribe()
 * @param {string[]} [tipos] - tipos de notificación a activar
 */
export const suscribirPush = (subscription, tipos) =>
  portalClient.post('notificaciones/push/suscribir/', {
    endpoint: subscription.endpoint,
    keys: subscription.toJSON().keys,
    ...(tipos ? { tipos } : {}),
  });

/**
 * Desactiva la suscripción del `endpoint` dado (soft — no se borra el registro).
 * @param {string} endpoint
 */
export const desuscribirPush = (endpoint) =>
  portalClient.delete('notificaciones/push/desuscribir/', { data: { endpoint } });

/**
 * Actualiza los tipos de notificación push activos (circular, nota, factura,
 * mensaje) en todas las suscripciones activas del representante autenticado.
 * @param {string[]} tipos
 */
export const actualizarTiposPush = (tipos) =>
  portalClient.patch('notificaciones/push/tipos/', { tipos });
