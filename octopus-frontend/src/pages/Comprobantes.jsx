import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  Search, FileText, Printer, ChevronLeft, ChevronRight,
  ReceiptText, Calendar, User, CreditCard, Filter, X, RefreshCw,
  CheckCircle2, XCircle, Clock, TrendingUp
} from 'lucide-react';
import { toast } from 'react-toastify';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import apiClient from '../api/apiClient';
import { printReciboCobranza } from '../utils/printReciboCobranza';
import { printComprobanteCompacto } from '../utils/printComprobanteCompacto';

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

const METODO_COLORS = {
  transferencia:   { bg: '#eff6ff', color: '#2563eb' },
  pago_movil:      { bg: '#f0fdf4', color: '#16a34a' },
  punto_de_venta:  { bg: '#fdf4ff', color: '#9333ea' },
  zelle:           { bg: '#fff7ed', color: '#ea580c' },
  efectivo:        { bg: '#fefce8', color: '#ca8a04' },
  efectivo_ves:    { bg: '#fef2f2', color: '#dc2626' },
};

const estatusConfig = {
  completado:  { bg: '#dcfce7', color: '#16a34a', icon: CheckCircle2, label: 'Completado' },
  anulado:     { bg: '#fee2e2', color: '#dc2626', icon: XCircle,       label: 'Anulado' },
  en_revision: { bg: '#fef9c3', color: '#ca8a04', icon: Clock,         label: 'En Revisión' },
};

const EstatusBadge = ({ estatus }) => {
  const cfg = estatusConfig[estatus] || { bg: '#f1f5f9', color: '#64748b', icon: null, label: estatus };
  const Icon = cfg.icon;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {Icon && <Icon size={10} strokeWidth={2.5} />}
      {cfg.label}
    </span>
  );
};

const MetodoPill = ({ metodo, label, banco }) => {
  const c = METODO_COLORS[metodo] || { bg: '#f1f5f9', color: '#64748b' };
  return (
    <span
      className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md whitespace-nowrap"
      style={{ background: c.bg, color: c.color }}
    >
      {label}{banco ? ` · ${banco}` : ''}
    </span>
  );
};

const inputCls = `
  w-full text-xs rounded-lg px-3 py-2 outline-none border transition-all duration-150
  focus:border-[color:var(--pb)]
`;
const inputStyle = {
  background: 'var(--bg)',
  borderColor: 'var(--border-md)',
  color: 'var(--jet)',
};

const SkeletonRow = () => (
  <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
    {[90, 70, 130, 60, 80, 140, 100, 70, 60].map((w, i) => (
      <td key={i} className="px-4 py-3.5">
        <div
          className="h-3.5 rounded-full animate-pulse"
          style={{ width: w, background: 'var(--border-md)', opacity: 0.5 }}
        />
      </td>
    ))}
  </tr>
);

export default function Comprobantes() {
  const today = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);

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
  const [hoveredRow, setHoveredRow] = useState(null);

  const abortControllerRef = useRef(null);

  const buildParams = useCallback((f, p) => {
    const params = { page: p, page_size: 20 };
    Object.entries(f).forEach(([k, v]) => {
      if (!v) return;
      params[k] = v.trim ? v.trim() : v;
    });
    return params;
  }, []);

  const fetchComprobantes = useCallback(async (f, p) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    try {
      const res = await apiClient.get('cobranza/comprobantes/', {
        params: buildParams(f, p),
        signal: abortControllerRef.current.signal,
      });
      setData(res.data);
      setSearched(true);
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || err.name === 'AbortError') return;
      setData(null);
      setPage(1);
      toast.error('Error al cargar comprobantes. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    fetchComprobantes(filters, 1);
    return () => { abortControllerRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchComprobantes]);

  const handleSearch = () => {
    if (filters.fecha_inicio && filters.fecha_fin && filters.fecha_inicio > filters.fecha_fin) {
      toast.warning('La fecha de inicio no puede ser mayor a la fecha final.');
      return;
    }
    setPage(1);
    fetchComprobantes(filters, 1);
  };

  const handlePageChange = (newPage) => { setPage(newPage); fetchComprobantes(filters, newPage); };

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

  const handlePrintRecibo = (c) => {
    if (c.estatus === 'anulado') {
      toast.warning('Este comprobante está anulado.');
    }

    const fecha = new Date(c.fecha_pago);
    const tasa = parseFloat(c.tasa_bcv || 0);
    const toVes = (ves, usd) => {
      const v = parseFloat(ves) || 0;
      return v > 0 ? v : (parseFloat(usd) || 0) * tasa;
    };

    // Periodo legible: "Julio 2026"
    const mesStr = format(fecha, 'MMMM', { locale: es });
    const periodoLabel = `${mesStr.charAt(0).toUpperCase() + mesStr.slice(1)} ${fecha.getFullYear()}`;

    const items = c.desglose_conceptos && c.desglose_conceptos.length > 0
      ? c.desglose_conceptos.map(dc => ({
          concepto:    dc.concepto_display || dc.concepto || c.concepto_display,
          descripcion: dc.descripcion || periodoLabel,
          monto_usd:   0,
          monto_ves:   toVes(dc.monto_ves, dc.monto_usd),
        }))
      : [{
          concepto:    c.concepto_display || '',
          descripcion: periodoLabel,
          monto_usd:   0,
          monto_ves:   toVes(c.total_ves || c.monto_ves, c.total_usd || c.monto_usd),
        }];

    const pagos = c.desglose_pagos && c.desglose_pagos.length > 0
      ? c.desglose_pagos.map(dp => ({
          metodo:     dp.metodo_pago_display || dp.metodo_pago || '',
          banco:      dp.banco_nombre || '',
          referencia: dp.referencia   || '',
          monto:      toVes(dp.monto_ves, dp.monto_usd),
        }))
      : [{
          metodo:     c.metodo_pago_display || c.metodo_pago || '',
          banco:      c.banco_nombre || '',
          referencia: c.referencia   || '',
          monto:      toVes(c.total_ves || c.monto_ves, c.total_usd || c.monto_usd),
        }];

    printReciboCobranza({
      nroControl:      c.factura_id || `#${c.id}`,
      mes:             mesStr.charAt(0).toUpperCase() + mesStr.slice(1),
      año:             fecha.getFullYear(),
      fechaPago:       format(fecha, 'dd/MM/yyyy', { locale: es }),
      nombreEstudiante:`${c.nombre_alumno || ''} ${c.apellido_alumno || ''}`.trim(),
      grado:           c.grado             || '',
      representante:   c.representante_nombre ||
                       c.nombre_completo_representante ||
                       `${c.nombre_representante || ''} ${c.apellido_representante || ''}`.trim() ||
                       c.representante || '',
      ciRepresentante: c.cedula_representante || c.cedula_escolar || '',
      cajero:          c.cajero            || '',
      tasa:            0,
      items,
      pagos,
      observaciones:   c.observaciones     || '',
    });
  };

  const handlePrintCompacto = (c) => {
    if (c.estatus === 'anulado') {
      toast.warning('Este comprobante está anulado.');
    }

    const fecha = new Date(c.fecha_pago);
    const tasa = parseFloat(c.tasa_bcv || 0);
    const toVes = (ves, usd) => {
      const v = parseFloat(ves) || 0;
      return v > 0 ? v : (parseFloat(usd) || 0) * tasa;
    };

    const items = c.desglose_conceptos && c.desglose_conceptos.length > 0
      ? c.desglose_conceptos.map(dc => ({
          concepto:    dc.concepto_display || dc.concepto || c.concepto_display,
          descripcion: dc.descripcion || '',
          monto_ves:   toVes(dc.monto_ves, dc.monto_usd),
        }))
      : [{
          concepto:    c.concepto_display || '',
          descripcion: '',
          monto_ves:   toVes(c.total_ves || c.monto_ves, c.total_usd || c.monto_usd),
        }];

    const pagos = c.desglose_pagos && c.desglose_pagos.length > 0
      ? c.desglose_pagos.map(dp => ({
          metodo:     dp.metodo_pago_display || dp.metodo_pago || '',
          banco:      dp.banco_nombre || '',
          referencia: dp.referencia   || '',
          monto:      toVes(dp.monto_ves, dp.monto_usd),
        }))
      : [{
          metodo:     c.metodo_pago_display || c.metodo_pago || '',
          banco:      c.banco_nombre || '',
          referencia: c.referencia   || '',
          monto:      toVes(c.total_ves || c.monto_ves, c.total_usd || c.monto_usd),
        }];

    printComprobanteCompacto({
      nroControl:      c.factura_id || `#${c.id}`,
      fechaPago:       format(fecha, 'dd/MM/yyyy', { locale: es }),
      nombreEstudiante:`${c.nombre_alumno || ''} ${c.apellido_alumno || ''}`.trim(),
      grado:           c.grado             || '',
      representante:   c.representante_nombre ||
                       c.nombre_completo_representante ||
                       `${c.nombre_representante || ''} ${c.apellido_representante || ''}`.trim() ||
                       c.representante || '',
      items,
      pagos,
      observaciones:   c.observaciones     || '',
    });
  };

  const set = useCallback((k) => (e) => setFilters(prev => ({ ...prev, [k]: e.target.value })), []);

  const activeFilterCount = useMemo(() =>
    Object.entries(filters).filter(([k, v]) => {
      if (k === 'fecha_fin' && v === today) return false;
      return !!v;
    }).length,
  [filters, today]);

  const COLUMNS = ['Nº Recibo', 'Fecha', 'Alumno', 'Grado', 'Concepto', 'Método de Pago', 'Total', 'Estatus', ''];

  return (
    <div className="space-y-5" style={{ color: 'var(--jet)' }}>

      {/* ── Encabezado ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)',
              boxShadow: 'var(--glow-pb)',
            }}
          >
            <ReceiptText size={20} color="#fff" />
          </div>
          <div>
            <h1 className="text-[18px] font-bold tracking-tight" style={{ color: 'var(--jet)' }}>
              Consulta de Comprobantes
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>
              Busca y descarga comprobantes de pago
            </p>
          </div>
        </div>

        {data && data.total > 0 && (
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold"
            style={{
              background: 'var(--pb-light)',
              color: 'var(--pb-mid)',
              border: '1px solid rgba(15,163,177,0.18)',
            }}
          >
            <TrendingUp size={15} />
            {data.total.toLocaleString()} resultado{data.total !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* ── Panel de filtros ── */}
      <div className="glass rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter size={14} style={{ color: 'var(--pb)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--jet)' }}>
              Filtros de búsqueda
            </span>
            {activeFilterCount > 0 && (
              <span
                className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: 'var(--pb)', color: '#fff' }}
              >
                {activeFilterCount}
              </span>
            )}
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={handleClear}
              className="flex items-center gap-1 text-xs font-medium transition-colors hover:opacity-70"
              style={{ color: 'var(--ash)' }}
            >
              <X size={12} /> Limpiar filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--ash)' }}>Nº Recibo</label>
            <div className="relative">
              <FileText size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--ash)' }} />
              <input
                className={inputCls} style={{ ...inputStyle, paddingLeft: '1.75rem' }}
                placeholder="Ej: 202605270001"
                value={filters.factura_id} onChange={set('factura_id')}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--ash)' }}>Cédula Escolar</label>
            <div className="relative">
              <CreditCard size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--ash)' }} />
              <input
                className={inputCls} style={{ ...inputStyle, paddingLeft: '1.75rem' }}
                placeholder="V-00000000"
                value={filters.cedula} onChange={set('cedula')}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--ash)' }}>Nombre del Alumno</label>
            <div className="relative">
              <User size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--ash)' }} />
              <input
                className={inputCls} style={{ ...inputStyle, paddingLeft: '1.75rem' }}
                placeholder="Nombre o apellido..."
                value={filters.alumno_nombre} onChange={set('alumno_nombre')}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--ash)' }}>Fecha Desde</label>
            <div className="relative">
              <Calendar size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--ash)' }} />
              <input type="date" className={inputCls} style={{ ...inputStyle, paddingLeft: '1.75rem' }}
                value={filters.fecha_inicio} onChange={set('fecha_inicio')} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--ash)' }}>Fecha Hasta</label>
            <div className="relative">
              <Calendar size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--ash)' }} />
              <input type="date" className={inputCls} style={{ ...inputStyle, paddingLeft: '1.75rem' }}
                value={filters.fecha_fin} onChange={set('fecha_fin')} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--ash)' }}>Método de Pago</label>
            <select className={inputCls} style={inputStyle} value={filters.metodo_pago} onChange={set('metodo_pago')}>
              {METODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--ash)' }}>Concepto</label>
            <select className={inputCls} style={inputStyle} value={filters.concepto} onChange={set('concepto')}>
              {CONCEPTOS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--ash)' }}>Estatus</label>
            <select className={inputCls} style={inputStyle} value={filters.estatus} onChange={set('estatus')}>
              {ESTATUS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleSearch}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold text-white transition-all duration-150"
            style={{
              background: 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)',
              boxShadow: loading ? 'none' : 'var(--glow-pb)',
              opacity: loading ? 0.75 : 1,
            }}
          >
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
      </div>

      {/* ── Resultados ── */}
      {(searched || loading) && (
        <div className="glass rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--shadow-sm)' }}>

          {/* Header de resultados */}
          <div
            className="flex items-center justify-between px-5 py-3.5"
            style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}
          >
            <span className="text-xs font-semibold" style={{ color: 'var(--jet)' }}>
              {loading
                ? 'Cargando resultados...'
                : data
                  ? `${data.total} comprobante${data.total !== 1 ? 's' : ''} encontrado${data.total !== 1 ? 's' : ''}`
                  : 'Sin resultados'
              }
            </span>
            {data && data.total > 0 && !loading && (
              <span className="text-xs" style={{ color: 'var(--ash)' }}>
                Página {data.page} de {data.total_pages}
              </span>
            )}
          </div>

          {/* Skeleton loader */}
          {loading ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-xs">
                <thead>
                  <tr style={{ background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border)' }}>
                    {COLUMNS.map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: 'var(--ash)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 20 }).map((_, i) => <SkeletonRow key={i} />)}
                </tbody>
              </table>
            </div>

          ) : !data || data.total === 0 ? (
            <div className="py-20 flex flex-col items-center gap-3">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'var(--ash-light)' }}
              >
                <ReceiptText size={28} style={{ color: 'var(--border-md)' }} />
              </div>
              <div className="text-center">
                <p className="text-xs font-medium" style={{ color: 'var(--jet)' }}>No se encontraron comprobantes</p>
                <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>Intenta con otros criterios de búsqueda</p>
              </div>
              {activeFilterCount > 0 && (
                <button
                  onClick={handleClear}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-opacity hover:opacity-70"
                  style={{ background: 'var(--ash-light)', color: 'var(--ash)' }}
                >
                  <X size={12} /> Limpiar filtros
                </button>
              )}
            </div>

          ) : (
            <>
              {/* ── Vista móvil (tarjetas) ── */}
              <div className="sm:hidden divide-y" style={{ borderColor: 'var(--border)' }}>
                {data.results.map((c) => (
                  <div key={c.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <span
                          className="font-mono text-xs font-bold px-2 py-1 rounded-lg"
                          style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)', letterSpacing: '0.02em' }}
                        >
                          {c.factura_id || `#${c.id}`}
                        </span>
                        <p className="text-sm font-semibold mt-1" style={{ color: 'var(--jet)' }}>
                          {c.nombre_alumno} {c.apellido_alumno}
                        </p>
                        <p className="text-xs font-mono" style={{ color: 'var(--ash)' }}>
                          {c.cedula_escolar || '—'}
                        </p>
                      </div>
                      <EstatusBadge estatus={c.estatus} />
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      <div>
                        <p style={{ color: 'var(--ash)' }}>Fecha</p>
                        <p className="font-medium" style={{ color: 'var(--jet)' }}>
                          {format(parseISO(c.fecha_pago), 'dd/MM/yyyy', { locale: es })}
                        </p>
                      </div>
                      <div>
                        <p style={{ color: 'var(--ash)' }}>Grado</p>
                        <p className="font-medium" style={{ color: 'var(--jet)' }}>{c.grado || '—'}</p>
                      </div>
                      <div>
                        <p style={{ color: 'var(--ash)' }}>Concepto</p>
                        <p className="font-medium" style={{ color: 'var(--jet)' }}>{c.concepto_display}</p>
                      </div>
                      <div>
                        <p style={{ color: 'var(--ash)' }}>Total</p>
                        <p className="font-mono font-bold" style={{ color: 'var(--jet)' }}>
                          Bs. {Number(c.total_ves || c.monto_ves).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                        </p>
                        <p className="font-mono text-xs" style={{ color: 'var(--ash)' }}>
                          $ {Number(c.total_usd || c.monto_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>

                    <MetodoPill metodo={c.metodo_pago} label={c.metodo_pago_display} banco={c.banco_nombre} />

                    <div className="flex gap-2">
                      <button
                        onClick={() => handlePrintRecibo(c)}
                        aria-label={`Imprimir recibo A4 de ${c.factura_id || c.id}`}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all duration-150"
                        style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}
                      >
                        <Printer size={13} /> A4
                      </button>
                      <button
                        onClick={() => handlePrintCompacto(c)}
                        aria-label={`Imprimir comprobante compacto de ${c.factura_id || c.id}`}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-green-50 text-green-600 transition-all duration-150"
                      >
                        <Printer size={13} /> Compacto
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Vista escritorio (tabla) ── */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full min-w-[860px] text-xs">
                  <thead>
                    <tr style={{ background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border)' }}>
                      {COLUMNS.map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: 'var(--ash)' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.results.map((c) => (
                      <tr
                        key={c.id}
                        onMouseEnter={() => setHoveredRow(c.id)}
                        onMouseLeave={() => setHoveredRow(null)}
                        style={{
                          borderBottom: '0.5px solid var(--border)',
                          background: hoveredRow === c.id ? 'var(--pb-light)' : 'transparent',
                          transition: 'background 0.12s ease',
                        }}
                      >
                        {/* Recibo ID */}
                        <td className="px-4 py-3.5">
                          <span
                            className="font-mono text-xs font-bold px-2 py-1 rounded-lg"
                            style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)', letterSpacing: '0.02em' }}
                          >
                            {c.factura_id || `#${c.id}`}
                          </span>
                        </td>

                        {/* Fecha */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <p className="text-xs font-medium" style={{ color: 'var(--jet)' }}>
                            {format(parseISO(c.fecha_pago), 'dd/MM/yyyy', { locale: es })}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>
                            {format(parseISO(c.fecha_pago), 'HH:mm', { locale: es })}
                          </p>
                        </td>

                        {/* Alumno */}
                        <td className="px-4 py-3.5">
                          <p className="text-xs font-semibold leading-tight" style={{ color: 'var(--jet)' }}>
                            {c.nombre_alumno} {c.apellido_alumno}
                          </p>
                          <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--ash)' }}>
                            {c.cedula_escolar || '—'}
                          </p>
                        </td>

                        {/* Grado */}
                        <td className="px-4 py-3.5">
                          <span className="text-xs font-medium" style={{ color: 'var(--jet-mid)' }}>
                            {c.grado || '—'}
                          </span>
                        </td>

                        {/* Concepto */}
                        <td className="px-4 py-3.5">
                          <span className="text-xs font-medium whitespace-nowrap" style={{ color: 'var(--jet)' }}>
                            {c.concepto_display}
                          </span>
                        </td>

                        {/* Método de pago */}
                        <td className="px-4 py-3.5" style={{ minWidth: '180px' }}>
                          {c.desglose_pagos && c.desglose_pagos.length > 1 ? (
                            <div className="flex flex-wrap gap-1">
                              {c.desglose_pagos.map((dp) => (
                                <MetodoPill key={dp.id} metodo={dp.metodo_pago} label={dp.metodo_pago_display} banco={dp.banco_nombre} />
                              ))}
                            </div>
                          ) : (
                            <MetodoPill metodo={c.metodo_pago} label={c.metodo_pago_display} banco={c.banco_nombre} />
                          )}
                        </td>

                        {/* Total */}
                        <td className="px-4 py-3.5 text-right" style={{ minWidth: '130px' }}>
                          <p className="font-mono text-xs font-bold" style={{ color: 'var(--jet)' }}>
                            Bs.&nbsp;{Number(c.total_ves || c.monto_ves).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                          </p>
                          <p className="font-mono text-xs mt-0.5" style={{ color: 'var(--ash)' }}>
                            $&nbsp;{Number(c.total_usd || c.monto_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </p>
                        </td>

                        {/* Estatus */}
                        <td className="px-4 py-3.5">
                          <EstatusBadge estatus={c.estatus} />
                        </td>

                        {/* Acción */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handlePrintRecibo(c)}
                              aria-label={`Imprimir recibo A4 de ${c.factura_id || c.id}`}
                              title="Imprimir recibo completo A4"
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150"
                              style={{
                                background: 'var(--pb-light)',
                                color: 'var(--pb-mid)',
                                boxShadow: '0 1px 3px rgba(15,163,177,0.15)',
                              }}
                            >
                              <Printer size={12} />
                              A4
                            </button>
                            <button
                              onClick={() => handlePrintCompacto(c)}
                              aria-label={`Imprimir comprobante compacto de ${c.factura_id || c.id}`}
                              title="Imprimir comprobante compacto"
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-50 text-green-600 transition-all duration-150"
                              style={{ boxShadow: '0 1px 3px rgba(22,163,74,0.12)' }}
                            >
                              <Printer size={12} />
                              Compacto
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── Paginación ── */}
              {data.total_pages > 1 && (
                <div
                  className="flex items-center justify-between px-5 py-3.5"
                  style={{ borderTop: '0.5px solid var(--border)', background: 'var(--porcelain)' }}
                >
                  <button
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page <= 1}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
                    style={{
                      background: page <= 1 ? 'transparent' : 'var(--ash-light)',
                      color: 'var(--ash)',
                      opacity: page <= 1 ? 0.35 : 1,
                      border: '1px solid var(--border-md)',
                      cursor: page <= 1 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <ChevronLeft size={13} /> Anterior
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: data.total_pages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === data.total_pages || Math.abs(p - page) <= 2)
                      .reduce((acc, p, idx, arr) => {
                        if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...');
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, idx) =>
                        p === '...' ? (
                          <span key={`e-${idx}`} className="px-1.5 text-xs" style={{ color: 'var(--ash)' }}>…</span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => handlePageChange(p)}
                            className="w-8 h-8 rounded-lg text-xs font-semibold transition-all duration-150"
                            style={{
                              background: p === page
                                ? 'linear-gradient(135deg, var(--pb) 0%, var(--pb-mid) 100%)'
                                : 'transparent',
                              color: p === page ? '#fff' : 'var(--ash)',
                              boxShadow: p === page ? 'var(--glow-pb)' : 'none',
                              border: p === page ? 'none' : '1px solid var(--border)',
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
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
                    style={{
                      background: page >= data.total_pages ? 'transparent' : 'var(--ash-light)',
                      color: 'var(--ash)',
                      opacity: page >= data.total_pages ? 0.35 : 1,
                      border: '1px solid var(--border-md)',
                      cursor: page >= data.total_pages ? 'not-allowed' : 'pointer',
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
    </div>
  );
}
