import { useState, useEffect, useMemo } from 'react';
import {
    Calendar, RefreshCcw, Search, Filter, Clock,
    ArrowUpRight, Wallet, Banknote, ListChecks, Download,
    AlertCircle, Loader2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import SmartDateInput from '../components/SmartDateInput';
import { toast } from 'react-toastify';
import { parse, format, isValid } from 'date-fns';
import { useAuditoria } from '../hooks/useAuditoria';
import { fmt, formatLogDate, badgeClass } from '../utils/auditoria.utils';
import { nombreUsuario, inicialesUsuario } from '../utils/nombreUsuario';

function parseISODate(str) {
    if (!str) return null;
    const parsed = parse(str, 'yyyy-MM-dd', new Date());
    return isValid(parsed) ? parsed : null;
}

const ITEMS_PER_PAGE = 25;

// ─── DetallesLog ──────────────────────────────────────────────────────────────

const DetallesLog = ({ detalles }) => {
    if (!detalles) return <span className="italic" style={{ color: 'var(--ash)' }}>Sin detalles</span>;
    if (typeof detalles === 'string') return <span style={{ color: 'var(--jet)' }}>{detalles}</span>;
    if (typeof detalles !== 'object') return <span style={{ color: 'var(--jet)' }}>{String(detalles)}</span>;

    const entries = Object.entries(detalles).filter(([, v]) => v !== null && v !== '' && !Array.isArray(v));
    const arrays  = Object.entries(detalles).filter(([, v]) => Array.isArray(v));

    return (
        <div className="space-y-1">
            {entries.map(([k, v]) => (
                <div key={k} className="flex items-baseline gap-1.5 text-xs">
                    <span className="font-medium capitalize shrink-0" style={{ color: 'var(--ash)' }}>
                        {k.replace(/_/g, ' ')}:
                    </span>
                    <span style={{ color: 'var(--jet)' }}>{String(v)}</span>
                </div>
            ))}
            {arrays.map(([k, v]) => (
                <div key={k} className="text-xs">
                    <span className="font-medium capitalize" style={{ color: 'var(--ash)' }}>
                        {k.replace(/_/g, ' ')}:{' '}
                    </span>
                    <span style={{ color: 'var(--jet)' }}>{v.length > 0 ? v.join(', ') : '—'}</span>
                </div>
            ))}
        </div>
    );
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

const AuditoriaSkeleton = () => (
    <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 rounded-lg" style={{ background: 'var(--porcelain)' }} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 rounded-xl" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }} />
            ))}
        </div>
        <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)' }}>
            <div className="h-14" style={{ background: 'var(--porcelain)' }} />
            {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="mx-4 my-3 h-10 rounded-lg" style={{ background: 'var(--ash-light)' }} />
            ))}
        </div>
    </div>
);

// ─── KPIs ─────────────────────────────────────────────────────────────────────

const KPI_CONFIG = [
    { key: 'total_usd',         label: 'Ingreso USD',  cur: 'USD', icon: ArrowUpRight, color: '#16a34a',      bg: '#dcfce7' },
    { key: 'efectivo_usd',      label: 'Efectivo USD', cur: 'USD', icon: Wallet,       color: 'var(--jet)',   bg: 'var(--ash-light)' },
    { key: 'transferencia_ves', label: 'Total VES',    cur: 'VES', icon: Banknote,     color: 'var(--pb)',    bg: 'var(--pb-light)' },
    { key: 'conteo_pagos',      label: 'Pagos',        cur: null,  icon: ListChecks,   color: 'var(--ash)',   bg: 'var(--porcelain)' },
];

const AuditoriaKPIs = ({ reporte }) => (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {KPI_CONFIG.map(({ key, label, cur, icon: Icon, color, bg }) => (
            <div key={key} className="p-4 rounded-xl" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                <div className="flex justify-between items-start mb-3">
                    <div className="p-1.5 rounded-lg" style={{ background: bg, color }}><Icon size={16} /></div>
                    <p className="text-[10px] uppercase tracking-widest text-right" style={{ color: 'var(--ash)' }}>{label}</p>
                </div>
                <p className="text-xl font-bold" style={{ color }}>
                    {cur ? fmt(reporte?.[key], cur) : (reporte?.[key] ?? 0)}
                </p>
            </div>
        ))}
    </div>
);

// ─── Tabla con filtros y paginación ───────────────────────────────────────────

const AuditoriaTabla = ({ logs, filtroModulo, setFiltroModulo }) => {
    const [searchTerm, setSearchTerm]     = useState('');
    const [currentPage, setCurrentPage]   = useState(1);

    const inputStyle = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };

    const logsFiltrados = useMemo(() => (
        logs.filter(log => {
            const username    = log.usuario?.username || '';
            const nombre      = nombreUsuario(log.usuario) || 'SISTEMA';
            const accion      = log.accion || '';
            const detallesStr = typeof log.detalles === 'string'
                ? log.detalles
                : log.detalles ? JSON.stringify(log.detalles) : '';
            const term = searchTerm.toLowerCase();
            const cumpleBusqueda =
                detallesStr.toLowerCase().includes(term) ||
                username.toLowerCase().includes(term) ||
                nombre.toLowerCase().includes(term) ||
                accion.toLowerCase().includes(term);
            const cumpleModulo = filtroModulo === 'TODOS' || log.modulo === filtroModulo;
            return cumpleBusqueda && cumpleModulo;
        })
    ), [logs, searchTerm, filtroModulo]);

    // Reset to page 1 whenever the filtered result set changes
    useEffect(() => { setCurrentPage(1); }, [logsFiltrados]);

    const totalPages = Math.max(1, Math.ceil(logsFiltrados.length / ITEMS_PER_PAGE));
    const paginated  = logsFiltrados.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    return (
        <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)' }}>

            {/* Filters header */}
            <div className="p-4 flex flex-col md:flex-row justify-between items-center gap-3"
                style={{ background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
                <div className="flex items-center gap-2">
                    <Calendar size={16} style={{ color: 'var(--pb)' }} />
                    <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>Historial de Operaciones</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--ash-light)', color: 'var(--ash)' }}>
                        {logsFiltrados.length}
                    </span>
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <div className="relative flex-1 md:w-56">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} size={13} />
                        <input
                            type="text"
                            placeholder="Buscar..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            aria-label="Buscar en el historial de operaciones"
                            className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs outline-none"
                            style={inputStyle}
                        />
                    </div>
                    <div className="relative">
                        <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} size={13} />
                        <select
                            value={filtroModulo}
                            onChange={e => setFiltroModulo(e.target.value)}
                            aria-label="Filtrar por módulo"
                            className="pl-8 pr-3 py-1.5 rounded-lg text-xs outline-none appearance-none"
                            style={inputStyle}
                        >
                            <option value="TODOS">Todos los módulos</option>
                            <option value="COBRANZA">Cobranza</option>
                            <option value="SECRETARIA">Secretaría</option>
                            <option value="SEGURIDAD">Seguridad</option>
                            <option value="FINANZAS">Finanzas</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Scrollable table — overflow-x-auto fixes mobile overflow */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[600px]">
                    <thead>
                        <tr style={{ background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
                            {['Fecha y hora', 'Usuario', 'Acción', 'Detalles'].map(h => (
                                <th key={h} className="text-left px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide"
                                    style={{ color: 'var(--ash)' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {paginated.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-4 py-10 text-center text-sm italic"
                                    style={{ color: 'var(--ash)' }}>
                                    No hay registros que coincidan.
                                </td>
                            </tr>
                        ) : paginated.map(log => (
                            <tr
                                key={log.id}
                                className="bg-[var(--porcelain)] hover:bg-[var(--ash-light)] transition-colors"
                                style={{ borderBottom: '0.5px solid var(--border)' }}
                            >
                                <td className="px-4 py-3 font-mono text-xs whitespace-nowrap" style={{ color: 'var(--ash)' }}>
                                    <div className="flex items-center gap-1.5">
                                        <Clock size={12} />
                                        {formatLogDate(log.fecha_hora || log.fecha)}
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                                            style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}>
                                            {log.usuario ? inicialesUsuario(log.usuario) : 'S'}
                                        </div>
                                        <span className="text-xs font-medium" style={{ color: 'var(--jet)' }}>
                                            {log.usuario ? nombreUsuario(log.usuario) : 'SISTEMA'}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase ${badgeClass(log.accion)}`}>
                                        {log.accion}
                                    </span>
                                </td>
                                <td className="px-4 py-3 max-w-xs">
                                    <DetallesLog detalles={log.detalles} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3"
                    style={{ borderTop: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                    <span className="text-xs" style={{ color: 'var(--ash)' }}>
                        Página {currentPage} de {totalPages} · {logsFiltrados.length} registros
                    </span>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            aria-label="Página anterior"
                            className="flex items-center justify-center p-1.5 rounded-lg disabled:opacity-40 transition-colors hover:bg-[var(--ash-light)] min-h-[44px] min-w-[44px]"
                            style={{ color: 'var(--ash)' }}
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            aria-label="Página siguiente"
                            className="flex items-center justify-center p-1.5 rounded-lg disabled:opacity-40 transition-colors hover:bg-[var(--ash-light)] min-h-[44px] min-w-[44px]"
                            style={{ color: 'var(--ash)' }}
                        >
                            <ChevronRight size={14} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Página principal ──────────────────────────────────────────────────────────

const Auditoria = () => {
    const today = (() => {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    })();
    const [fechaInicio, setFechaInicio] = useState(today);
    const [fechaFin, setFechaFin]       = useState(today);
    const [filtroModulo, setFiltroModulo] = useState('TODOS');

    const fechaInicioDate = useMemo(() => parseISODate(fechaInicio), [fechaInicio]);
    const fechaFinDate    = useMemo(() => parseISODate(fechaFin), [fechaFin]);

    const {
        loading, refreshing, exporting, exportingPagos, reporte, logs, error,
        refetch, exportarExcel, exportarPagosExcel,
    } = useAuditoria(fechaInicio, fechaFin, filtroModulo);

    const inputStyle = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };

    const handleRefresh = () => {
        if (fechaFin < fechaInicio) {
            toast.warn('La fecha final no puede ser anterior a la fecha de inicio.');
            return;
        }
        refetch(true);
    };

    if (loading) return <AuditoriaSkeleton />;

    return (
        <div className="anim-fade-up">

            {/* Header */}
            <div className="mb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-lg font-medium" style={{ color: 'var(--jet)' }}>Auditoría</h2>
                    <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>Control de ingresos y actividad del sistema.</p>
                </div>

                <div className="flex flex-wrap items-end gap-2">
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Desde</label>
                        <SmartDateInput
                            value={fechaInicioDate}
                            onChange={date => setFechaInicio(date ? format(date, 'yyyy-MM-dd') : '')}
                            className="px-2 py-1.5 rounded-lg text-xs outline-none"
                            style={inputStyle}
                            aria-label="Fecha de inicio"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Hasta</label>
                        <SmartDateInput
                            value={fechaFinDate}
                            onChange={date => setFechaFin(date ? format(date, 'yyyy-MM-dd') : '')}
                            className="px-2 py-1.5 rounded-lg text-xs outline-none"
                            style={inputStyle}
                            aria-label="Fecha de fin"
                        />
                    </div>
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all min-h-[44px]"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                    >
                        <RefreshCcw size={13} className={refreshing ? 'animate-spin' : ''} />
                        {refreshing ? 'Actualizando...' : 'Recargar datos'}
                    </button>
                    <button
                        onClick={exportarExcel}
                        disabled={exporting}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all disabled:opacity-50 min-h-[44px]"
                        style={{ background: 'var(--jet)' }}
                    >
                        {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                        Exportar Excel
                    </button>
                    <button
                        onClick={exportarPagosExcel}
                        disabled={exportingPagos}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50 min-h-[44px]"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                    >
                        {exportingPagos ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                        Exportar Pagos
                    </button>
                </div>
            </div>

            {/* Error banner */}
            {error && (
                <div className="mb-5 flex items-center gap-2 p-3 rounded-xl text-sm"
                    style={{ background: '#fef2f2', border: '0.5px solid #fecaca', color: '#dc2626' }}>
                    <AlertCircle size={16} />
                    {error}
                </div>
            )}

            <AuditoriaKPIs reporte={reporte} />
            <AuditoriaTabla logs={logs} filtroModulo={filtroModulo} setFiltroModulo={setFiltroModulo} />
        </div>
    );
};

export default Auditoria;
