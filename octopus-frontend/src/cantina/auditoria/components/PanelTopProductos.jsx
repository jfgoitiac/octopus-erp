import { Package, TrendingUp } from 'lucide-react';
import PanelTarjeta, { PanelVacio } from './PanelTarjeta';
import { fmt } from '../../../utils/formato';
import { fmtUsd, num } from './PanelFormato';

// Top 5 productos del mes (CONTRATO §2), con barra relativa a la cantidad.
const PanelTopProductos = ({ productos = [] }) => {
  const max = Math.max(...productos.map((p) => num(p.cantidad)), 1);

  return (
    <PanelTarjeta icono={TrendingUp} titulo="Top productos del mes">
      {productos.length === 0 ? (
        <PanelVacio icono={Package} texto="Aún no hay ventas este mes." />
      ) : (
        <ol className="flex flex-col gap-3">
          {productos.map((p, i) => (
            <li key={p.producto_id ?? i} className="flex items-center gap-3">
              <span
                className="flex size-7 shrink-0 items-center justify-center rounded-lg text-xs tabular-nums"
                style={{
                  background: i === 0 ? 'var(--pb)' : 'var(--jet-light)',
                  color: i === 0 ? '#fff' : 'var(--jet-mid)',
                  fontWeight: 'var(--fw-semibold)',
                }}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm" style={{ color: 'var(--jet)', fontWeight: 'var(--fw-medium)' }}>{p.nombre}</p>
                  <p className="shrink-0 text-sm tabular-nums" style={{ color: 'var(--jet)', fontWeight: 'var(--fw-semibold)' }}>
                    {fmtUsd(p.total_usd)}
                  </p>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--jet-light)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.round((num(p.cantidad) / max) * 100)}%`, background: 'var(--pb)' }}
                    />
                  </div>
                  <span className="shrink-0 text-xs tabular-nums" style={{ color: 'var(--ash)' }}>
                    {fmt(num(p.cantidad), 0)} u.
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </PanelTarjeta>
  );
};

export default PanelTopProductos;
