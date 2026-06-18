import portalClient from './portalClient';

/**
 * Obtiene el dashboard del representante autenticado.
 * Retorna: { representante, alumnos, resumen_financiero }
 */
export const getDashboard = (signal) => {
  return portalClient.get('dashboard/', signal ? { signal } : undefined);
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
 * @param {string} referenciaBancaria  Nº de referencia/confirmación de la transacción
 * @param {string} metodoPago          transferencia | pago_movil | zelle | punto_de_venta
 */
export const subirComprobante = (mensualidadId, archivo, referenciaBancaria = '', metodoPago = 'transferencia') => {
  const formData = new FormData();
  formData.append('mensualidad_id', mensualidadId);
  formData.append('archivo', archivo);
  formData.append('metodo_pago', metodoPago);
  if (referenciaBancaria) {
    formData.append('referencia_bancaria', referenciaBancaria);
  }

  return portalClient.post('comprobante/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

/**
 * Verifica si una referencia bancaria ya existe en el sistema.
 * Solo para uso del panel administrativo.
 * @param {string} ref  Número de referencia a consultar
 */
export const verificarReferencia = (ref) =>
  portalClient.get('verificar-referencia/', { params: { ref } });

/**
 * Obtiene la lista de bancos activos del colegio para transferencias.
 * Retorna: [{ id, nombre, numero_cuenta, tipo }]
 */
export const getBancos = () => portalClient.get('bancos/');

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
