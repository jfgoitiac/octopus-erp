import { Package, Pencil, SlidersHorizontal, Trash2, AlertTriangle } from 'lucide-react';
import { TablaScroll } from '../../ui/TablaScroll';
import { ETIQUETA_AREA } from '../../../cantina/aperturaEvento';

// Margen bruto sobre el precio de venta; null si falta el costo (productos
// anteriores a la Auditoría) o el precio es 0.
function margenPct(p) {
  const precio = Number(p.precio);
  if (p.costo == null || p.costo === '' || !(precio > 0)) return null;
  return ((precio - Number(p.costo)) / precio) * 100;
}

export default function ProductosTable({ productos, hayBusqueda = false, onLimpiarBusqueda, onEditar, onAjustar, onEliminar }) {
  if (productos.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-xl py-16 px-4 text-center"
        style={{ border: '1px dashed var(--border-md)', color: 'var(--ash)' }}
      >
        <Package size={32} className="mb-2 opacity-30" />
        <p className="text-sm">{hayBusqueda ? 'Ningún producto coincide con la búsqueda' : 'Sin productos registrados'}</p>
        {hayBusqueda && onLimpiarBusqueda && (
          <button
            type="button"
            onClick={onLimpiarBusqueda}
            className="mt-3 px-4 rounded-xl text-sm font-medium min-h-[44px]"
            style={{ color: 'var(--pb)', border: '0.5px solid var(--border-md)', background: '#fff' }}
          >
            Limpiar búsqueda
          </button>
        )}
      </div>
    );
  }

  return (
    <TablaScroll className="rounded-xl" >
      <table className="w-full text-sm border-collapse min-w-[940px]" style={{ border: '0.5px solid var(--border-md)' }}>
        <thead>
          <tr style={{ background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
            {['Nombre', 'Caja', 'Categoría', 'Código de barras', 'Precio', 'Costo / margen', 'Stock', 'Estado', 'Acciones'].map(h => (
              <th
                key={h}
                scope="col"
                className={`text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider ${h === 'Acciones' ? 'sticky right-0 z-10' : ''}`}
                style={{ color: 'var(--ash)', whiteSpace: 'nowrap', ...(h === 'Acciones' ? { background: 'var(--porcelain)', boxShadow: '-6px 0 8px -6px rgba(0,0,0,0.12)' } : {}) }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {productos.map((p, idx) => (
            <tr
              key={p.id}
              className="bg-transparent hover:bg-[var(--ash-light)] transition-colors"
              style={{
                borderBottom: idx < productos.length - 1 ? '0.5px solid var(--border-md)' : 'none',
                opacity: p.activo === false ? 0.55 : 1,
              }}
            >
              <td className="px-4 py-3 font-medium" style={{ color: 'var(--jet)' }}>{p.nombre}</td>
              <td className="px-4 py-3" style={{ color: 'var(--ash)' }}>{ETIQUETA_AREA[p.area] ?? ETIQUETA_AREA.cantina}</td>
              <td className="px-4 py-3" style={{ color: 'var(--ash)' }}>{p.categoria_nombre ?? p.categoria?.nombre ?? '—'}</td>
              <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--ash)' }}>{p.codigo_barras || '—'}</td>
              <td className="px-4 py-3" style={{ color: 'var(--jet)' }}>${Number(p.precio ?? 0).toFixed(2)}</td>
              <td className="px-4 py-3 whitespace-nowrap">
                {margenPct(p) == null ? (
                  <span style={{ color: 'var(--ash)' }}>—</span>
                ) : (
                  <>
                    <span style={{ color: 'var(--jet)' }}>${Number(p.costo).toFixed(2)}</span>
                    <span className="ml-1.5 text-xs" style={{ color: margenPct(p) < 0 ? 'var(--red)' : 'var(--ash)' }}>
                      {margenPct(p).toFixed(1)} %
                    </span>
                  </>
                )}
              </td>
              <td className="px-4 py-3">
                {p.stock_bajo ? (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                    style={{ background: 'var(--red-light)', color: 'var(--red)' }}
                  >
                    <AlertTriangle size={11} />
                    {p.stock_actual} / mín. {p.stock_minimo}
                  </span>
                ) : (
                  <span style={{ color: 'var(--jet)' }}>{p.stock_actual} / mín. {p.stock_minimo}</span>
                )}
              </td>
              <td className="px-4 py-3">
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{
                    background: p.activo === false ? 'var(--border-md)' : 'var(--pb-light)',
                    color:      p.activo === false ? 'var(--ash)'      : 'var(--pb-mid)',
                  }}
                >
                  {p.activo === false ? 'Inactivo' : 'Activo'}
                </span>
              </td>
              <td className="px-2 sm:px-4 py-1 sticky right-0 z-10" style={{ background: 'var(--porcelain)', boxShadow: '-6px 0 8px -6px rgba(0,0,0,0.12)' }}>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => onEditar(p)}
                    className="w-10 h-10 flex items-center justify-center rounded-lg transition-colors"
                    style={{ color: 'var(--ash)' }}
                    title="Editar producto"
                    aria-label={`Editar ${p.nombre}`}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => onAjustar(p)}
                    className="w-10 h-10 flex items-center justify-center rounded-lg transition-colors"
                    style={{ color: 'var(--pb)' }}
                    title="Ajustar stock"
                    aria-label={`Ajustar stock de ${p.nombre}`}
                  >
                    <SlidersHorizontal size={15} />
                  </button>
                  <button
                    onClick={() => onEliminar(p)}
                    className="w-10 h-10 flex items-center justify-center rounded-lg transition-colors"
                    style={{ color: 'var(--red)' }}
                    title="Eliminar producto"
                    aria-label={`Eliminar ${p.nombre}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TablaScroll>
  );
}
