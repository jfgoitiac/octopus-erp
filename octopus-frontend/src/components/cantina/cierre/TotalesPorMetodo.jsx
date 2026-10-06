import { TablaScroll } from '../../ui/TablaScroll';
import { etiquetaMetodo } from '../metodoPagoUtils';

// Normaliza una entrada de `totales_por_metodo` (JSON del cierre, D11 del
// prompt CxC: ventas + abonos CxC + recargas de la apertura, por método).
// Se acepta tanto { metodo: "12.50" } como { metodo: { usd, ves } }.
function normalizar(valor) {
  if (valor !== null && typeof valor === 'object') {
    return {
      usd: Number(valor.usd ?? valor.total_usd ?? valor.monto_usd ?? 0),
      ves: valor.ves ?? valor.total_ves ?? valor.monto_ves ?? null,
    };
  }
  return { usd: Number(valor ?? 0), ves: null };
}

export default function TotalesPorMetodo({ totales }) {
  const filas = Object.entries(totales ?? {}).map(([metodo, valor]) => ({ metodo, ...normalizar(valor) }));
  const hayVes = filas.some(f => f.ves !== null && f.ves !== undefined);
  const totalUsd = filas.reduce((acc, f) => acc + f.usd, 0);

  return (
    <div className="rounded-2xl p-4 sm:p-5 flex flex-col gap-3" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
      <div>
        <h2 className="font-semibold text-sm" style={{ color: 'var(--jet)' }}>Totales por método de pago</h2>
        <p className="text-xs" style={{ color: 'var(--ash)' }}>Ventas, abonos de cuentas por cobrar y recargas de esta caja.</p>
      </div>

      {filas.length === 0 ? (
        <p className="text-sm py-4 text-center" style={{ color: 'var(--ash)' }}>Sin movimientos registrados en esta caja.</p>
      ) : (
        <TablaScroll>
          <table className="w-full text-sm min-w-[320px]">
            <thead>
              <tr style={{ background: 'var(--porcelain)' }}>
                <th scope="col" className="text-left px-3 py-2 font-medium" style={{ color: 'var(--ash)' }}>Método</th>
                <th scope="col" className="text-right px-3 py-2 font-medium" style={{ color: 'var(--ash)' }}>USD</th>
                {hayVes && <th scope="col" className="text-right px-3 py-2 font-medium" style={{ color: 'var(--ash)' }}>Bs.</th>}
              </tr>
            </thead>
            <tbody>
              {filas.map(f => (
                <tr key={f.metodo} style={{ borderTop: '0.5px solid var(--border-md)' }}>
                  <td className="px-3 py-2" style={{ color: 'var(--jet)' }}>{etiquetaMetodo(f.metodo)}</td>
                  <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--jet)' }}>${f.usd.toFixed(2)}</td>
                  {hayVes && (
                    <td className="px-3 py-2 text-right font-mono" style={{ color: 'var(--jet)' }}>
                      {f.ves === null || f.ves === undefined ? '—' : Number(f.ves).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '1px solid var(--border-md)' }}>
                <td className="px-3 py-2 font-semibold" style={{ color: 'var(--jet)' }}>Total</td>
                <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: 'var(--jet)' }}>${totalUsd.toFixed(2)}</td>
                {hayVes && <td />}
              </tr>
            </tfoot>
          </table>
        </TablaScroll>
      )}
    </div>
  );
}
