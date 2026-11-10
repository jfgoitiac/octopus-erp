import { memo } from 'react';

/**
 * Grilla de productos del POS. Va memoizada: el carrito cambia en cada toque
 * y, sin esto, se re-renderizaban todos los botones del catálogo. Mientras
 * `productos` y `onAgregar` no cambien (onAgregar debe ser estable), no se
 * vuelve a pintar.
 */
function GrillaProductos({ productos, onAgregar }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3">
      {productos.map(p => (
        <button
          key={p.id}
          type="button"
          onClick={() => onAgregar(p)}
          disabled={p.stock_actual <= 0}
          className="group flex flex-col items-start gap-1 rounded-xl px-3 py-3 text-left disabled:opacity-60 disabled:cursor-not-allowed min-h-[72px] transition-colors hover:bg-[var(--pb-light)]"
          style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}
        >
          <span className="text-sm font-medium truncate w-full" style={{ color: 'var(--jet)' }}>{p.nombre}</span>
          <span className="text-base font-semibold tabular-nums" style={{ color: 'var(--pb-mid)' }}>${Number(p.precio).toFixed(2)}</span>
          {p.stock_actual <= 0 && (
            <span className="text-xs font-semibold" style={{ color: 'var(--red)' }}>Sin stock</span>
          )}
        </button>
      ))}
    </div>
  );
}

export default memo(GrillaProductos);
