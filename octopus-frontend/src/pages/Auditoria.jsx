import { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, Calendar, RefreshCcw, Search, Filter, Clock, ArrowUpRight, Wallet, Banknote, ListChecks, Download, AlertCircle, Loader2 } from 'lucide-react';
import axiosInstance from '../api/apiClient';
import { toast } from 'react-toastify';

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

const Auditoria = () => {
    const [loading, setLoading]       = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [exporting, setExporting]   = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filtroModulo, setFiltroModulo] = useState('TODOS');
    const [fechaInicio, setFechaInicio] = useState(new Date().toISOString().split('T')[0]);
    const [fechaFin, setFechaFin]       = useState(new Date().toISOString().split('T')[0]);
    const [error, setError]           = useState(null);

    const [reporte, setReporte] = useState({
        total_usd: 0, total_ves: 0, efectivo_usd: 0, transferencia_ves: 0, conteo_pagos: 0,
    });
    const [logs, setLogs] = useState([]);

    const fetchAuditoria = async (isRefresh = false) => {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);
        try {
            const [resStats, resLogs] = await Promise.all([
                axiosInstance.get('cobranza/auditoria-diaria/', {
                    params: { fecha_inicio: fechaInicio, fecha_fin: fechaFin },
                }),
                axiosInstance.get('secretaria/auditoria/'),
            ]);
            setReporte(resStats.data);
            setLogs(
                (resLogs.data || []).sort((a, b) =>
                    new Date(b.fecha_hora || b.fecha) - new Date(a.fecha_hora || a.fecha)
                )
            );
        } catch (err) {
            setError('No se pudo sincronizar el historial de auditoría.');
            console.error(err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => { fetchAuditoria(); }, []);

    const handleExportExcel = async () => {
        setExporting(true);
        try {
            const res = await axiosInstance.get('cobranza/exportar-excel/', {
                params: { fecha_inicio: fechaInicio, fecha_fin: fechaFin },
                responseType: 'blob',
            });
            const url = URL.createObjectURL(new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }));
            const a = Object.assign(document.createElement('a'), {
                href: url,
                download: `auditoria_${fechaInicio}_${fechaFin}.xlsx`,
            });
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Archivo Excel descargado.');
        } catch {
            toast.error('No se pudo generar el Excel.');
        } finally {
            setExporting(false);
        }
    };

    const logsFiltrados = useMemo(() => {
        return logs.filter(log => {
            const username = log.usuario?.username || log.usuario_nombre || 'SISTEMA';
            const accion   = log.accion || '';
            const detallesStr = typeof log.detalles === 'string'
                ? log.detalles
                : log.detalles ? JSON.stringify(log.detalles) : '';

            const cumpleBusqueda =
                detallesStr.toLowerCase().includes(searchTerm.toLowerCase()) ||
                username.toLowerCase().includes(searchTerm.toLowerCase()) ||
                accion.toLowerCase().includes(searchTerm.toLowerCase());

            const cumpleModulo = filtroModulo === 'TODOS' || log.modulo === filtroModulo;
            return cumpleBusqueda && cumpleModulo;
        });
    }, [logs, searchTerm, filtroModulo]);

    const fmt = (val, cur = 'USD') =>
        new Intl.NumberFormat(cur === 'USD' ? 'en-US' : 'es-VE', {
            style: 'currency', currency: cur, minimumFractionDigits: 2,
        }).format(val || 0);

    const badgeClass = (accion) => {
        const a = (accion || '').toUpperCase();
        if (a.includes('ELIMINACION') || a.includes('ANULACION') || a.includes('DELETE')) return 'bg-red-50 text-red-700 border-red-100';
        if (a.includes('REGISTRO') || a.includes('CREACION') || a.includes('INSCRIPCION')) return 'bg-green-50 text-green-700 border-green-100';
        if (a.includes('INICIO_SESION') || a.includes('LOGIN')) return 'bg-blue-50 text-blue-700 border-blue-100';
        if (a.includes('ACTUALIZACION') || a.includes('EDICION') || a.includes('AJUSTE')) return 'bg-amber-50 text-amber-700 border-amber-100';
        return 'bg-slate-50 text-slate-600 border-slate-100';
    };

    const inputStyle = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' };

    if (loading) return (
        <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin" size={28} style={{ color: 'var(--pb)' }} />
        </div>
    );

    return (
        <div className="anim-fade-up">
            <div className="mb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-lg font-medium" style={{ color: 'var(--jet)' }}>Auditoría</h2>
                    <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>Control de ingresos y actividad del sistema.</p>
                </div>

                <div className="flex flex-wrap items-end gap-2">
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Desde</label>
                        <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)}
                            className="px-2 py-1.5 rounded-lg text-xs outline-none" style={inputStyle} />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Hasta</label>
                        <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)}
                            className="px-2 py-1.5 rounded-lg text-xs outline-none" style={inputStyle} />
                    </div>
                    <button onClick={() => fetchAuditoria(true)} disabled={refreshing}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                        <RefreshCcw size={13} className={refreshing ? 'animate-spin' : ''} />
                        {refreshing ? 'Actualizando...' : 'Actualizar'}
                    </button>
                    <button onClick={handleExportExcel} disabled={exporting}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all disabled:opacity-50"
                        style={{ background: 'var(--jet)' }}>
                        {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                        Exportar Excel
                    </button>
                </div>
            </div>

            {error && (
                <div className="mb-5 flex items-center gap-2 p-3 rounded-xl text-sm" style={{ background: '#fef2f2', border: '0.5px solid #fecaca', color: '#dc2626' }}>
                    <AlertCircle size={16} />
                    {error}
                </div>
            )}

            {/* KPI strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {[
                    { label: 'Ingreso USD', value: fmt(reporte.total_usd), icon: ArrowUpRight, color: '#16a34a', bg: '#dcfce7' },
                    { label: 'Efectivo USD', value: fmt(reporte.efectivo_usd), icon: Wallet, color: 'var(--jet)', bg: 'var(--ash-light)' },
                    { label: 'Total VES', value: fmt(reporte.transferencia_ves, 'VES'), icon: Banknote, color: 'var(--pb)', bg: 'var(--pb-light)' },
                    { label: 'Pagos', value: reporte.conteo_pagos, icon: ListChecks, color: 'var(--ash)', bg: 'var(--porcelain)' },
                ].map(({ label, value, icon: Icon, color, bg }) => (
                    <div key={label} className="p-4 rounded-xl" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                        <div className="flex justify-between items-start mb-3">
                            <div className="p-1.5 rounded-lg" style={{ background: bg, color }}><Icon size={16} /></div>
                            <p className="text-[10px] uppercase tracking-widest text-right" style={{ color: 'var(--ash)' }}>{label}</p>
                        </div>
                        <p className="text-xl font-bold" style={{ color }}>{value}</p>
                    </div>
                ))}
            </div>

            {/* Log table */}
            <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)' }}>
                <div className="p-4 flex flex-col md:flex-row justify-between items-center gap-3"
                    style={{ background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
                    <div className="flex items-center gap-2">
                        <Calendar size={16} style={{ color: 'var(--pb)' }} />
                        <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>Historial de Operaciones</h3>
                    </div>
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <div className="relative flex-1 md:w-56">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} size={13} />
                            <input type="text" placeholder="Buscar..." value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs outline-none" style={inputStyle} />
                        </div>
                        <div className="relative">
                            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} size={13} />
                            <select value={filtroModulo} onChange={e => setFiltroModulo(e.target.value)}
                                className="pl-8 pr-3 py-1.5 rounded-lg text-xs outline-none appearance-none" style={inputStyle}>
                                <option value="TODOS">Todos los módulos</option>
                                <option value="COBRANZA">Cobranza</option>
                                <option value="SECRETARIA">Secretaría</option>
                                <option value="SEGURIDAD">Seguridad</option>
                                <option value="FINANZAS">Finanzas</option>
                            </select>
                        </div>
                    </div>
                </div>

                <table className="w-full text-sm">
                    <thead>
                        <tr style={{ background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
                            {['Fecha y hora', 'Usuario', 'Acción', 'Detalles'].map(h => (
                                <th key={h} className="text-left px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide"
                                    style={{ color: 'var(--ash)' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {logsFiltrados.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-4 py-10 text-center text-sm italic" style={{ color: 'var(--ash)' }}>
                                    No hay registros que coincidan.
                                </td>
                            </tr>
                        ) : logsFiltrados.map(log => (
                            <tr key={log.id} style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--ash-light)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'var(--porcelain)'}>
                                <td className="px-4 py-3 font-mono text-xs whitespace-nowrap" style={{ color: 'var(--ash)' }}>
                                    <div className="flex items-center gap-1.5">
                                        <Clock size={12} />
                                        {log.fecha_hora || log.fecha
                                            ? new Date(log.fecha_hora || log.fecha).toLocaleString('es-VE')
                                            : '—'}
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                                            style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}>
                                            {(log.usuario?.username || 'S')[0].toUpperCase()}
                                        </div>
                                        <span className="text-xs font-medium" style={{ color: 'var(--jet)' }}>
                                            {log.usuario?.username || log.usuario_nombre || 'SISTEMA'}
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
        </div>
    );
};

export default Auditoria;
