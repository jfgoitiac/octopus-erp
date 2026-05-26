import { useEffect, useState, useCallback } from 'react';
import { Search, AlertTriangle, Phone, GraduationCap, Loader2, RefreshCcw, ExternalLink, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../api/apiClient';
import { useTasaBCV } from '../hooks/useTasaBCV';
import { toast } from 'react-toastify';

const fmt = (n, d = 2) =>
    Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d });

const Avatar = ({ nombre, apellido }) => {
    const initials = `${nombre?.[0] ?? ''}${apellido?.[0] ?? ''}`.toUpperCase();
    return (
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-semibold flex-shrink-0"
            style={{ background: '#dc2626' }}>
            {initials}
        </div>
    );
};

const Morosos = () => {
    const navigate = useNavigate();
    const { tasa } = useTasaBCV();
    const [alumnos, setAlumnos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busqueda, setBusqueda] = useState('');
    const [deudas, setDeudas]   = useState({});   // { cedula_escolar: monto_total }
    const [loadingDeudas, setLoadingDeudas] = useState(false);
    const [exportingExcel, setExportingExcel] = useState(false);

    const handleExportExcel = async () => {
        setExportingExcel(true);
        try {
            const params = new URLSearchParams({ estatus: 'mora' });
            if (busqueda.trim()) params.append('buscar', busqueda.trim());
            const res = await axiosInstance.get(
                `secretaria/exportar-alumnos-excel/?${params}`,
                { responseType: 'blob' }
            );
            const url = URL.createObjectURL(new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }));
            const a = Object.assign(document.createElement('a'), {
                href: url,
                download: `morosos_${new Date().toISOString().split('T')[0]}.xlsx`,
            });
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Archivo Excel descargado.');
        } catch {
            toast.error('No se pudo generar el Excel.');
        } finally {
            setExportingExcel(false);
        }
    };

    const fetchMorosos = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ estatus: 'mora' });
            if (busqueda.trim()) params.append('buscar', busqueda.trim());
            const res = await axiosInstance.get(`secretaria/alumnos/?${params}`);
            const data = res.data?.results ?? res.data ?? [];
            setAlumnos(data);
            fetchDeudas(data);
        } catch {
            setAlumnos([]);
        } finally {
            setLoading(false);
        }
    }, [busqueda]);

    const fetchDeudas = async (lista) => {
        if (!lista.length) return;
        setLoadingDeudas(true);
        const results = {};
        await Promise.allSettled(
            lista.map(async (alu) => {
                try {
                    const res = await axiosInstance.get(`cobranza/buscar/${alu.cedula_escolar}/`);
                    results[alu.cedula_escolar] = res.data?.monto_total_deuda ?? 0;
                } catch {
                    results[alu.cedula_escolar] = null;
                }
            })
        );
        setDeudas(results);
        setLoadingDeudas(false);
    };

    useEffect(() => {
        const t = setTimeout(fetchMorosos, 300);
        return () => clearTimeout(t);
    }, [fetchMorosos]);

    const totalDeudaUSD = Object.values(deudas).reduce((s, v) => s + (v ?? 0), 0);

    return (
        <div className="flex flex-col gap-5 anim-fade-up">

            {/* ── Summary strip ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                    {
                        label: 'Alumnos en mora',
                        value: loading ? '…' : alumnos.length,
                        color: '#dc2626',
                        bg: '#fef2f2',
                        icon: AlertTriangle,
                    },
                    {
                        label: 'Deuda total (USD)',
                        value: loadingDeudas ? '…' : `$${fmt(totalDeudaUSD)}`,
                        color: '#d97706',
                        bg: '#fffbeb',
                        icon: null,
                        text: true,
                    },
                    {
                        label: 'Deuda total (VES)',
                        value: loadingDeudas ? '…' : (tasa > 0 ? `Bs. ${fmt(totalDeudaUSD * tasa, 0)}` : '—'),
                        color: '#7c3aed',
                        bg: '#f5f3ff',
                        icon: null,
                        text: true,
                    },
                ].map(({ label, value, color, bg, icon: Icon, text }) => (
                    <div key={label} className="rounded-xl p-4 flex items-center gap-3"
                        style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)', borderLeft: `3px solid ${color}` }}>
                        {Icon && (
                            <div className="p-2 rounded-lg flex-shrink-0" style={{ background: bg, color }}>
                                <Icon size={16} />
                            </div>
                        )}
                        <div>
                            <p className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>{label}</p>
                            <p className="text-xl font-semibold" style={{ color: text ? color : 'var(--jet)' }}>{value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Toolbar ── */}
            <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, cédula…"
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        className="w-full rounded-lg text-xs"
                        style={{
                            paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7,
                            background: 'var(--porcelain)', border: '0.5px solid var(--border-md)',
                            color: 'var(--jet)', outline: 'none',
                        }}
                    />
                </div>
                <button
                    onClick={fetchMorosos}
                    className="flex items-center gap-1.5 px-3 py-[7px] rounded-lg text-xs"
                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)', background: 'var(--porcelain)' }}
                    title="Refrescar"
                >
                    <RefreshCcw size={13} className={loading ? 'animate-spin' : ''} />
                    Refrescar
                </button>
                <button
                    onClick={handleExportExcel}
                    disabled={exportingExcel || loading}
                    className="flex items-center gap-1.5 px-3 py-[7px] rounded-lg text-xs font-medium text-white disabled:opacity-50"
                    style={{ background: 'var(--jet)' }}
                    title="Exportar Excel"
                >
                    {exportingExcel ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                    Excel
                </button>
            </div>

            {/* ── Table ── */}
            <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)' }}>
                <table className="w-full text-sm">
                    <thead>
                        <tr style={{ background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
                            {['Alumno', 'Cédula escolar', 'Grado', 'Representante', 'Teléfono', 'Deuda (USD)', ''].map(h => (
                                <th key={h} className="text-left px-4 py-3 text-[11px] font-medium uppercase tracking-wide"
                                    style={{ color: 'var(--ash)' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-12 text-center">
                                    <Loader2 className="animate-spin mx-auto" size={22} style={{ color: 'var(--pb)' }} />
                                </td>
                            </tr>
                        ) : alumnos.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-12 text-center">
                                    <div className="flex flex-col items-center gap-2">
                                        <AlertTriangle size={28} style={{ color: 'var(--ash)' }} />
                                        <p className="text-xs" style={{ color: 'var(--ash)' }}>
                                            {busqueda ? 'No se encontraron resultados.' : 'No hay alumnos en mora. ¡Buenas noticias!'}
                                        </p>
                                    </div>
                                </td>
                            </tr>
                        ) : alumnos.map((alu, idx) => {
                            const deuda = deudas[alu.cedula_escolar];
                            return (
                                <tr
                                    key={alu.id}
                                    className="anim-fade-up transition-all"
                                    style={{
                                        borderBottom: '0.5px solid var(--border)',
                                        background: 'var(--porcelain)',
                                        animationDelay: `${idx * 30}ms`,
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'var(--porcelain)'}
                                >
                                    {/* Alumno */}
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2.5">
                                            <Avatar nombre={alu.nombre} apellido={alu.apellido} />
                                            <div>
                                                <p className="text-xs font-medium" style={{ color: 'var(--jet)' }}>
                                                    {alu.nombre} {alu.apellido}
                                                </p>
                                                <p className="text-[10px]" style={{ color: 'var(--ash)' }}>
                                                    {alu.genero === 'masculino' ? 'Masculino' : 'Femenino'}
                                                </p>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Cédula */}
                                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--ash)' }}>
                                        {alu.cedula_escolar ?? '—'}
                                    </td>

                                    {/* Grado */}
                                    <td className="px-4 py-3">
                                        {alu.grado_seccion ? (
                                            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                                                style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}>
                                                <GraduationCap size={11} />
                                                {alu.grado_seccion}
                                            </span>
                                        ) : (
                                            <span className="text-xs" style={{ color: 'var(--ash)' }}>—</span>
                                        )}
                                    </td>

                                    {/* Representante */}
                                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--jet)' }}>
                                        {alu.representante
                                            ? `${alu.representante.nombre} ${alu.representante.apellido}`
                                            : <span style={{ color: 'var(--ash)' }}>—</span>}
                                        {alu.representante?.cedula && (
                                            <p className="text-[10px] font-mono" style={{ color: 'var(--ash)' }}>
                                                {alu.representante.cedula}
                                            </p>
                                        )}
                                    </td>

                                    {/* Teléfono */}
                                    <td className="px-4 py-3">
                                        {alu.representante?.telefono ? (
                                            <a href={`tel:${alu.representante.telefono}`}
                                                className="inline-flex items-center gap-1 text-xs"
                                                style={{ color: 'var(--pb)' }}>
                                                <Phone size={11} />
                                                {alu.representante.telefono}
                                            </a>
                                        ) : (
                                            <span className="text-xs" style={{ color: 'var(--ash)' }}>—</span>
                                        )}
                                    </td>

                                    {/* Deuda */}
                                    <td className="px-4 py-3">
                                        {deuda === undefined || deuda === null ? (
                                            <span className="text-xs" style={{ color: 'var(--ash)' }}>
                                                {loadingDeudas ? <Loader2 size={12} className="animate-spin" /> : '—'}
                                            </span>
                                        ) : (
                                            <span className="text-xs font-semibold tabular-nums" style={{ color: '#dc2626' }}>
                                                ${fmt(deuda)}
                                            </span>
                                        )}
                                    </td>

                                    {/* Acción */}
                                    <td className="px-4 py-3">
                                        <button
                                            onClick={() => navigate('/cobranza')}
                                            className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg transition-all"
                                            style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)', border: '0.5px solid var(--pb)' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--pb)' || (e.currentTarget.style.color = '#fff')}
                                            onMouseLeave={e => { e.currentTarget.style.background = 'var(--pb-light)'; e.currentTarget.style.color = 'var(--pb-mid)'; }}
                                            title="Ir a cobranza"
                                        >
                                            <ExternalLink size={11} />
                                            Cobrar
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Morosos;
