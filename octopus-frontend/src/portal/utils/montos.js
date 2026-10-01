// Formato de montos del portal: REF. en dólares y su equivalente en bolívares
// a la tasa BCV vigente ({ valor, fecha } que envía el backend).

export const fmtMonto = (n) =>
  Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const montoEnBs = (usd, tasaBcv) =>
  tasaBcv ? Number(usd || 0) * Number(tasaBcv.valor) : null;
