import { TablaScroll } from '../../ui/TablaScroll';
const dinero = (valor, moneda) => `${moneda === 'VES' ? 'Bs.' : '$'} ${Number(valor || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function TablaInformeEgresos({ columnas, filas, cargando }) {
  if (cargando) return <div className="rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500 bg-white shadow-sm">Preparando informe…</div>;
  return <TablaScroll><table className="min-w-[760px] w-full text-sm"><thead className="bg-slate-50 text-left"><tr>{columnas.map((columna) => <th key={columna.key} className="p-3 font-semibold">{columna.label}</th>)}</tr></thead><tbody>{filas.length === 0 ? <tr><td colSpan={columnas.length} className="p-8 text-center text-slate-500">No hay datos para los filtros seleccionados.</td></tr> : filas.map((fila, indice) => <tr key={fila.id || `${fila.mes || fila.articulo || fila.categoria || fila.proveedor}-${indice}`} className="border-t">{columnas.map((columna) => <td key={columna.key} className="p-3 whitespace-nowrap">{columna.tipo === 'monto' ? dinero(fila[columna.key], columna.moneda || fila.moneda_presupuesto || 'USD') : (fila[columna.key] ?? '—')}</td>)}</tr>)}</tbody></table></TablaScroll>;
}
