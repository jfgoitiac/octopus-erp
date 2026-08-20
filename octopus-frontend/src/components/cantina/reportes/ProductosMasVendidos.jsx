import { Package } from 'lucide-react';

// Tabla de productos más vendidos del rango (§6/§7.4 cantina.md, FASE 7).
// Espera `productos`: [{ producto_id, nombre, cantidad_total, monto_total }, ...]
// (forma real de ReporteVentasView — ver contrato en api/cantina.service.js).
export default function ProductosMasVendidos({ productos = [] }) {
  if (!productos.length) {
    return (
      <div className="rounded-xl p-8 text-center text-sm" style={{ background: 'var(--porcelain)', color: 'var(--ash)' }}>
        No hay productos vendidos en el rango seleccionado.
      </div>
    );
  }

  const maxCantidad = Math.max(...productos.map(p => Number(p.cantidad_total ?? p.cantidad_vendida ?? 0)), 1);

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)' }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: 'var(--porcelain)' }}>
            <th className="text-left px-4 py-2.5 font-medium" style={{ color: 'var(--ash)' }}>Producto</th>
            <th className="text-right px-4 py-2.5 font-medium" style={{ color: 'var(--ash)' }}>Cantidad</th>
            <th className="text-right px-4 py-2.5 font-medium" style={{ color: 'var(--ash)' }}>Total USD</th>
          </tr>
        </thead>
        <tbody>
          {productos.map((p, i) => {
            const cantidad = Number(p.cantidad_total ?? p.cantidad_vendida ?? 0);
            const pct = Math.round((cantidad / maxCantidad) * 100);
            return (
              <tr key={p.producto_id ?? i} style={{ borderTop: '0.5px solid var(--border-md)' }}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Package size={14} style={{ color: 'var(--pb)' }} />
                    <span style={{ color: 'var(--jet)' }}>{p.nombre ?? p.producto_nombre ?? '—'}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full" style={{ background: 'var(--border-md)' }}>
                    <div
                      className="h-1.5 rounded-full"
                      style={{ width: `${pct}%`, background: 'var(--pb, #0fa3b1)' }}
                    />
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right" style={{ color: 'var(--jet)' }}>{cantidad}</td>
                <td className="px-4 py-2.5 text-right font-medium" style={{ color: 'var(--jet)' }}>
                  ${Number(p.monto_total ?? p.total_usd ?? 0).toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
