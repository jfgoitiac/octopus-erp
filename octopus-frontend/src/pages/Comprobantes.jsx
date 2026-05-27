import { useState, useCallback, useEffect } from 'react';
import {
  Search, FileText, Download, ChevronLeft, ChevronRight,
  ReceiptText, Calendar, User, CreditCard, Filter, X, RefreshCw
} from 'lucide-react';
import apiClient from '../api/apiClient';

const METODOS = [
  { value: '', label: 'Todos los métodos' },
  { value: 'transferencia', label: 'Transferencia Bancaria' },
  { value: 'pago_movil', label: 'Pago Móvil' },
  { value: 'punto_de_venta', label: 'Punto de Venta' },
  { value: 'zelle', label: 'Zelle' },
  { value: 'efectivo', label: 'Efectivo Divisas' },
  { value: 'efectivo_ves', label: 'Efectivo Bolívares' },
];

const CONCEPTOS = [
  { value: '', label: 'Todos los conceptos' },
  { value: 'mensualidad', label: 'Mensualidad Escolar' },
  { value: 'inscripcion', label: 'Inscripción' },
  { value: 'materiales', label: 'Materiales' },
  { value: 'actividades', label: 'Actividades Extraescolares' },
  { value: 'multa', label: 'Multa' },
  { value: 'otro', label: 'Otro' },
];

const ESTATUS = [
  { value: '', label: 'Todos los estatus' },
  { value: 'completado', label: 'Completado' },
  { value: 'anulado', label: 'Anulado' },
  { value: 'en_revision', label: 'En Revisión' },
];

const estatusBadge = (estatus) => {
  const map = {
    completado: { bg: 'var(--green-light, #dcfce7)', color: 'var(--green, #16a34a)', label: 'Completado' },
    anulado:    { bg: '#fee2e2',                     color: '#dc2626',                label: 'Anulado' },
    en_revision:{ bg: '#fef9c3',                     color: '#ca8a04',                label: 'En Revisión' },
  };
  const s = map[estatus] || { bg: '#f1f5f9', color: '#64748b', label: estatus };
  return (
    <span
      className="text-[11px] font-medium px-2 py-0.5 rounded-full"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
};

const inputCls = `
  w-full text-sm rounded-lg px-3 py-2 outline-none border
  focus:border-[color:var(--pb)] transition-colors
`;
const inputStyle = {
  background: 'var(--bg)',
  borderColor: 'var(--border-md)',
  color: 'var(--jet)',
};

export default function Comprobantes() {
  const today = new Date().toISOString().split('T')[0];

  const [filters, setFilters] = useState({
    factura_id: '',
    cedula: '',
    alumno_nombre: '',
    fecha_inicio: '',
    fecha_fin: today,
    metodo_pago: '',
    concepto: '',
    estatus: '',
  });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  const buildParams = useCallback((f, p) => {
    const params = { page: p, page_size: 20 };
    Object.entries(f).forEach(([k, v]) => {
      if (!v) return;
      if (k === 'factura_id' && /^\d+$/.test(v.trim())) {
        params[k] = v.trim().padStart(8, '0');
      } else {
        params[k] = v;
      }
    });
    return params;
  }, []);

  const fetchComprobantes = useCallback(async (f, p) => {
    setLoading(true);
    try {
      const res = await apiClient.get('cobranza/comprobantes/', { params: buildParams(f, p) });
      setData(res.data);
      setSearched(true);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  // Carga inicial automática al montar el componente
  useEffect(() => {
    fetchComprobantes(filters, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchComprobantes]);

  const handleSearch = () => {
    setPage(1);
    fetchComprobantes(filters, 1);
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
    fetchComprobantes(filters, newPage);
  };

  const handleClear = () => {
    const cleared = {
      factura_id: '', cedula: '', alumno_nombre: '',
      fecha_inicio: '', fecha_fin: today,
      metodo_pago: '', concepto: '', estatus: '',
    };
    setFilters(cleared);
    setData(null);
    setSearched(false);
    setPage(1);
  };

  const handleDownloadPDF = async (pagoId, facturaId) => {
    setDownloadingId(pagoId);
    try {
      const res = await apiClient.get(`cobranza/recibo/${pagoId}/`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `Recibo_${facturaId || pagoId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silenciar error de descarga
    } finally {
      setDownloadingId(null);
    }
  };

  const set = (k) => (e) => setFilters(prev => ({ ...prev, [k]: e.target.value }));

  const hasActiveFilters = Object.entries(filters).some(([k, v]) => {
    if (k === 'fecha_fin' && v === today) return false;
    return !!v;
  });

  return (
    <div className="p-6 space-y-5" style={{ color: 'var(--jet)' }}>
      {/* Encabezado */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)' }}
        >
          <ReceiptText size={20} color="#fff" />
        </div>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--jet)' }}>Consulta de Comprobantes</h1>
          <p className="text-xs" style={{ color: 'var(--ash)' }}>
            Busca y descarga comprobantes de pago por recibo, alumno, fecha u otros criterios
          </p>
        </div>
      </div>

      {/* Panel de filtros */}
      <div className="glass rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Filter size={14} style={{ color: 'var(--pb)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Filtros de búsqueda</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {/* Recibo ID */}
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--ash)' }}>
              Nº Recibo
            </label>
            <div className="relative">
              <FileText size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
              <input
                className={inputCls}
                style={{ ...inputStyle, paddingLeft: '1.75rem' }}
                placeholder="Ej: 123 o REC-2026-00000123"
                value={filters.factura_id}
                onChange={set('factura_id')}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
          </div>

          {/* Cédula escolar */}
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--ash)' }}>
              Cédula Escolar
            </label>
            <div className="relative">
              <CreditCard size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
              <input
                className={inputCls}
                style={{ ...inputStyle, paddingLeft: '1.75rem' }}
                placeholder="V-00000000"
                value={filters.cedula}
                onChange={set('cedula')}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
          </div>

          {/* Nombre alumno */}
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--ash)' }}>
              Nombre del Alumno
            </label>
            <div className="relative">
              <User size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
              <input
                className={inputCls}
                style={{ ...inputStyle, paddingLeft: '1.75rem' }}
                placeholder="Nombre o apellido..."
                value={filters.alumno_nombre}
                onChange={set('alumno_nombre')}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
          </div>

          {/* Fecha inicio */}
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--ash)' }}>
              Fecha Desde
            </label>
            <div className="relative">
              <Calendar size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
              <input
                type="date"
                className={inputCls}
                style={{ ...inputStyle, paddingLeft: '1.75rem' }}
                value={filters.fecha_inicio}
                onChange={set('fecha_inicio')}
              />
            </div>
          </div>

          {/* Fecha fin */}
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--ash)' }}>
              Fecha Hasta
            </label>
            <div className="relative">
              <Calendar size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
              <input
                type="date"
                className={inputCls}
                style={{ ...inputStyle, paddingLeft: '1.75rem' }}
                value={filters.fecha_fin}
                onChange={set('fecha_fin')}
              />
            </div>
          </div>

          {/* Método de pago */}
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--ash)' }}>
              Método de Pago
            </label>
            <select
              className={inputCls}
              style={inputStyle}
              value={filters.metodo_pago}
              onChange={set('metodo_pago')}
            >
              {METODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          {/* Concepto */}
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--ash)' }}>
              Concepto
            </label>
            <select
              className={inputCls}
              style={inputStyle}
              value={filters.concepto}
              onChange={set('concepto')}
            >
              {CONCEPTOS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          {/* Estatus */}
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--ash)' }}>
              Estatus
            </label>
            <select
              className={inputCls}
              style={inputStyle}
              value={filters.estatus}
              onChange={set('estatus')}
            >
              {ESTATUS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSearch}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white transition-opacity"
            style={{
              background: 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading
              ? <RefreshCw size={14} className="animate-spin" />
              : <Search size={14} />
            }
            {loading ? 'Buscando...' : 'Buscar'}
          </button>

          {hasActiveFilters && (
            <button
              onClick={handleClear}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ background: 'var(--ash-light)', color: 'var(--ash)' }}
            >
              <X size={14} />
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Resultados */}
      {searched && (
        <div className="glass rounded-2xl overflow-hidden">
          {/* Header de resultados */}
          <div
            className="flex items-center justify-between px-5 py-3"
            style={{ borderBottom: '0.5px solid var(--border)' }}
          >
            <span className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>
              {data ? `${data.total} comprobante${data.total !== 1 ? 's' : ''} encontrado${data.total !== 1 ? 's' : ''}` : 'Sin resultados'}
            </span>
            {data && data.total > 0 && (
              <span className="text-xs" style={{ color: 'var(--ash)' }}>
                Página {data.page} de {data.total_pages}
              </span>
            )}
          </div>

          {/* Tabla */}
          {!data || data.total === 0 ? (
            <div className="py-16 text-center">
              <ReceiptText size={36} className="mx-auto mb-3" style={{ color: 'var(--border-md)' }} />
              <p className="text-sm" style={{ color: 'var(--ash)' }}>No se encontraron comprobantes con esos criterios</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border)' }}>
                      {['Nº Recibo', 'Fecha', 'Alumno', 'Grado', 'Concepto', 'Método', 'Monto USD', 'Monto VES', 'Estatus', 'Acción'].map(h => (
                        <th
                          key={h}
                          className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide"
                          style={{ color: 'var(--ash)', whiteSpace: 'nowrap' }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.results.map((c, idx) => (
                      <tr
                        key={c.id}
                        style={{
                          borderBottom: '0.5px solid var(--border)',
                          background: idx % 2 === 0 ? 'transparent' : 'var(--porcelain)',
                        }}
                      >
                        {/* Recibo ID */}
                        <td className="px-4 py-3">
                          <span
                            className="font-mono text-xs font-semibold px-2 py-1 rounded"
                            style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}
                          >
                            {c.factura_id || `#${c.id}`}
                          </span>
                        </td>

                        {/* Fecha */}
                        <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--ash)' }}>
                          {new Date(c.fecha_pago).toLocaleDateString('es-VE', {
                            day: '2-digit', month: '2-digit', year: 'numeric',
                          })}
                          <br />
                          <span className="text-[11px]">
                            {new Date(c.fecha_pago).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </td>

                        {/* Alumno */}
                        <td className="px-4 py-3">
                          <p className="font-medium" style={{ color: 'var(--jet)' }}>
                            {c.nombre_alumno} {c.apellido_alumno}
                          </p>
                          <p className="text-[11px]" style={{ color: 'var(--ash)' }}>
                            {c.cedula_escolar || '—'}
                          </p>
                        </td>

                        {/* Grado */}
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--ash)' }}>
                          {c.grado || '—'}
                        </td>

                        {/* Concepto */}
                        <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--jet)' }}>
                          {c.concepto_display}
                        </td>

                        {/* Método */}
                        <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--ash)' }}>
                          {c.metodo_pago_display}
                          {c.banco_nombre && (
                            <p className="text-[10px]">{c.banco_nombre}</p>
                          )}
                        </td>

                        {/* Monto USD */}
                        <td className="px-4 py-3 text-right font-mono text-xs font-semibold" style={{ color: 'var(--jet)' }}>
                          $ {Number(c.monto_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>

                        {/* Monto VES */}
                        <td className="px-4 py-3 text-right font-mono text-xs" style={{ color: 'var(--ash)' }}>
                          Bs. {Number(c.monto_ves).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                        </td>

                        {/* Estatus */}
                        <td className="px-4 py-3">
                          {estatusBadge(c.estatus)}
                        </td>

                        {/* Acción */}
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleDownloadPDF(c.id, c.factura_id)}
                            disabled={downloadingId === c.id}
                            title="Descargar recibo PDF"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity"
                            style={{
                              background: 'var(--pb-light)',
                              color: 'var(--pb-mid)',
                              opacity: downloadingId === c.id ? 0.6 : 1,
                            }}
                          >
                            {downloadingId === c.id
                              ? <RefreshCw size={12} className="animate-spin" />
                              : <Download size={12} />
                            }
                            PDF
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              {data.total_pages > 1 && (
                <div
                  className="flex items-center justify-between px-5 py-3"
                  style={{ borderTop: '0.5px solid var(--border)' }}
                >
                  <button
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page <= 1}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity"
                    style={{
                      background: 'var(--ash-light)',
                      color: 'var(--ash)',
                      opacity: page <= 1 ? 0.4 : 1,
                    }}
                  >
                    <ChevronLeft size={13} /> Anterior
                  </button>

                  <div className="flex gap-1">
                    {Array.from({ length: data.total_pages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === data.total_pages || Math.abs(p - page) <= 2)
                      .reduce((acc, p, idx, arr) => {
                        if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...');
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, idx) =>
                        p === '...' ? (
                          <span key={`ellipsis-${idx}`} className="px-2 py-1 text-xs" style={{ color: 'var(--ash)' }}>…</span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => handlePageChange(p)}
                            className="w-7 h-7 rounded-lg text-xs font-medium"
                            style={{
                              background: p === page
                                ? 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)'
                                : 'var(--ash-light)',
                              color: p === page ? '#fff' : 'var(--ash)',
                            }}
                          >
                            {p}
                          </button>
                        )
                      )
                    }
                  </div>

                  <button
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page >= data.total_pages}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity"
                    style={{
                      background: 'var(--ash-light)',
                      color: 'var(--ash)',
                      opacity: page >= data.total_pages ? 0.4 : 1,
                    }}
                  >
                    Siguiente <ChevronRight size={13} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Estado de carga inicial */}
      {!searched && loading && (
        <div className="glass rounded-2xl py-20 text-center">
          <RefreshCw size={36} className="mx-auto mb-4 animate-spin" style={{ color: 'var(--border-md)' }} />
          <p className="text-sm" style={{ color: 'var(--ash)' }}>Cargando comprobantes...</p>
        </div>
      )}

      {/* Error de carga */}
      {!searched && !loading && (
        <div className="glass rounded-2xl py-20 text-center">
          <Search size={40} className="mx-auto mb-4" style={{ color: 'var(--border-md)' }} />
          <p className="font-medium text-sm" style={{ color: 'var(--ash)' }}>
            No se pudieron cargar los comprobantes
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--border-md)' }}>
            Verifica tu conexión y presiona <strong>Buscar</strong>
          </p>
        </div>
      )}
    </div>
  );
}
