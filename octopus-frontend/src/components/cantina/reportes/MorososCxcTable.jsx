import { TablaScroll } from '../../ui/TablaScroll';
import { fmtUsd, num, TIPO_LABELS } from '../cxc/utilsCxc';

// Deudores de cuentas por cobrar (representantes y clientes generales) del
// reporte de morosos. Los clientes generales no reciben avisos automáticos.
export default function MorososCxcTable({ filas }) {
  if (!filas.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold" style={{ color: 'var(--jet)' }}>Cuentas por cobrar vencidas</h2>
        <p className="text-xs" style={{ color: 'var(--ash)' }}>
          Ordenadas por antigüedad de la deuda. Los clientes generales (personal y otros) no reciben avisos automáticos.
        </p>
      </div>

      <ul className="flex flex-col gap-2 md:hidden">
        {filas.map(f => (
          <li key={`${f.tipo}-${f.id}`} className="rounded-xl p-3 flex flex-col gap-1" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold break-words" style={{ color: 'var(--jet)' }}>{f.nombre}</p>
              <p className="text-sm font-bold shrink-0" style={{ color: 'var(--red)' }}>{fmtUsd(f.saldo_usd)}</p>
            </div>
            <p className="text-xs" style={{ color: 'var(--ash)' }}>
              {TIPO_LABELS[f.tipo] || f.tipo} · {f.dias_deuda_mas_antigua} días · {f.telefono || 'Sin teléfono'}
            </p>
          </li>
        ))}
      </ul>

      <div className="hidden md:block rounded-xl overflow-hidden" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
        <TablaScroll>
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest" style={{ color: 'var(--ash)', borderBottom: '0.5px solid var(--border-md)' }}>
                <th className="px-4 py-3 font-medium">Titular</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Teléfono</th>
                <th className="px-4 py-3 font-medium text-right">Deuda USD</th>
                <th className="px-4 py-3 font-medium text-right">Días</th>
                <th className="px-4 py-3 font-medium">Avisos</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(f => (
                <tr key={`${f.tipo}-${f.id}`} style={{ borderBottom: '0.5px solid var(--border)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--jet)' }}>{f.nombre}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--ash)' }}>{TIPO_LABELS[f.tipo] || f.tipo}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--ash)' }}>{f.telefono || '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold" style={{ color: 'var(--red)' }}>{fmtUsd(f.saldo_usd)}</td>
                  <td className="px-4 py-3 text-right">{num(f.dias_deuda_mas_antigua)}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--ash)' }}>{f.recibe_avisos ? 'Automáticos' : 'No aplica'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablaScroll>
      </div>
    </section>
  );
}
