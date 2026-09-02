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
 * @param {AbortSignal} [signal]
 */
export const getHistorial = (alumnoId, page = 1, signal) => {
  return portalClient.get('historial/', {
    params: { alumno_id: alumnoId, page },
    ...(signal ? { signal } : {}),
  });
};

/**
 * Sube un comprobante de pago (multipart/form-data).
 * @param {number|string} mensualidadId
 * @param {File} archivo
 * @param {string} referenciaBancaria  Nº de referencia/confirmación de la transacción
 * @param {string} metodoPago          transferencia | pago_movil | zelle | punto_de_venta
 */
export const subirComprobante = (mensualidadId, archivo, referenciaBancaria = '', metodoPago = 'transferencia', bancoReceptorId = '') => {
  const formData = new FormData();
  formData.append('mensualidad_id', mensualidadId);
  formData.append('archivo', archivo);
  formData.append('metodo_pago', metodoPago);
  if (referenciaBancaria) {
    formData.append('referencia_bancaria', referenciaBancaria);
  }
  if (bancoReceptorId) {
    formData.append('banco_receptor_id', bancoReceptorId);
  }

  return portalClient.post('comprobante/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

/**
 * Descarga el recibo PDF de un pago confirmado del historial (blob).
 * @param {number|string} pagoId
 */
export const getReciboPago = (pagoId) =>
  portalClient.get(`recibo/${pagoId}/`, { responseType: 'blob' });

/**
 * Solicita el envío del email de recuperación de contraseña.
 * La respuesta es siempre 200 con el mismo mensaje (exista o no la cuenta),
 * así que el frontend no debe intentar distinguir "no existe" de "enviado".
 * @param {string} cedulaOEmail
 */
export const solicitarResetPassword = (cedulaOEmail) =>
  portalClient.post('reset-password/solicitar/', { cedula_o_email: cedulaOEmail });

/**
 * Aplica la nueva contraseña usando el uid/token del link recibido por email.
 * @param {string} uid
 * @param {string} token
 * @param {string} contrasenaNueva
 * @param {string} confirmar
 */
export const confirmarResetPassword = (uid, token, contrasenaNueva, confirmar) =>
  portalClient.post('reset-password/confirmar/', {
    uid, token, contrasena_nueva: contrasenaNueva, confirmar,
  });

/**
 * Verifica si una referencia bancaria ya existe en el sistema.
 * Solo para uso del panel administrativo.
 * @param {string} ref  Número de referencia a consultar
 * @param {string} [metodo]  Método de pago (opcional, acota la búsqueda)
 * @param {string|number} [bancoId]  ID del banco receptor (opcional, acota la búsqueda)
 */
export const verificarReferencia = (ref, metodo, bancoId) => {
  const params = { ref };
  if (metodo !== undefined) params.metodo = metodo;
  if (bancoId !== undefined) params.banco_id = bancoId;
  return portalClient.get('verificar-referencia/', { params });
};

/**
 * Obtiene la lista de bancos activos del colegio para transferencias.
 * Retorna: [{ id, nombre, numero_cuenta, tipo }]
 */
export const getBancos = () => portalClient.get('bancos/');

/**
 * Cambia la contraseña del representante autenticado.
 * @param {{ contrasena_actual: string, contrasena_nueva: string, confirmar: string }} data
 */
export const cambiarContrasena = (data) =>
  portalClient.post('cambiar-contrasena/', data);

// ── Cantina (Fase 3 — extensión del portal, contrato real de portal/views.py:
// PortalSaldoTarjetaView / PortalHistorialConsumoCantinaView / PortalRecargarTarjetaView) ──

/**
 * Obtiene el saldo y estado de la tarjeta de cantina de los hijos del
 * representante. Si se pasa alumnoId, el backend filtra y devuelve un
 * arreglo de 1 elemento (la respuesta SIEMPRE es un arreglo, uno por alumno).
 * Cada elemento: { alumno_id, alumno_nombre, grado_seccion, tiene_tarjeta,
 *   tarjeta_id, saldo, estado, estado_display, limite_credito, en_negativo,
 *   saldo_negativo_desde, dias_en_negativo }
 * @param {number|string} [alumnoId]
 * @param {AbortSignal} [signal]
 */
export const getSaldoTarjetaCantina = (alumnoId, signal) => {
  return portalClient.get('cantina/saldo/', {
    params: alumnoId ? { alumno_id: alumnoId } : undefined,
    ...(signal ? { signal } : {}),
  });
};

/**
 * Obtiene el historial de consumos (MovimientoTarjeta tipo 'consumo') de la
 * tarjeta de cantina de un alumno, paginado.
 * Retorna: { alumno, tiene_tarjeta, total, page, page_size, total_pages,
 *   results: [{ id, tipo, tipo_display, monto, saldo_antes, saldo_despues, creado_en }] }
 * @param {number|string} alumnoId
 * @param {number} page
 * @param {number} pageSize
 * @param {AbortSignal} [signal]
 */
export const getHistorialConsumoCantina = (alumnoId, page = 1, pageSize = 10, signal) => {
  return portalClient.get('cantina/historial/', {
    params: { alumno_id: alumnoId, page, page_size: pageSize },
    ...(signal ? { signal } : {}),
  });
};

/**
 * Solicita una recarga de saldo de la tarjeta de cantina (multipart/form-data).
 * Crea un RecargaTarjeta en estatus 'pendiente' (registrado_por_portal=True) —
 * el saldo NUNCA se acredita aquí, solo al aprobarse desde el admin de cantina.
 * @param {{
 *   alumno_id: number|string,
 *   metodo_pago: 'transferencia'|'pago_movil'|'zelle'|'efectivo_ves',
 *   monto_usd?: string|number,
 *   monto_ves?: string|number,
 *   banco_receptor_id?: number|string,
 *   banco_procedencia?: string,
 *   referencia?: string,
 *   archivo?: File,
 * }} payload  Se requiere monto_usd O monto_ves (al menos uno) — el otro se
 *   deriva en el backend con la tasa vigente.
 */
export const recargarTarjetaCantina = (payload) => {
  const formData = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    formData.append(key, value);
  });

  return portalClient.post('cantina/recargar/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
