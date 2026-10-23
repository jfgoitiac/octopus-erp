// Los QR se reservan para tarjetas prepago; los códigos de barras son para
// productos. Esta separación evita enviar por error una lectura al flujo
// equivocado (contrato de Cantina en móvil).
export const FORMATOS_QR_TARJETA = ['qr_code'];
export const FORMATOS_BARRAS_PRODUCTO = [
  'code_128',
  'code_39',
  'code_93',
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'itf',
  'codabar',
];

/**
 * Normaliza un valor leído por la cámara antes de enviarlo al flujo existente
 * de tarjetas. Los QR de Cantina codifican siempre el identificador CANT-,
 * nunca URLs ni texto libre.
 */
export function normalizarCodigoTarjetaLeido(valor) {
  const codigo = String(valor ?? '').trim();
  if (!/^CANT-[A-Za-z0-9-]{3,45}$/i.test(codigo)) return null;
  return codigo.toUpperCase();
}

// Un código de barras de producto es un token alfanumérico corto. Los QR no
// se aceptan aquí: son la credencial exclusiva de las tarjetas prepago.
export function normalizarCodigoProductoLeido(valor) {
  const codigo = String(valor ?? '').trim();
  return /^[A-Za-z0-9-]{3,50}$/.test(codigo) ? codigo : null;
}
