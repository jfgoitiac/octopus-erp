import { memo } from 'react';

/**
 * Grilla de productos del POS. Va memoizada: el carrito cambia en cada toque
 * y, sin esto, se re-renderizaban todos los botones del catálogo. Mientras
 * `productos` y `onAgregar` no cambien (onAgregar debe ser estable), no se
 * vuelve a pintar.
 */
function GrillaProductos({ productos, onAgregar }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {productos.map(p => (
        <button
          key={p.id}
          type="button"
          onClick={() => onAgregar(p)}
          disabled={p.stock_actual <= 0}
          className="flex flex-col items-start gap-1 rounded-xl px-3 py-2.5 text-left disabled:opacity-60 disabled:cursor-not-allowed min-h-[64px]"
          style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}
        >
          <span className="text-sm font-medium truncate w-full" style={{ color: 'var(--jet)' }}>{p.nombre}</span>
          <span className="text-sm font-semibold" style={{ color: 'var(--pb-mid)' }}>${Number(p.precio).toFixed(2)}</span>
          {p.stock_actual <= 0 && (
            <span className="text-xs font-semibold" style={{ color: 'var(--red)' }}>Sin stock</span>
          )}
        </button>
      ))}
    </div>
  );
}

export default memo(GrillaProductos);
