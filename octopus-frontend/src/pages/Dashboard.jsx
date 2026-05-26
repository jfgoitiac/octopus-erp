import { useEffect, useState, useCallback } from 'react';
import {
    Users, AlertTriangle, TrendingUp, BookOpen,
    Loader2, DollarSign, Wallet, CheckCircle,
    UserMinus, Award
} from 'lucide-react';
import axiosInstance from '../api/apiClient';
import { useTasaBCV } from '../hooks/useTasaBCV';

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmt = (n, d = 0) =>
    Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d });

// ─── SVG Donut chart ──────────────────────────────────────────────────────────
const DonutChart = ({ data, size = 180, thickness = 28 }) => {
    const cx = size / 2;
    const cy = size / 2;
    const r  = (size - thickness) / 2;
    const circ = 2 * Math.PI * r;
    const total = data.reduce((s, d) => s + (d.value || 0), 0);

    if (total === 0) return (
        <svg width={size} height={size}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border-md)" strokeWidth={thickness} />
            <text x={cx} y={cy + 5} textAnchor="middle" fontSize={11} fill="var(--ash)">Sin datos</text>
        </svg>
    );

    let cumulative = 0;
    const segments = data.map(d => {
        const pct   = d.value / total;
        const dash  = pct * circ;
        const gap   = circ - dash;
        // rotate so first segment starts at top (-90°)
        const rotate = (cumulative / total) * 360 - 90;
        cumulative += d.value;
        return { ...d, dash, gap, rotate };
    });

    return (
        <svg width={size} height={size}>
            {segments.map((seg, i) => (
                <circle
                    key={i}
                    cx={cx} cy={cy} r={r}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth={thickness}
                    strokeDasharray={`${seg.dash} ${seg.gap}`}
                    strokeLinecap="butt"
                    transform={`rotate(${seg.rotate} ${cx} ${cy})`}
                    style={{ transition: 'stroke-dasharray 0.5s ease' }}
                />
            ))}
            <text x={cx} y={cy - 6}  textAnchor="middle" fontSize={22} fontWeight="600" fill="var(--jet)">{total}</text>
            <text x={cx} y={cy + 14} textAnchor="middle" fontSize={10} fill="var(--ash)">alumnos</text>
        </svg>
    );
};

// ─── Horizontal stacked bar ───────────────────────────────────────────────────
const StackedBar = ({ used, max, height = 10 }) => {
    const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0;
    const color = pct >= 90 ? '#dc2626' : pct >= 70 ? '#d97706' : '#4f6ef7';
    return (
        <div className="w-full rounded-full overflow-hidden" style={{ height, background: 'var(--border-md)' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999, transition: 'width 0.6s ease' }} />
        </div>
    );
};

// ─── KPI card ─────────────────────────────────────────────────────────────────
const KpiCard = ({ icon: Icon, label, value, sub, accent, iconBg, iconColor }) => (
    <div className="rounded-xl p-4 flex flex-col gap-2"
        style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)', borderLeft: `3px solid ${accent}` }}>
        <div className="flex items-start justify-between">
            <span className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>{label}</span>
            <div className="p-1.5 rounded-lg" style={{ background: iconBg, color: iconColor }}>
                <Icon size={15} />
            </div>
        </div>
        <p className="text-2xl font-semibold leading-none" style={{ color: 'var(--jet)' }}>{value}</p>
        {sub && <p className="text-[11px]" style={{ color: 'var(--ash)' }}>{sub}</p>}
    </div>
);

const SectionTitle = ({ children }) => (
    <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--ash)' }}>{children}</p>
);

const Legend = ({ items }) => (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 justify-center">
        {items.map(item => (
            <div key={item.label} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
                <span className="text-[11px]" style={{ color: 'var(--ash)' }}>{item.label}</span>
                <span className="text-[11px] font-medium" style={{ color: 'var(--jet)' }}>{item.value}</span>
            </div>
        ))}
    </div>
);

// ─── main component ───────────────────────────────────────────────────────────
const Dashboard = () => {
    const { tasa } = useTasaBCV();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchStats = useCallback(async () => {
        try {
            const res = await axiosInstance.get('cobranza/stats/');
            setStats(res.data);
        } catch {
            // show zeros
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchStats(); }, [fetchStats]);

    if (loading) return (
        <div className="flex items-center justify-center p-20">
            <Loader2 className="animate-spin" style={{ color: 'var(--pb)' }} size={32} />
        </div>
    );

    const s = stats ?? {};

    const tasaDisplay = tasa > 0
        ? `Bs. ${fmt(tasa, 2)}`
        : (s.tasa_bcv > 0 ? `Bs. ${fmt(s.tasa_bcv, 2)}` : '—');

    const financialData = [
        { label: 'Solventes', value: s.solventes ?? 0, color: '#16a34a' },
        { label: 'En mora',   value: s.morosos   ?? 0, color: '#dc2626' },
        { label: 'Becados',   value: s.becados   ?? 0, color: '#7c3aed' },
    ];

    const genderData = [
        { label: 'Masculino', value: s.masculino ?? 0, color: '#2563eb' },
        { label: 'Femenino',  value: s.femenino  ?? 0, color: '#db2777' },
    ];

    const totalGender = (s.masculino ?? 0) + (s.femenino ?? 0);

    const gradeData = (s.grados ?? []);

    const today = new Date().toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' });

    return (
        <div className="flex flex-col gap-5">

            {/* ── Row 1: KPI cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                <KpiCard icon={Users}        label="Alumnos activos"  value={fmt(s.total_activos ?? 0)}
                    sub={`${fmt(s.inactivos ?? 0)} retirados`}
                    accent="#4f6ef7" iconBg="var(--pb-light)" iconColor="#4f6ef7" />
                <KpiCard icon={CheckCircle}  label="Solventes"        value={fmt(s.solventes ?? 0)}
                    accent="#16a34a" iconBg="#dcfce7" iconColor="#16a34a" />
                <KpiCard icon={AlertTriangle} label="En mora"         value={fmt(s.morosos ?? 0)}
                    accent="#dc2626" iconBg="var(--red-light)" iconColor="#dc2626" />
                <KpiCard icon={Award}        label="Becados"          value={fmt(s.becados ?? 0)}
                    accent="#7c3aed" iconBg="#ede9fe" iconColor="#7c3aed" />
                <KpiCard icon={UserMinus}    label="Retirados"        value={fmt(s.inactivos ?? 0)}
                    accent="#6b7280" iconBg="var(--ash-light)" iconColor="#6b7280" />
                <KpiCard icon={TrendingUp}   label="Tasa BCV"         value={tasaDisplay}
                    sub={today}
                    accent="#4f6ef7" iconBg="var(--pb-light)" iconColor="#4f6ef7" />
            </div>

            {/* ── Row 2: charts + cobranza ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                {/* Distribución financiera — donut */}
                <div className="rounded-xl p-4 flex flex-col"
                    style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                    <SectionTitle>Estado financiero</SectionTitle>
                    <div className="flex justify-center flex-1 items-center">
                        <DonutChart data={financialData} size={180} thickness={30} />
                    </div>
                    <Legend items={financialData} />
                </div>

                {/* Distribución por género */}
                <div className="rounded-xl p-4 flex flex-col"
                    style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                    <SectionTitle>Distribución por género</SectionTitle>
                    <div className="flex justify-center my-4">
                        <DonutChart data={genderData} size={180} thickness={30} />
                    </div>
                    <div className="flex justify-center gap-6">
                        {genderData.map(g => {
                            const pct = totalGender > 0 ? Math.round((g.value / totalGender) * 100) : 0;
                            return (
                                <div key={g.label} className="text-center">
                                    <p className="text-2xl font-semibold" style={{ color: g.color }}>{fmt(g.value)}</p>
                                    <p className="text-[10px]" style={{ color: 'var(--ash)' }}>{g.label}</p>
                                    <p className="text-[10px] font-medium" style={{ color: g.color }}>{pct}%</p>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Cobranza del día */}
                <div className="rounded-xl p-4 flex flex-col gap-3"
                    style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                    <SectionTitle>Cobranza hoy</SectionTitle>
                    {[
                        { icon: DollarSign, label: 'Total USD cobrado',  value: `$${fmt(s.cobrado_hoy_usd ?? 0, 2)}`,    color: '#16a34a', bg: '#dcfce7' },
                        { icon: Wallet,     label: 'Total VES cobrado',  value: `Bs. ${fmt(s.cobrado_hoy_ves ?? 0, 0)}`, color: '#4f6ef7', bg: 'var(--pb-light)' },
                        { icon: BookOpen,   label: 'Pagos procesados',   value: fmt(s.pagos_hoy_count ?? 0),              color: '#7c3aed', bg: '#ede9fe' },
                    ].map(({ icon: Icon, label, value, color, bg }) => (
                        <div key={label} className="flex items-center gap-3 rounded-lg px-3 py-3"
                            style={{ background: 'var(--bg)', border: '0.5px solid var(--border)' }}>
                            <div className="p-2 rounded-lg flex-shrink-0" style={{ background: bg, color }}>
                                <Icon size={15} />
                            </div>
                            <div>
                                <p className="text-[10px]" style={{ color: 'var(--ash)' }}>{label}</p>
                                <p className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>{value}</p>
                            </div>
                        </div>
                    ))}
                    {(s.pagos_hoy_count ?? 0) === 0 && (
                        <p className="text-[11px] text-center" style={{ color: 'var(--ash)' }}>Sin pagos registrados hoy.</p>
                    )}
                </div>
            </div>

            {/* ── Row 3: grade occupancy ── */}
            {gradeData.length > 0 && (
                <div className="rounded-xl p-4"
                    style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                    <SectionTitle>Ocupación por grado</SectionTitle>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-3">
                        {gradeData.map(g => {
                            const pct = g.cupos_maximos > 0
                                ? Math.round((g.cupos_utilizados / g.cupos_maximos) * 100)
                                : 0;
                            const color = pct >= 90 ? '#dc2626' : pct >= 70 ? '#d97706' : '#4f6ef7';
                            return (
                                <div key={g.grado_seccion}>
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-xs font-medium" style={{ color: 'var(--jet)' }}>{g.grado_seccion}</span>
                                        <span className="text-[11px] tabular-nums" style={{ color }}>
                                            {g.cupos_utilizados}/{g.cupos_maximos}
                                            <span className="ml-1" style={{ color: 'var(--ash)' }}>({pct}%)</span>
                                        </span>
                                    </div>
                                    <StackedBar used={g.cupos_utilizados} max={g.cupos_maximos} height={8} />
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
