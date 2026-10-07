import { useCallback, useEffect, useMemo, useState } from 'react';
import { endOfMonth, format, startOfMonth, subDays, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { FileSpreadsheet, FileText, Filter, RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';
import apiClient from '../api/apiClient';
import DatePickerES from '../components/DatePickerES';
import { PageHeader } from '../components/ui/PageHeader';
import { Modal } from '../components/ui/Modal';
import TablaInformeEgresos from '../components/egresos/reportes/TablaInformeEgresos';
import { columnasInforme } from '../components/egresos/reportes/columnasInforme';
import { descargarReporteEgresosPDF } from '../utils/egresosPDF';
import { descargarReporteEgresosExcel } from '../utils/egresosExcel';
import { useInstitucionPDF } from '../hooks/useInstitucionPDF';

const INFORMES = [
  ['relacion-detallada', 'Relación detallada'], ['por-categoria', 'Por categoría'], ['por-proveedor', 'Por proveedor'], ['por-sede', 'Por sede'],
  ['comparativo-mensual', 'Comparativo mensual · 12 meses'], ['ejecucion-presupuestaria', 'Ejecución presupuestaria'], ['libro-compras', 'Libro de compras'], ['historial-articulos', 'Historial de artículo'],
];
const fecha = (valor) => format(valor, 'yyyy-MM-dd');
const titulo = (id) => INFORMES.find(([clave]) => clave === id)?.[1] || 'Informe';

export default function ReportesEgresos() {
  const hoy = new Date();
  const [informe, setInforme] = useState('relacion-detallada');
  const [filtros, setFiltros] = useState({ desde: fecha(startOfMonth(hoy)), hasta: fecha(hoy), moneda: 'original', sede: '', proveedor: '', categoria: '', articulo: '' });
  const [filas, setFilas] = useState([]); const [cargando, setCargando] = useState(false); const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [fiscalActivo, setFiscalActivo] = useState(true); const institucion = useInstitucionPDF();
  const columnas = useMemo(() => columnasInforme(informe, fiscalActivo, filtros.moneda), [informe, fiscalActivo, filtros.moneda]);
  const visibles = useMemo(() => filas.filter((fila) => {
    const proveedor = String(fila.proveedor || fila.proveedor__razon_social || '').toLowerCase();
    const categoria = String(fila.categoria || fila.categoria__nombre || '').toLowerCase();
    return (!filtros.proveedor || proveedor.includes(filtros.proveedor.toLowerCase())) && (!filtros.categoria || categoria.includes(filtros.categoria.toLowerCase()));
  }), [filas, filtros.proveedor, filtros.categoria]);
  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const { data } = await apiClient.get(`egresos/reportes/${informe}/`, { params: { desde: filtros.desde || undefined, hasta: filtros.hasta || undefined, moneda: filtros.moneda, sede: filtros.sede || undefined, articulo: filtros.articulo || undefined } });
      setFilas(data.resultados || []);
    } catch (error) { toast.error(error.response?.data?.detalle || 'No se pudo cargar el informe.'); }
    finally { setCargando(false); }
  }, [filtros.articulo, filtros.desde, filtros.hasta, filtros.moneda, filtros.sede, informe]);
  useEffect(() => { const temporizador = setTimeout(cargar, 0); return () => clearTimeout(temporizador); }, [cargar]);
  useEffect(() => { apiClient.get('egresos/configuracion/').then(({ data }) => setFiscalActivo(data.fiscal_activo !== false)).catch(() => {}); }, []);
  const atajo = (tipo) => {
    const hasta = hoy;
    const desde = tipo === 'hoy' ? hoy : tipo === '7d' ? subDays(hoy, 6) : tipo === 'mes' ? startOfMonth(hoy) : startOfMonth(subMonths(hoy, 2));
    setFiltros((actual) => ({ ...actual, desde: fecha(desde), hasta: fecha(tipo === '3m' ? endOfMonth(hoy) : hasta) }));
  };
  const exportar = (formato) => {
    const payload = { titulo: titulo(informe), columnas, filas: visibles, moneda: filtros.moneda, desde: filtros.desde, hasta: filtros.hasta, institucion };
    if (formato === 'pdf') descargarReporteEgresosPDF(payload); else descargarReporteEgresosExcel(payload);
  };
  const editar = (campo) => (evento) => setFiltros((actual) => ({ ...actual, [campo]: evento.target.value }));
  return <div className="space-y-5 animate-fadeIn">
    <PageHeader titulo="Informes de egresos" descripcion="Disponible para administradores y directores; los valores usan los snapshots de cada documento." acciones={<div className="flex gap-2"><button onClick={() => exportar('pdf')} disabled={!visibles.length} className="flex-1 sm:flex-none inline-flex justify-center items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50"><FileText size={16} /> PDF</button><button onClick={() => exportar('excel')} disabled={!visibles.length} className="flex-1 sm:flex-none inline-flex justify-center items-center gap-2 rounded-lg px-3 py-2 text-sm text-white disabled:opacity-50" style={{ background: 'var(--pb)' }}><FileSpreadsheet size={16} /> Excel</button></div>} />
    <div className="rounded-xl border p-3 sm:p-4 space-y-3"><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2"><select value={informe} onChange={(e) => setInforme(e.target.value)} className="rounded-lg border p-2 text-sm">{INFORMES.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}</select><select value={filtros.moneda} onChange={editar('moneda')} className="rounded-lg border p-2 text-sm"><option value="original">Moneda original / ambas</option><option value="usd">USD</option><option value="ves">Bolívares</option></select><DatePickerES value={filtros.desde} onChange={editar('desde')} className="w-full rounded-lg border p-2 text-sm" placeholder="Desde" /><DatePickerES value={filtros.hasta} onChange={editar('hasta')} className="w-full rounded-lg border p-2 text-sm" placeholder="Hasta" /></div><div className="flex flex-wrap gap-2"><span className="text-xs self-center text-slate-500">Atajos:</span>{[['hoy', 'Hoy'], ['7d', '7 días'], ['mes', 'Este mes'], ['3m', '3 meses']].map(([id, nombre]) => <button key={id} onClick={() => atajo(id)} className="rounded-full border px-3 py-1 text-xs">{nombre}</button>)}<button onClick={() => setFiltrosAbiertos(true)} className="ml-auto inline-flex items-center gap-1 rounded-lg border px-3 py-1 text-sm"><Filter size={15} /> Más filtros</button><button onClick={cargar} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1 text-sm"><RefreshCw size={15} /> Actualizar</button></div></div>
    <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">{informe === 'libro-compras' ? 'Libro de compras: las fechas y montos fiscales corresponden a la factura.' : 'Los demás informes reconocen el gasto por la fecha de pago/egreso; los importes USD y Bs. son los guardados al registrarlo.'} {fiscalActivo ? '' : 'Los detalles fiscales están ocultos por la configuración vigente.'}</p>
    <section className="rounded-xl border overflow-hidden"><div className="border-b px-4 py-3 flex justify-between gap-3"><h2 className="font-semibold">{titulo(informe)}</h2><span className="text-xs text-slate-500">{format(new Date(`${filtros.desde}T12:00:00`), "d MMM", { locale: es })} – {format(new Date(`${filtros.hasta}T12:00:00`), "d MMM yyyy", { locale: es })}</span></div><TablaInformeEgresos columnas={columnas} filas={visibles} cargando={cargando} /></section>
    <Modal open={filtrosAbiertos} onClose={() => setFiltrosAbiertos(false)} titulo="Filtros del informe" footer={<button onClick={() => setFiltrosAbiertos(false)} className="rounded-lg px-4 py-2 text-white" style={{ background: 'var(--pb)' }}>Aplicar</button>}><div className="grid gap-4"><label className="text-sm">ID de sede<input value={filtros.sede} onChange={editar('sede')} inputMode="numeric" className="mt-1 w-full rounded-lg border p-2" placeholder="Todas las sedes autorizadas" /></label><label className="text-sm">Proveedor (filtra resultados)<input value={filtros.proveedor} onChange={editar('proveedor')} className="mt-1 w-full rounded-lg border p-2" placeholder="Nombre del proveedor" /></label><label className="text-sm">Categoría (filtra resultados)<input value={filtros.categoria} onChange={editar('categoria')} className="mt-1 w-full rounded-lg border p-2" placeholder="Nombre de categoría" /></label>{informe === 'historial-articulos' && <label className="text-sm">ID de artículo<input value={filtros.articulo} onChange={editar('articulo')} inputMode="numeric" className="mt-1 w-full rounded-lg border p-2" placeholder="Todos los artículos" /></label>}</div></Modal>
  </div>;
}
