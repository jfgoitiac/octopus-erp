import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Clock, Filter, Loader2, RefreshCcw } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useLogsSistemas, LOGS_PAGE_SIZE } from '../../hooks/useLogsSistemas';

const FILTROS_CFG = [
    {
        label: 'Canal', campo: 'canal',
        opts: [['', 'Todos'], ['email', 'Email'], ['whatsapp', 'WhatsApp']],
    },
    {
        label: 'Estado', campo: 'estado',
        opts: [['', 'Todos'], ['enviado', 'Enviado'], ['fallido', 'Fallido'], ['pendiente', 'Pendiente']],
    },
    {
        label: 'Tipo', campo: 'tipo',
        opts: [
            ['', 'Todos'], ['mora_dia_0','Día 0'], ['mora_dia_5','Día 5'],
            ['mora_dia_10','Día 10'], ['mora_dia_15','Día 15'],
            ['comprobante','Comprobante'], ['bienvenida','Bienvenida'],
            ['pago_exitoso','Pago exitoso'], ['prueba','Prueba'],
        ],
    },
];

const EstadoBadge = ({ estado }) => {
    if (estado === 'enviado') return (
        <span className="flex items-center gap-1 text-green-600">
            <CheckCircle2 size={13} /> Enviado
        </span>
    );
    if (estado === 'fallido') return (
        <span className="flex items-center gap-1 text-red-500">
            <XCircle size={13} /> Fallido
        </span>
    );
    return (
        <span className="flex items-center gap-1" style={{ color: 'var(--ash)' }}>
            <Clock size={13} /> Pendiente
        </span>
    );
};

const CanalBadge = ({ canal }) => (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
        canal === 'email' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
    }`}>
        {canal}
    </span>
);

const LogsTab = () => {
    const { logs, logsTotal, logsPage, logsLoading, fetchLogs } = useLogsSistemas();
    const [filtro, setFiltroState] = useState({ canal: '', estado: '', tipo: '' });

    useEffect(() => {
        fetchLogs(1);
    }, [fetchLogs]);

    const setFiltro = (campo, valor) =>
        setFiltroState(prev => ({ ...prev, [campo]: valor }));

    const handleFiltrar = () => fetchLogs(1, filtro);
    const handlePaginar = (page) => fetchLogs(page, filtro);

    const totalPaginas = Math.ceil(logsTotal / LOGS_PAGE_SIZE);

    return (
        <div className="space-y-4">
            {/* Filtros */}
            <div className="flex flex-wrap gap-2 items-center">
                {FILTROS_CFG.map(({ campo, opts }) => (
                    <select key={campo}
                        value={filtro[campo]}
                        onChange={e => setFiltro(campo, e.target.value)}
                        className="px-3 py-1.5 rounded-lg text-xs outline-none appearance-none"
                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}>
                        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                ))}
                <button onClick={handleFiltrar} disabled={logsLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                    style={{ background: 'var(--pb)' }}>
                    <Filter size={12} /> Filtrar
                </button>
                <button onClick={() => fetchLogs(1, {})} disabled={logsLoading}
                    className="p-1.5 rounded-lg border transition-all disabled:opacity-50"
                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                    aria-label="Limpiar filtros y refrescar" title="Limpiar filtros">
                    <RefreshCcw size={12} />
                </button>
            </div>

            {/* Tabla con scroll horizontal para móvil */}
            <div className="rounded-xl overflow-hidden"
                style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[640px]">
                        <thead>
                            <tr>
                                {['Fecha', 'Canal', 'Tipo', 'Destinatario', 'Estado'].map(h => (
                                    <th key={h} className="px-4 py-3 text-[11px] uppercase tracking-widest"
                                        style={{ color: 'var(--ash)', borderBottom: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {logsLoading ? (
                                <tr>
                                    <td colSpan="5" className="px-4 py-12 text-center">
                                        <Loader2 className="animate-spin inline-block" size={20} style={{ color: 'var(--pb)' }} />
                                    </td>
                                </tr>
                            ) : logs.length > 0 ? logs.map(l => (
                                <tr key={l.id} style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--ash)' }}>
                                        {format(new Date(l.fecha_envio), 'dd/MM/yyyy HH:mm', { locale: es })}
                                    </td>
                                    <td className="px-4 py-3">
                                        <CanalBadge canal={l.canal} />
                                    </td>
                                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--jet)' }}>
                                        {l.tipo}
                                    </td>
                                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--jet)' }}>
                                        {l.destinatario}
                                        {l.alumno_nombre && (
                                            <span className="block" style={{ color: 'var(--ash)' }}>{l.alumno_nombre}</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-xs">
                                        <EstadoBadge estado={l.estado} />
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan="5" className="px-4 py-12 text-center text-sm"
                                        style={{ color: 'var(--ash)' }}>
                                        No hay registros.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Paginación */}
            {logsTotal > LOGS_PAGE_SIZE && (
                <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: 'var(--ash)' }}>
                        {logsTotal} registros · Página {logsPage} de {totalPaginas}
                    </span>
                    <div className="flex gap-2">
                        <button onClick={() => handlePaginar(logsPage - 1)} disabled={logsPage <= 1 || logsLoading}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-40"
                            style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                            Anterior
                        </button>
                        <button onClick={() => handlePaginar(logsPage + 1)} disabled={logsPage >= totalPaginas || logsLoading}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-40"
                            style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                            Siguiente
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LogsTab;
