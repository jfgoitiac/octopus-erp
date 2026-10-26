import { Zap, Settings2 } from 'lucide-react';

/**
 * Combos de venta rápida del POS: un clic carga al carrito los productos y
 * cantidades de la plantilla. El monto se muestra en bolívares (tasa vigente)
 * y, en pequeño, en USD.
 */
export default function PlantillasVentaBar({ plantillas, tasa, onAplicar, onGestionar, disabled = false }) {
  return (
    <div className="rounded-2xl p-3" style={{ border: '0.5px solid var(--border-md)', background: '#fff' }}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs uppercase tracking-widest flex items-center gap-1.5" style={{ color: 'var(--ash)' }}>
          <Zap size={13} /> Plantillas de cobro
        </p>
        <button
          type="button"
          onClick={onGestionar}
          className="flex items-center gap-1 text-xs px-2 rounded-lg min-h-[44px]"
          style={{ color: 'var(--pb-mid)' }}
        >
          <Settings2 size={14} /> Gestionar
        </button>
      </div>

      {plantillas.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--ash)' }}>
          Aún no hay plantillas. Crea una con "Gestionar" para cobrar combos con un clic.
        </p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {plantillas.map(p => {
            const totalUsd = Number(p.total_usd) || 0;
            return (
              <button
                key={p.id}
                type="button"
                disabled={disabled}
                onClick={() => onAplicar(p)}
                className="shrink-0 flex flex-col items-start gap-0.5 rounded-xl px-3 py-2 text-left min-h-[56px] min-w-[132px] disabled:opacity-60"
                style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}
              >
                <span className="text-sm font-medium truncate max-w-[180px]" style={{ color: 'var(--jet)' }}>{p.nombre}</span>
                <span className="text-sm font-semibold" style={{ color: 'var(--pb-mid)' }}>
                  {tasa > 0 ? `Bs. ${(totalUsd * tasa).toFixed(2)}` : `$${totalUsd.toFixed(2)}`}
                </span>
                {tasa > 0 && <span className="text-xs" style={{ color: 'var(--ash)' }}>${totalUsd.toFixed(2)}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
