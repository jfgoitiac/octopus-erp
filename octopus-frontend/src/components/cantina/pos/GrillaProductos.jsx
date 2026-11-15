import { memo } from 'react';

/**
 * Grilla de productos del POS. Va memoizada: el carrito cambia en cada toque
 * y, sin esto, se re-renderizaban todos los botones del catálogo. Mientras
 * `productos` y `onAgregar` no cambien (onAgregar debe ser estable), no se
 * vuelve a pintar.
 */
const CLASES_DENSIDAD = {
  compacta: {
    grilla: 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5 sm:gap-2',
    boton: 'min-h-[60px] px-2.5 py-2',
  },
  normal: {
    grilla: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-3',
    boton: 'min-h-[72px] px-3 py-3',
  },
  amplia: {
    grilla: 'grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3',
    boton: 'min-h-[88px] px-4 py-4',
  },
};

function GrillaProductos({ productos, onAgregar, densidad = 'normal' }) {
  const clases = CLASES_DENSIDAD[densidad] ?? CLASES_DENSIDAD.normal;
  return (
    <div className={`grid ${clases.grilla}`}>
      {productos.map(p => (
        <button
          key={p.id}
          type="button"
          onClick={() => onAgregar(p)}
          disabled={p.stock_actual <= 0}
          className={`group flex flex-col items-start gap-1 rounded-xl text-left disabled:cursor-not-allowed disabled:opacity-60 transition-colors hover:bg-[var(--pb-light)] ${clases.boton}`}
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
