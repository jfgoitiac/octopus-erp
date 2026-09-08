import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Search, FileText, Filter, X, ClipboardList, Loader2, ExternalLink,
} from 'lucide-react';
import { getConstanciasEmitidas } from '../../services/constancias';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Tabla } from '../../components/ui/Tabla';
import { TableRowSkeleton } from '../../components/shared/Skeleton';
import Pagination from '../../components/shared/Pagination';

const TIPO_LABEL = {
  estudio: 'Estudio',
  buena_conducta: 'Buena conducta',
  trabajo: 'Trabajo',
};

const PAGE_SIZE = 15;

const inputCls = 'w-full text-xs rounded-lg px-3 py-2 outline-none border transition-all duration-150 focus:border-[color:var(--pb)]';
const inputStyle = {
  background: 'var(--bg)',
  borderColor: 'var(--border-md)',
  color: 'var(--jet)',
  fontSize: '16px',
};

const FILTROS_INICIALES = { tipo: '', numero: '', desde: '', hasta: '' };

export default function HistoricoConstancias() {
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef(null);

  const buildParams = useCallback((f, p) => {
    const params = { page: p, page_size: PAGE_SIZE };
    Object.entries(f).forEach(([k, v]) => { if (v) params[k] = v; });
    return params;
  }, []);

  const cargar = useCallback(async (f, p) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    try {
      const res = await getConstanciasEmitidas(buildParams(f, p), abortRef.current.signal);
      setData(res.data);
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError') return;
      toast.error('No se pudo cargar el histórico de constancias.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    cargar(filtros, 1);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBuscar = () => {
    if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
      toast.warning('La fecha "desde" no puede ser mayor a la fecha "hasta".');
      return;
    }
    setPage(1);
    cargar(filtros, 1);
  };

  const handleLimpiar = () => {
    setFiltros(FILTROS_INICIALES);
    setPage(1);
    cargar(FILTROS_INICIALES, 1);
  };

  const handlePageChange = (p) => { setPage(p); cargar(filtros, p); };

  const set = (k) => (e) => setFiltros(prev => ({ ...prev, [k]: e.target.value }));

  const resultados = data?.results ?? [];
  const total = data?.count ?? 0;
  const totalPages = total ? Math.ceil(total / PAGE_SIZE) : 0;

  const columnas = [
    { key: 'numero', label: 'Número' },
    { key: 'tipo', label: 'Tipo' },
    { key: 'destinatario', label: 'Destinatario' },
    { key: 'fecha', label: 'Fecha de emisión' },
    { key: 'firmada', label: 'Firmada' },
    { key: 'pdf', label: '' },
  ];

  return (
    <div>
      <PageHeader titulo="Histórico de constancias" descripcion="Consulta y descarga constancias ya emitidas" />

      <Card className="mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={13} style={{ color: 'var(--pb)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--jet)' }}>Filtros</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--ash)' }}>Tipo</label>
            <select className={inputCls} style={inputStyle} value={filtros.tipo} onChange={set('tipo')}>
              <option value="">Todos</option>
              {Object.entries(TIPO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--ash)' }}>Número</label>
            <input
              className={inputCls} style={inputStyle}
              value={filtros.numero} onChange={set('numero')}
              placeholder="EST-2025-2026-0042"
              onKeyDown={(e) => e.key === 'Enter' && handleBuscar()}
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--ash)' }}>Desde</label>
            <input type="date" className={inputCls} style={inputStyle} value={filtros.desde} onChange={set('desde')} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--ash)' }}>Hasta</label>
            <input type="date" className={inputCls} style={inputStyle} value={filtros.hasta} onChange={set('hasta')} />
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 pt-3">
          <button
            onClick={handleBuscar}
            disabled={loading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold text-white disabled:opacity-70 min-h-[44px]"
            style={{ background: 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)' }}
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            Buscar
          </button>
          <button
            onClick={handleLimpiar}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-medium min-h-[44px]"
            style={{ color: 'var(--ash)' }}
          >
            <X size={12} /> Limpiar filtros
          </button>
        </div>
      </Card>

      <Card padding="none">
        <Tabla columnas={columnas} minWidth={760}>
          {loading ? (
            <TableRowSkeleton cols={6} rows={6} />
          ) : resultados.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-12 text-center">
                <div className="flex flex-col items-center gap-2">
                  <ClipboardList size={28} style={{ color: 'var(--ash)' }} />
                  <p className="text-xs" style={{ color: 'var(--ash)' }}>No se encontraron constancias emitidas.</p>
                </div>
              </td>
            </tr>
          ) : resultados.map((c) => {
            const nombrePersona = c.alumno
              ? `${c.alumno.nombres} ${c.alumno.apellidos}`
              : c.trabajador
                ? `${c.trabajador.nombres ?? ''} ${c.trabajador.apellidos ?? ''}`.trim()
                : '—';
            return (
              <tr key={c.id}>
                <td className="px-3 py-3 sm:px-4">
                  <span
                    className="font-mono text-xs font-bold px-2 py-1 rounded-lg whitespace-nowrap"
                    style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}
                  >
                    {c.numero}
                  </span>
                </td>
                <td className="px-3 py-3 sm:px-4 text-xs" style={{ color: 'var(--ash)' }}>
                  {TIPO_LABEL[c.tipo] || c.tipo}
                </td>
                <td className="px-3 py-3 sm:px-4">
                  <p className="text-xs font-medium" style={{ color: 'var(--jet)' }}>{nombrePersona}</p>
                  {c.alumno?.cedula_escolar && (
                    <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--ash)' }}>{c.alumno.cedula_escolar}</p>
                  )}
                </td>
                <td className="px-3 py-3 sm:px-4 text-xs whitespace-nowrap" style={{ color: 'var(--ash)' }}>
                  {c.fecha_emision
                    ? format(parseISO(c.fecha_emision), "dd MMM yyyy, HH:mm", { locale: es })
                    : '—'}
                </td>
                <td className="px-3 py-3 sm:px-4">
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      background: c.salio_firmada ? '#dcfce7' : '#f1f5f9',
                      color: c.salio_firmada ? '#16a34a' : '#64748b',
                    }}
                  >
                    {c.salio_firmada ? 'Sí' : 'No'}
                  </span>
                </td>
                <td className="px-3 py-3 sm:px-4">
                  {c.pdf_url ? (
                    <a
                      href={c.pdf_url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Ver PDF de la constancia ${c.numero}`}
                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap"
                      style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}
                    >
                      <FileText size={12} /> PDF <ExternalLink size={11} />
                    </a>
                  ) : (
                    <span className="text-xs" style={{ color: 'var(--ash)' }}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </Tabla>
        {!loading && (
          <Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} total={total} pageSize={PAGE_SIZE} />
        )}
      </Card>
    </div>
  );
}
