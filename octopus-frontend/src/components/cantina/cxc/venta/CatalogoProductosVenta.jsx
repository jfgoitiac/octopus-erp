import { Package } from 'lucide-react';
import ScannerProducto from '../../pos/ScannerProducto';
import BuscadorProductoManual from '../../pos/BuscadorProductoManual';

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5" aria-busy="true" aria-label="Cargando productos">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-[72px] rounded-xl animate-pulse" style={{ background: 'var(--border-md)' }} />
      ))}
    </div>
  );
}

// Columna de productos de "Nueva venta a crédito": escáner (lector o cámara),
// búsqueda manual por nombre y grilla de productos del área de la caja abierta.
export default function CatalogoProductosVenta({ productos, cargando, onAgregar, disabled }) {
  return (
    <div className="flex flex-col gap-3 min-w-0">
      <ScannerProducto onProductoEncontrado={p => onAgregar(p, 'escaner')} disabled={disabled} />
      <BuscadorProductoManual productos={productos} onSeleccionar={p => onAgregar(p, 'manual')} />

      <div className="rounded-2xl p-3 max-h-[40dvh] lg:max-h-[46dvh] overflow-y-auto" style={{ border: '0.5px solid var(--border-md)', background: '#fff' }}>
        <p className="text-xs uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: 'var(--ash)' }}>
          <Package size={13} /> Productos
        </p>
        {cargando ? (
          <SkeletonGrid />
        ) : productos.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: 'var(--ash)' }}>No hay productos activos en esta caja.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {productos.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => onAgregar(p, 'manual')}
                disabled={disabled || p.stock_actual <= 0}
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
        )}
      </div>
    </div>
  );
}
