import portalClient from './portalClient';

/**
 * Obtiene el dashboard del representante autenticado.
 * Retorna: { representante, alumnos, resumen_financiero }
 */
export const getDashboard = () => {
  return portalClient.get('dashboard/');
};

/**
 * Obtiene el historial de pagos paginado para un alumno.
 * @param {number|string} alumnoId
 * @param {number} page
 */
export const getHistorial = (alumnoId, page = 1) => {
  return portalClient.get('historial/', {
    params: { alumno_id: alumnoId, page },
  });
};

/**
 * Sube un comprobante de pago (multipart/form-data).
 * @param {number|string} mensualidadId
 * @param {File} archivo
 */
export const subirComprobante = (mensualidadId, archivo) => {
  const formData = new FormData();
  formData.append('mensualidad_id', mensualidadId);
  formData.append('archivo', archivo);

  return portalClient.post('comprobante/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

/**
 * Obtiene la lista de bancos activos del colegio para transferencias.
 * Retorna: [{ id, nombre, numero_cuenta, tipo }]
 */
export const getBancos = () => portalClient.get('bancos/');

/**
 * Crea una Stripe Checkout Session para pagar una mensualidad.
 * Retorna: { checkout_url, session_id }
 * @param {number|string} mensualidadId
 */
export const crearCheckoutStripe = (mensualidadId) =>
  portalClient.post('stripe/checkout/', { mensualidad_id: mensualidadId });

/**
 * Obtiene la configuración visual pública del colegio (nombre, colores, logo).
 * No requiere autenticación — se llama al montar el portal.
 */
export const getConfigColegio = () => portalClient.get('config-colegio/');

/**
 * Cambia la contraseña del representante autenticado.
 * @param {{ contrasena_actual: string, contrasena_nueva: string, confirmar: string }} data
 */
export const cambiarContrasena = (data) =>
  portalClient.post('cambiar-contrasena/', data);
