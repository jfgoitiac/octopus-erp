import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, CircleDollarSign, Landmark, Plus, ReceiptText, RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { TablaScroll } from '../components/ui/TablaScroll';
import DatePickerES from '../components/DatePickerES';
import SkeletonFila from '../components/egresos/SkeletonFila';
import EstadoBadge from '../components/egresos/EstadoBadge';
import DatoResumen from '../components/egresos/DatoResumen';
import { listarEgresos } from '../services/egresosService';
import { fmt, fmtFecha } from '../utils/format';
import { parseApiError } from '../utils/apiError';

const PESTANAS = [
  { clave: 'factura', label: 'Egresos de contado' },
  { clave: 'cxp', label: 'CxP finalizados' },
];

export default function Egresos() {
  const [pestana, setPestana] = useState('factura');
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtros, setFiltros] = useState({ desde: '', hasta: '', moneda: '', estado: '' });
  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const { data } = await listarEgresos({ ...filtros, origen: pestana === 'cxp' ? 'cuenta_por_pagar' : 'factura' });
      setItems(data.results || data);
    } catch (error) { toast.error(parseApiError(error)); } finally { setCargando(false); }
  }, [filtros, pestana]);
  useEffect(() => { const timer = setTimeout(cargar, 0); return () => clearTimeout(timer); }, [cargar]);
  const totalUsd = items.reduce((a, x) => a + Number(x.monto_usd || 0), 0);
  const totalVes = items.reduce((a, x) => a + Number(x.monto_ves || 0), 0);
  const editar = (campo) => (e) => setFiltros((x) => ({ ...x, [campo]: e.target.value }));

  return (
    <div className="space-y-5 animate-fadeIn">
      <PageHeader
        titulo="Egresos"
        descripcion="Compras de contado y egresos finalizados de cuentas por pagar"
        acciones={<Link to="/egresos/nuevo" className="btn btn-primary w-full sm:w-auto"><Plus size={17} /> Registrar contado</Link>}
      />
      <div role="tablist" aria-label="Origen del egreso" className="flex gap-1 overflow-x-auto border-b border-[var(--border)]">
        {PESTANAS.map(({ clave, label }) => {
          const activa = pestana === clave;
          return (
            <button key={clave} role="tab" aria-selected={activa} onClick={() => setPestana(clave)}
              className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition-colors ${activa ? 'border-[var(--pb)] font-semibold text-[var(--jet)]' : 'border-transparent text-[var(--ash)] hover:text-[var(--jet)]'}`}>
              {label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-3 sm:flex-row sm:items-center sm:gap-3">
        <DatePickerES value={filtros.desde} onChange={editar('desde')} className="input" placeholder="Desde" />
        <DatePickerES value={filtros.hasta} onChange={editar('hasta')} className="input" placeholder="Hasta" />
        <select value={filtros.moneda} onChange={editar('moneda')} className="input" aria-label="Moneda">
          <option value="">Todas las monedas</option><option value="USD">USD</option><option value="VES">VES</option>
        </select>
        <select value={filtros.estado} onChange={editar('estado')} className="input" aria-label="Estado">
          <option value="">Todos los estados</option><option value="registrado">Registrados</option><option value="anulado">Anulados</option>
        </select>
        <button onClick={cargar} className="btn btn-secondary w-full sm:w-auto"><RefreshCw size={15} className={cargando ? 'animate-spin' : ''} /> Actualizar</button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DatoResumen icono={CircleDollarSign} etiqueta="Total equivalente USD" valor={`$ ${fmt(totalUsd, 2)}`} detalle={`${items.length} egresos en la lista`} />
        <DatoResumen icono={Landmark} etiqueta="Total equivalente VES" valor={`Bs. ${fmt(totalVes, 2)}`} />
      </div>
      <TablaScroll>
        <table className="min-w-[780px] w-full text-sm">
          <thead className="border-b border-[var(--border)] text-left text-xs font-medium uppercase tracking-wider text-[var(--ash)]">
            <tr><th className="p-3">Fecha</th><th className="p-3">Documento</th><th className="p-3">Proveedor</th><th className="p-3">Categoría</th><th className="p-3 text-right">Monto</th><th className="p-3">Estado</th><th className="p-3"><span className="sr-only">Acciones</span></th></tr>
          </thead>
          <tbody>
            {cargando ? [1, 2, 3, 4].map((i) => <SkeletonFila key={i} />) : items.length === 0 ? (
              <tr><td colSpan="7" className="p-10 text-center">
                <ReceiptText size={28} strokeWidth={1.5} className="mx-auto text-[var(--ash)]" aria-hidden="true" />
                <p className="mt-2 text-sm font-medium text-[var(--jet)]">Sin egresos para estos filtros</p>
                <p className="text-xs text-[var(--ash)]">Ajusta el rango de fechas o registra una compra de contado.</p>
              </td></tr>
            ) : items.map((item) => (
              <tr key={item.id} className={`border-t border-[var(--border)] transition-colors hover:bg-[var(--surface-sunken)] ${item.estado === 'anulado' ? 'text-[var(--ash)]' : ''}`}>
                <td className="whitespace-nowrap p-3 tabular-nums">{fmtFecha(item.fecha_egreso)}</td>
                <td className="p-3 font-medium tabular-nums">{item.numero_documento || '—'}</td>
                <td className="max-w-[240px] truncate p-3">{item.proveedor_nombre || item.proveedor}</td>
                <td className="p-3">{item.categoria_nombre || '—'}</td>
                <td className={`whitespace-nowrap p-3 text-right tabular-nums ${item.estado === 'anulado' ? 'line-through' : ''}`}>
                  <span className="font-semibold">$ {fmt(item.monto_usd, 2)}</span>
                  <span className="block text-xs text-[var(--ash)]">Bs. {fmt(item.monto_ves, 2)}</span>
                </td>
                <td className="p-3"><EstadoBadge estado={item.estado} /></td>
                <td className="whitespace-nowrap p-3 text-right">
                  {item.cuenta_por_pagar_id && <Link to={`/cuentas-por-pagar/${item.cuenta_por_pagar_id}`} className="mr-3 text-sm text-[var(--ash)] underline-offset-2 hover:underline">Ver CxP</Link>}
                  <Link to={`/egresos/${item.id}`} className="inline-flex min-h-8 items-center gap-0.5 rounded-lg px-2 text-sm font-medium text-[var(--pb-mid)] hover:bg-[var(--pb-light)]">Ver <ChevronRight size={15} aria-hidden="true" /></Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TablaScroll>
    </div>
  );
}
