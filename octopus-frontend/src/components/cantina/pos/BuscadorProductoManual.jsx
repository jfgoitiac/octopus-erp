import { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';

/**
 * Búsqueda manual de respaldo por nombre (§6 cantina.md) — si el código de
 * barras falla o no hay lector, filtra en el cliente sobre la misma lista
 * de productos activos que ya se cargó para el grid de "frecuentes"
 * (ProductosListCreateView no expone un parámetro `search`, así que no hay
 * round-trip extra al backend, se filtra en memoria).
 */
export default function BuscadorProductoManual({ productos, onSeleccionar }) {
  const [busqueda, setBusqueda] = useState('');

  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [];
    return productos.filter(p => p.nombre.toLowerCase().includes(q)).slice(0, 8);
  }, [busqueda, productos]);

  const seleccionar = (producto) => {
    onSeleccionar(producto);
    setBusqueda('');
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
        <input
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar producto manualmente por nombre..."
          aria-label="Búsqueda manual de producto"
          className="w-full pl-9 pr-9 py-2.5 rounded-xl text-sm outline-none min-h-[44px]"
          style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
        />
        {busqueda && (
          <button
            type="button"
            onClick={() => setBusqueda('')}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--ash)' }}
            aria-label="Limpiar búsqueda"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {busqueda.trim() && (
        <div
          className="absolute z-10 mt-1 w-full rounded-xl overflow-hidden shadow-lg bg-white max-h-64 overflow-y-auto"
          style={{ border: '0.5px solid var(--border-md)' }}
        >
          {resultados.length === 0 ? (
            <p className="px-3 py-3 text-sm" style={{ color: 'var(--ash)' }}>Sin coincidencias.</p>
          ) : (
            resultados.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => seleccionar(p)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-gray-50 min-h-[44px]"
                style={{ borderTop: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
              >
                <span className="truncate">{p.nombre}</span>
                <span className="font-medium shrink-0 ml-2" style={{ color: 'var(--pb-mid, #0c7a86)' }}>
                  ${Number(p.precio).toFixed(2)}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
