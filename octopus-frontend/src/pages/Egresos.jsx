import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, ChevronRight, CircleDollarSign, Landmark, ReceiptText, RefreshCw, Search, TrendingUp } from 'lucide-react';
import { toast } from 'react-toastify';
import { Link, useSearchParams } from 'react-router-dom';
import MenuNuevoEgreso from '../components/egresos/MenuNuevoEgreso';
import SelectorSede from '../components/egresos/SelectorSede';
import { PageHeader } from '../components/ui/PageHeader';
import { TablaScroll } from '../components/ui/TablaScroll';
import DatePickerES from '../components/DatePickerES';
import SkeletonFila from '../components/egresos/SkeletonFila';
import EstadoBadge from '../components/egresos/EstadoBadge';
import DatoResumen from '../components/egresos/DatoResumen';
import { listarEgresos } from '../services/egresosService';
import { fmt, fmtFecha } from '../utils/format';
import { parseApiError } from '../utils/apiError';

const ORIGENES = [
  { valor: '', label: 'Todos' },
  { valor: 'factura', label: 'Contado' },
  { valor: 'cuenta_por_pagar', label: 'CxP liquidadas' },
];
const ESTADOS = [
  { valor: '', label: 'Todos' },
  { valor: 'registrado', label: 'Registrados' },
  { valor: 'anulado', label: 'Anulados' },
];

export default function Egresos() {
  // Las tarjetas del Resumen enlazan aquí con la lista ya filtrada (?estado=, ?sin_comprobante=1, ?desde=…).
  const [params] = useSearchParams();
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtros, setFiltros] = useState(() => ({
    desde: params.get('desde') || '', hasta: params.get('hasta') || '', moneda: '', estado: params.get('estado') || '',
    origen: params.get('origen') || '', sin_comprobante: params.get('sin_comprobante') === '1' ? '1' : '', sede: '',
  }));
  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const { data } = await listarEgresos(filtros);
      setItems(data.results || data);
    } catch (error) { toast.error(parseApiError(error)); } finally { setCargando(false); }
  }, [filtros]);
  useEffect(() => { const timer = setTimeout(cargar, 0); return () => clearTimeout(timer); }, [cargar]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return items;
    return items.filter((x) => [x.numero_documento, x.proveedor_nombre, x.categoria_nombre].some((v) => String(v || '').toLowerCase().includes(q)));
  }, [items, busqueda]);

  // Los egresos anulados no suman al gasto real: se cuentan aparte.
  const resumen = useMemo(() => {
    const activos = visibles.filter((x) => x.estado !== 'anulado');
    const usd = activos.reduce((a, x) => a + Number(x.monto_usd || 0), 0);
    const ves = activos.reduce((a, x) => a + Number(x.monto_ves || 0), 0);
    return { usd, ves, activos: activos.length, anulados: visibles.length - activos.length, promedio: activos.length ? usd / activos.length : 0 };
  }, [visibles]);

  const editar = (campo) => (e) => setFiltros((x) => ({ ...x, [campo]: e.target.value }));
  const hayFiltros = busqueda || filtros.desde || filtros.hasta || filtros.moneda || filtros.estado || filtros.origen || filtros.sin_comprobante || filtros.sede;
  const limpiar = () => { setBusqueda(''); setFiltros({ desde: '', hasta: '', moneda: '', estado: '', origen: '', sin_comprobante: '', sede: '' }); };

  return (
    <div className="space-y-4 animate-fadeIn sm:space-y-5">
      <PageHeader
        titulo="Movimientos"
        descripcion="Todo lo que ha salido de caja: compras de contado y cuentas por pagar ya liquidadas"
        acciones={<MenuNuevoEgreso />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-live="polite">
        <DatoResumen icono={CircleDollarSign} etiqueta="Gastado (USD)" valor={`$ ${fmt(resumen.usd, 2)}`} detalle="Sin contar anulados" />
        <DatoResumen icono={Landmark} etiqueta="Gastado (Bs.)" valor={`Bs. ${fmt(resumen.ves, 2)}`} detalle="Sin contar anulados" />
        <DatoResumen icono={ReceiptText} etiqueta="Egresos" valor={resumen.activos} detalle={`Promedio $ ${fmt(resumen.promedio, 2)}`} />
        <button type="button" onClick={() => setFiltros((x) => ({ ...x, estado: x.estado === 'anulado' ? '' : 'anulado' }))} className="text-left" aria-pressed={filtros.estado === 'anulado'} aria-label="Filtrar egresos anulados">
          <DatoResumen className="h-full transition-shadow hover:shadow-md" icono={Ban} etiqueta="Anulados" valor={resumen.anulados} detalle={filtros.estado === 'anulado' ? 'Mostrando solo anulados' : 'Toca para verlos'} />
        </button>
      </div>

      <div className="space-y-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ash)]" aria-hidden="true" />
          <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="input !pl-9" placeholder="Buscar por proveedor, documento o categoría" aria-label="Buscar egresos" />
        </div>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
          <Segmentado etiqueta="Origen" opciones={ORIGENES} valor={filtros.origen} onChange={(origen) => setFiltros((x) => ({ ...x, origen }))} />
          <Segmentado etiqueta="Estado" opciones={ESTADOS} valor={filtros.estado} onChange={(estado) => setFiltros((x) => ({ ...x, estado }))} />
          <SelectorSede value={filtros.sede} onChange={(sede) => setFiltros((x) => ({ ...x, sede }))} />
        </div>
        {filtros.sin_comprobante && (
          <p className="flex items-center justify-between gap-2 rounded-[10px] bg-[var(--yellow-light)] px-3 py-2 text-xs text-[var(--yellow)]">
            <span>Mostrando solo egresos sin comprobante adjunto.</span>
            <button type="button" onClick={() => setFiltros((x) => ({ ...x, sin_comprobante: '' }))} className="min-h-8 shrink-0 font-semibold underline">Quitar</button>
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
            <DatePickerES value={filtros.desde} onChange={editar('desde')} className="input" placeholder="Desde" />
            <DatePickerES value={filtros.hasta} onChange={editar('hasta')} className="input" placeholder="Hasta" />
            <select value={filtros.moneda} onChange={editar('moneda')} className="input" aria-label="Moneda">
              <option value="">Todas las monedas</option><option value="USD">USD</option><option value="VES">VES</option>
            </select>
          </div>
          <div className="flex gap-2">
            {hayFiltros && <button type="button" onClick={limpiar} className="btn btn-secondary flex-1 sm:flex-none">Limpiar</button>}
            <button type="button" onClick={cargar} className="btn btn-secondary flex-1 sm:flex-none" aria-label="Actualizar lista"><RefreshCw size={15} className={cargando ? 'animate-spin' : ''} /> <span className="sm:hidden">Actualizar</span></button>
          </div>
        </div>
      </div>

      {/* Móvil: una tarjeta por egreso, sin scroll horizontal */}
      <div className="space-y-2 md:hidden">
        {cargando ? [1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-[var(--radius-card)] bg-[var(--surface-sunken)]" />) : visibles.length === 0 ? <EstadoVacio hayFiltros={hayFiltros} onLimpiar={limpiar} /> : visibles.map((item) => (
          <Link key={item.id} to={`/egresos/${item.id}`} className={`block rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-3.5 active:bg-[var(--surface-sunken)] ${item.estado === 'anulado' ? 'opacity-70' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--jet)]">{item.proveedor_nombre || item.proveedor}</p>
                <p className="mt-0.5 truncate text-xs text-[var(--ash)]">{item.categoria_nombre || 'Sin categoría'} · {item.numero_documento || 'Sin documento'}{item.origen === 'cuenta_por_pagar' ? ' · CxP' : ''}</p>
              </div>
              <div className={`shrink-0 text-right tabular-nums ${item.estado === 'anulado' ? 'line-through' : ''}`}>
                <p className="text-sm font-semibold">$ {fmt(item.monto_usd, 2)}</p>
                <p className="text-xs text-[var(--ash)]">Bs. {fmt(item.monto_ves, 2)}</p>
              </div>
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <span className="text-xs tabular-nums text-[var(--ash)]">{fmtFecha(item.fecha_egreso)}</span>
              <span className="flex items-center gap-2"><EstadoBadge estado={item.estado} /><ChevronRight size={16} className="text-[var(--ash)]" aria-hidden="true" /></span>
            </div>
          </Link>
        ))}
      </div>

      {/* Tablet y escritorio */}
      <div className="hidden md:block">
        <TablaScroll>
          <table className="min-w-[780px] w-full text-sm">
            <thead className="border-b border-[var(--border)] text-left text-xs font-medium uppercase tracking-wider text-[var(--ash)]">
              <tr><th className="p-3">Fecha</th><th className="p-3">Documento</th><th className="p-3">Proveedor</th><th className="p-3">Categoría</th><th className="p-3 text-right">Monto</th><th className="p-3">Estado</th><th className="p-3"><span className="sr-only">Acciones</span></th></tr>
            </thead>
            <tbody>
              {cargando ? [1, 2, 3, 4].map((i) => <SkeletonFila key={i} />) : visibles.length === 0 ? (
                <tr><td colSpan="7"><EstadoVacio hayFiltros={hayFiltros} onLimpiar={limpiar} /></td></tr>
              ) : visibles.map((item) => (
                <tr key={item.id} className={`border-t border-[var(--border)] transition-colors hover:bg-[var(--surface-sunken)] ${item.estado === 'anulado' ? 'text-[var(--ash)]' : ''}`}>
                  <td className="whitespace-nowrap p-3 tabular-nums">{fmtFecha(item.fecha_egreso)}</td>
                  <td className="p-3 font-medium tabular-nums">{item.numero_documento || '—'}</td>
                  <td className="max-w-[240px] truncate p-3">{item.proveedor_nombre || item.proveedor}</td>
                  <td className="p-3">{item.categoria_nombre || '—'}{item.origen === 'cuenta_por_pagar' && <span className="ml-2 rounded-full bg-[var(--pb-light)] px-2 py-0.5 text-[11px] font-medium text-[var(--pb-mid)]">CxP</span>}</td>
                  <td className={`whitespace-nowrap p-3 text-right tabular-nums ${item.estado === 'anulado' ? 'line-through' : ''}`}>
                    <span className="font-semibold">$ {fmt(item.monto_usd, 2)}</span>
                    <span className="block text-xs text-[var(--ash)]">Bs. {fmt(item.monto_ves, 2)}</span>
                  </td>
                  <td className="p-3"><EstadoBadge estado={item.estado} /></td>
                  <td className="whitespace-nowrap p-3 text-right">
                    {item.cuenta_por_pagar_id && <Link to={`/cuentas-por-pagar/${item.cuenta_por_pagar_id}`} className="mr-3 text-sm text-[var(--ash)] underline-offset-2 hover:underline">Ver CxP</Link>}
                    <Link to={`/egresos/${item.id}`} className="inline-flex min-h-9 items-center gap-0.5 rounded-lg px-2 text-sm font-medium text-[var(--pb-mid)] hover:bg-[var(--pb-light)]">Ver <ChevronRight size={15} aria-hidden="true" /></Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablaScroll>
      </div>
    </div>
  );
}

function Segmentado({ etiqueta, opciones, valor, onChange }) {
  return (
    <div role="group" aria-label={etiqueta} className="flex gap-1 rounded-xl bg-[var(--surface-sunken)] p-1">
      {opciones.map(({ valor: v, label }) => (
        <button key={label} type="button" aria-pressed={valor === v} onClick={() => onChange(v)}
          className={`min-h-9 flex-1 whitespace-nowrap rounded-lg px-3 text-xs font-medium transition-colors lg:flex-none ${valor === v ? 'bg-[var(--surface)] text-[var(--pb-mid)] shadow-sm' : 'text-[var(--ash)] hover:text-[var(--jet)]'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

function EstadoVacio({ hayFiltros, onLimpiar }) {
  return (
    <div className="rounded-[var(--radius-card)] p-8 text-center sm:p-10">
      <ReceiptText size={28} strokeWidth={1.5} className="mx-auto text-[var(--ash)]" aria-hidden="true" />
      <p className="mt-2 text-sm font-medium text-[var(--jet)]">{hayFiltros ? 'Ningún egreso coincide con tu búsqueda' : 'Aún no hay egresos registrados'}</p>
      <p className="text-xs text-[var(--ash)]">{hayFiltros ? 'Prueba con otro rango de fechas o quita los filtros.' : 'Registra tu primera compra de contado para verla aquí.'}</p>
      <div className="mt-4 flex flex-col items-center justify-center gap-2 sm:flex-row">
        {hayFiltros && <button type="button" onClick={onLimpiar} className="btn btn-secondary w-full sm:w-auto">Quitar filtros</button>}
        <Link to="/egresos/nuevo" className="btn btn-primary w-full sm:w-auto"><TrendingUp size={16} /> Registrar compra</Link>
      </div>
    </div>
  );
}
