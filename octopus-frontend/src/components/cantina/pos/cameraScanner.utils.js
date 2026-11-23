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

export function normalizarCodigoTarjetaLeido(valor) {
  const codigo = String(valor ?? '').trim();
  if (!/^CANT-[A-Za-z0-9-]{3,45}$/i.test(codigo)) return null;
  return codigo.toUpperCase();
}

export function normalizarCodigoProductoLeido(valor) {
  const codigo = String(valor ?? '').trim();
  return /^[A-Za-z0-9-]{3,50}$/.test(codigo) ? codigo : null;
}
