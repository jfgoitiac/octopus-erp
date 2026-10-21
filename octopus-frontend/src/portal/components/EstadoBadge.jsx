/** Insignia de estado (pago o comprobante) con la etiqueta y el color de utils/estados.js. */
const EstadoBadge = ({ estado, fallback }) => (
  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${estado?.cls || 'bg-[var(--surface-sunken)] text-[var(--jet-mid)]'}`}>
    {estado?.label || fallback || '—'}
  </span>
);

export default EstadoBadge;
