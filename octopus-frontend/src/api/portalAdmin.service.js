import axiosInstance from './apiClient';

/**
 * Activa el acceso al portal para un representante existente.
 * Si ya tiene usuario, lo reactiva. Si no, crea el usuario Django.
 * La contraseña inicial es la cédula salvo que se especifique otra.
 *
 * @param {number} representanteId
 * @param {string} [password]  Contraseña inicial (opcional, default = cédula)
 */
export const activarPortalRepresentante = (representanteId, password) =>
  axiosInstance.post('portal/activar-representante/', {
    representante_id: representanteId,
    ...(password ? { password } : {}),
  });

/**
 * Desactiva el acceso al portal de un representante (no borra el usuario Django).
 * @param {number} representanteId
 */
export const desactivarPortalRepresentante = (representanteId) =>
  axiosInstance.delete(`portal/activar-representante/${representanteId}/`);

/**
 * Restablece la contraseña del portal al valor de la cédula del representante.
 * Internamente llama al mismo endpoint de activar, que actualiza el usuario existente.
 * @param {number} representanteId
 * @param {string} cedula  Cédula del representante (nueva contraseña)
 */
export const restablecerContrasenaPortal = (representanteId, cedula) =>
  axiosInstance.post('portal/activar-representante/', {
    representante_id: representanteId,
    password: cedula,
  });
