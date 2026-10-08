import { TablaScroll } from '../../ui/TablaScroll';
const dinero = (valor, moneda) => `${moneda === 'VES' ? 'Bs.' : '$'} ${Number(valor || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function TablaInformeEgresos({ columnas, filas, cargando }) {
  if (cargando) return <div className="space-y-2 p-4" aria-busy="true" aria-label="Preparando informe">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-8 animate-pulse rounded-lg bg-[var(--surface-sunken)]" />)}</div>;
  return (
    <TablaScroll>
      <table className="min-w-[760px] w-full text-sm">
        <thead className="border-b border-[var(--border)] text-left text-xs font-medium uppercase tracking-wider text-[var(--ash)]">
          <tr>{columnas.map((columna) => <th key={columna.key} className={`p-3 font-semibold ${columna.tipo === 'monto' ? 'text-right' : ''}`}>{columna.label}</th>)}</tr>
        </thead>
        <tbody>
          {filas.length === 0 ? <tr><td colSpan={columnas.length} className="p-8 text-center text-[var(--ash)]">No hay datos para los filtros seleccionados.</td></tr> : filas.map((fila, indice) => (
            <tr key={fila.id || `${fila.mes || fila.articulo || fila.categoria || fila.proveedor}-${indice}`} className="border-t border-[var(--border)]">
              {columnas.map((columna) => columna.tipo === 'monto'
                ? <td key={columna.key} className="whitespace-nowrap p-3 text-right tabular-nums">{dinero(fila[columna.key], columna.moneda || fila.moneda_presupuesto || 'USD')}</td>
                : <td key={columna.key} className="whitespace-nowrap p-3">{fila[columna.key] ?? '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </TablaScroll>
  );
}
