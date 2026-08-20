import { Package, Pencil, SlidersHorizontal, Trash2, AlertTriangle } from 'lucide-react';

export default function ProductosTable({ productos, onEditar, onAjustar, onEliminar }) {
  if (productos.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-xl py-16"
        style={{ border: '1px dashed var(--border-md)', color: 'var(--ash)' }}
      >
        <Package size={32} className="mb-2 opacity-30" />
        <p className="text-sm">Sin productos registrados</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-x-auto" style={{ border: '0.5px solid var(--border-md)' }}>
      <table className="w-full text-sm border-collapse min-w-[760px]">
        <thead>
          <tr style={{ background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
            {['Nombre', 'Categoría', 'Código de barras', 'Precio', 'Stock', 'Estado', 'Acciones'].map(h => (
              <th
                key={h}
                scope="col"
                className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--ash)', whiteSpace: 'nowrap' }}
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
              <td className="px-4 py-3" style={{ color: 'var(--ash)' }}>{p.categoria_nombre ?? p.categoria?.nombre ?? '—'}</td>
              <td className="px-4 py-3 font-mono text-xs" style={{ color: 'var(--ash)' }}>{p.codigo_barras || '—'}</td>
              <td className="px-4 py-3" style={{ color: 'var(--jet)' }}>${Number(p.precio ?? 0).toFixed(2)}</td>
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
              <td className="px-4 py-3">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onEditar(p)}
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ color: 'var(--ash)' }}
                    title="Editar producto"
                    aria-label={`Editar ${p.nombre}`}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => onAjustar(p)}
                    className="p-1.5 rounded-lg transition-colors"
                    style={{ color: 'var(--pb)' }}
                    title="Ajustar stock"
                    aria-label={`Ajustar stock de ${p.nombre}`}
                  >
                    <SlidersHorizontal size={15} />
                  </button>
                  <button
                    onClick={() => onEliminar(p)}
                    className="p-1.5 rounded-lg transition-colors"
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
    </div>
  );
}
