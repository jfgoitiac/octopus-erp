import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { fmt } from '../../../utils/formato';
import { fmtUsd, num } from './PanelFormato';

// Variación contra el período anterior equivalente (CONTRATO §2): verde si
// sube, rojo si baja; `null` cuando el período anterior fue 0.
const tonoVariacion = (pct) => {
  if (pct == null) return { Icono: Minus, color: 'var(--ash)', fondo: 'var(--ash-light)' };
  const n = num(pct);
  if (n > 0) return { Icono: ArrowUpRight, color: 'var(--green)', fondo: 'var(--green-light)' };
  if (n < 0) return { Icono: ArrowDownRight, color: 'var(--red)', fondo: 'var(--red-light)' };
  return { Icono: Minus, color: 'var(--ash)', fondo: 'var(--ash-light)' };
};

const textoVariacion = (pct) => {
  if (pct == null) return 'Sin referencia';
  const n = num(pct);
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n), 2)} %`;
};

// Tarjeta KPI de ventas de un período (hoy / semana / mes).
const KpiVenta = ({ etiqueta, comparacion, datos, destacado = false, className = '' }) => {
  const { Icono, color, fondo } = tonoVariacion(datos?.variacion_pct);
  const cantidad = num(datos?.cantidad);

  return (
    <article
      className={`flex min-w-0 flex-col gap-2 rounded-[var(--radius-card)] p-[var(--pad-card)] sm:p-[var(--pad-card-lg)] ${className}`}
      style={{
        background: destacado ? 'linear-gradient(135deg, var(--pb-light), var(--surface))' : 'var(--surface)',
        border: `1px solid ${destacado ? 'color-mix(in srgb, var(--pb) 25%, transparent)' : 'var(--border)'}`,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--ash)', fontWeight: 'var(--fw-medium)' }}>
        {etiqueta}
      </p>
      <p
        className="truncate text-2xl tabular-nums sm:text-[1.75rem]"
        style={{ color: 'var(--jet)', fontWeight: 'var(--fw-semibold)' }}
        title={fmtUsd(datos?.total_usd)}
      >
        {fmtUsd(datos?.total_usd)}
      </p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs tabular-nums"
          style={{ background: fondo, color, fontWeight: 'var(--fw-medium)' }}
        >
          <Icono size={13} aria-hidden="true" />
          {textoVariacion(datos?.variacion_pct)}
        </span>
        <span className="text-xs" style={{ color: 'var(--ash)' }}>{comparacion}</span>
      </div>
      <p className="text-xs" style={{ color: 'var(--jet-mid)' }}>
        {fmt(cantidad, 0)} venta{cantidad === 1 ? '' : 's'}
      </p>
    </article>
  );
};

export default KpiVenta;
