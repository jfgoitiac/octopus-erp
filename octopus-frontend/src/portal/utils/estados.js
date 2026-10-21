// Etiquetas y colores compartidos por las pantallas del portal, para que un
// mismo estado se lea igual en el inicio, el historial y el aviso de pago.
// Se pintan con components/EstadoBadge.jsx.

export const ESTATUS_PAGO = {
  completado: { label: 'Pagado', cls: 'bg-[var(--green-light)] text-[var(--green)]' },
  anulado: { label: 'Anulado', cls: 'bg-[var(--red-light)] text-[var(--red)]' },
  en_revision: { label: 'En revisión', cls: 'bg-[var(--yellow-light)] text-[var(--yellow)]' },
};

export const ESTATUS_COMPROBANTE = {
  pendiente: { label: 'En revisión', cls: 'bg-[var(--yellow-light)] text-[var(--yellow)]' },
  aprobado: { label: 'Aprobado', cls: 'bg-[var(--green-light)] text-[var(--green)]' },
  rechazado: { label: 'Rechazado', cls: 'bg-[var(--red-light)] text-[var(--red)]' },
};

const METODOS_PAGO = {
  transferencia: 'Transferencia',
  pago_movil: 'Pago móvil',
  zelle: 'Zelle',
  punto_de_venta: 'Punto de venta',
  efectivo: 'Efectivo (USD)',
  efectivo_ves: 'Efectivo (Bs.)',
  tarjeta_prepago: 'Tarjeta prepago',
  mixto: 'Pago mixto',
};

export const etiquetaMetodoPago = (metodo) => {
  if (!metodo) return null;
  return METODOS_PAGO[metodo] || metodo.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
};
