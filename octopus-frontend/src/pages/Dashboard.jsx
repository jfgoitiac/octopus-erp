import { useRef, useMemo, useEffect, useState, memo } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
    Users, AlertTriangle, TrendingUp, BookOpen,
    DollarSign, Wallet, CheckCircle, UserMinus, Award, RefreshCw, Sparkles,
    Download, Flag, Check, UserRoundCheck, Filter,
} from 'lucide-react';
import { useDashboardStats } from '../hooks/useDashboardStats';
import KpiCard from '../components/dashboard/KpiCard';
import DonutChart from '../components/dashboard/DonutChart';
import DashboardSkeleton from '../components/dashboard/DashboardSkeleton';
import InscripcionesBlock from '../components/dashboard/InscripcionesBlock';
import SolvenciaGradoBlock from '../components/dashboard/SolvenciaGradoBlock';
import { fmt } from '../utils/format';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';

// ─── pequeños helpers de UI locales ──────────────────────────────────────────

const Legend = memo(({ items }) => (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 justify-center">
        {items.map(item => (
            // Stable key on label — avoids DOM destruction when value updates
            <div key={item.label} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
                <span className="text-[11px]" style={{ color: 'var(--ash)' }}>{item.label}</span>
                <span className="text-[11px] font-medium" style={{ color: 'var(--jet)' }}>{item.value}</span>
            </div>
        ))}
    </div>
));
Legend.displayName = 'Legend';

const Provenance = ({ updatedAt, compact = false }) => (
    <details className={compact ? 'text-[10px]' : 'text-xs'}>
        <summary className="cursor-pointer list-none underline underline-offset-2" style={{ color: 'var(--ash)' }}>
            Origen y método
        </summary>
        <div className="mt-2 rounded-lg p-2.5 leading-relaxed" style={{ background: 'var(--bg)', color: 'var(--ash)', border: '0.5px solid var(--border)' }}>
            Fuente: <strong style={{ color: 'var(--jet)' }}>Cobranza y registro académico</strong><br />
            Actualizado: <strong style={{ color: 'var(--jet)' }}>{updatedAt}</strong><br />
            Método: <strong style={{ color: 'var(--jet)' }}>reglas analíticas v1.0</strong> (sin IA generativa).
        </div>
    </details>
);

const ChartHeader = ({ updatedAt, action }) => (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <span className="text-[10px]" style={{ color: 'var(--ash)' }}>Datos actualizados {updatedAt}</span>
        <div className="flex items-center gap-2">
            {action}
            <Provenance updatedAt={updatedAt} compact />
        </div>
    </div>
);

// Hover handled via direct DOM mutation — avoids a React re-render per mouse event.
const CobranzaFila = memo(({ icon: Icon, label, value, color, bg }) => {
    const rowRef    = useRef(null);
    const timerRef  = useRef(null);

    useEffect(() => () => clearTimeout(timerRef.current), []);

    const activate   = () => { if (rowRef.current) rowRef.current.style.boxShadow = `0 4px 16px ${color}20`; };
    const deactivate = () => { if (rowRef.current) rowRef.current.style.boxShadow = ''; };
    const onTouchStart = () => { clearTimeout(timerRef.current); activate(); };
    const onTouchEnd   = () => { timerRef.current = setTimeout(deactivate, 200); };

    return (
        <div
            ref={rowRef}
            className="flex items-center gap-3 rounded-lg px-3 py-3"
            style={{
                background: 'var(--bg)',
                border: '0.5px solid var(--border)',
                transition: 'box-shadow 0.2s ease',
            }}
            onMouseEnter={activate}
            onMouseLeave={deactivate}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
        >
            <div className="p-2 rounded-lg flex-shrink-0" style={{ background: bg, color }}>
                <Icon size={15} />
            </div>
            <div>
                <p className="text-[10px]" style={{ color: 'var(--ash)' }}>{label}</p>
                <p className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>{value}</p>
            </div>
        </div>
    );
});
CobranzaFila.displayName = 'CobranzaFila';

// ─── componente principal ─────────────────────────────────────────────────────

const Dashboard = () => {
    const { raw: s, loading, error, retry, financialData, genderData, totalGender, kpi } =
        useDashboardStats();
    const navigate = useNavigate();
    const [feedback, setFeedback] = useState(null);
    const [showHumanReview, setShowHumanReview] = useState(false);

    // date-fns format with locale is non-trivial; compute once per mount, not every render
    const today = useMemo(
        () => format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es }),
        []
    );
    const updatedAt = useMemo(
        () => format(new Date(), "d MMM yyyy, HH:mm", { locale: es }),
        [s]
    );

    const registerFeedback = (type) => {
        const entry = { type, createdAt: new Date().toISOString(), screen: 'dashboard' };
        const history = JSON.parse(localStorage.getItem('octopus.dashboard.feedback') || '[]');
        localStorage.setItem('octopus.dashboard.feedback', JSON.stringify([...history, entry].slice(-50)));
        setFeedback(type);
        toast.success(type === 'confirmada' ? 'Observación confirmada y registrada.' : 'Observación reportada para revisión.');
    };

    const exportSummary = () => {
        const rows = [
            ['Métrica', 'Valor'], ['Alumnos activos', kpi.totalActivos], ['Solventes', kpi.solventes],
            ['En mora', kpi.morosos], ['Cobrado hoy USD', kpi.cobradoHoyUsd], ['Cobrado hoy VES', kpi.cobradoHoyVes],
        ];
        const blob = new Blob([rows.map(row => row.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = 'resumen-dashboard.csv'; link.click();
        URL.revokeObjectURL(url);
    };

    if (loading) return <DashboardSkeleton />;

    if (error) return (
        <div className="flex flex-col items-center gap-4 p-20">
            <AlertTriangle size={36} style={{ color: '#dc2626' }} />
            <p className="text-sm" style={{ color: 'var(--ash)' }}>
                No fue posible actualizar los datos. No se generó ninguna sugerencia para evitar conclusiones poco confiables.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
                <button onClick={retry} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium min-h-[44px]" style={{ background: 'var(--pb)', color: '#fff' }}><RefreshCw size={14} />Probar consulta alternativa</button>
                <button onClick={() => setShowHumanReview(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium min-h-[44px]" style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}><UserRoundCheck size={14} />Solicitar revisión humana</button>
            </div>
            {showHumanReview && <p className="text-xs" style={{ color: '#166534' }}>Solicitud registrada para revisión humana.</p>}
        </div>
    );

    return (
        <div>
            <PageHeader
                titulo="Panel de control"
                descripcion={today}
                acciones={
                    <div className="flex gap-2 w-full sm:w-auto">
                        <button onClick={exportSummary} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium min-h-[44px] justify-center" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}><Download size={12} />Exportar</button>
                        <button onClick={retry} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 min-h-[44px] justify-center" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}><RefreshCw size={12} />Actualizar</button>
                    </div>
                }
            />

            <div className="flex flex-col gap-5">
            <Card className="anim-scale-in dashboard-insight-new" padding="normal">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1"><Sparkles size={15} style={{ color: 'var(--pb)' }} /><span className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Lectura asistida</span></div>
                        <p className="text-sm" style={{ color: 'var(--ash)' }}>
                            {s.morosos > 0 ? `Los datos disponibles sugieren revisar ${kpi.morosos} cuentas en mora antes de priorizar la cobranza de hoy.` : 'Los datos disponibles no muestran cuentas en mora para priorizar hoy.'}
                        </p>
                        <div className="mt-2"><Provenance updatedAt={updatedAt} /></div>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                        <button onClick={() => navigate('/morosos')} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold" style={{ background: 'var(--pb)', color: '#fff' }}><Filter size={13} />Filtrar mora</button>
                        <button onClick={() => navigate('/cobranza/dashboard')} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold" style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}>Profundizar</button>
                        <button onClick={() => registerFeedback('confirmada')} aria-label="Confirmar observación" className="inline-flex min-h-[36px] items-center justify-center rounded-lg px-2.5" style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }} title="Confirmar observación"><Check size={14} /></button>
                        <button onClick={() => registerFeedback('reportada')} aria-label="Reportar observación" className="inline-flex min-h-[36px] items-center justify-center rounded-lg px-2.5" style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }} title="Reportar observación"><Flag size={14} /></button>
                    </div>
                </div>
                {feedback && <p className="mt-3 text-xs" style={{ color: '#166534' }}>Feedback {feedback}: guardado localmente para auditoría.</p>}
            </Card>
            {/* ── Row 1: KPI cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                <KpiCard icon={Users}         label="Alumnos activos" value={kpi.totalActivos}
                    sub={`${kpi.inactivos} retirados`}
                    accent="#4f6ef7" iconBg="var(--pb-light)" iconColor="#4f6ef7" delay={0} />
                <KpiCard icon={CheckCircle}   label="Solventes"       value={kpi.solventes}
                    accent="#16a34a" iconBg="#dcfce7" iconColor="#16a34a" delay={60} />
                <KpiCard icon={AlertTriangle} label="En mora"         value={kpi.morosos}
                    accent="#dc2626" iconBg="var(--red-light)" iconColor="#dc2626" delay={120} />
                <KpiCard icon={Award}         label="Becados"         value={kpi.becados}
                    accent="#7c3aed" iconBg="#ede9fe" iconColor="#7c3aed" delay={180} />
                <KpiCard icon={UserMinus}     label="Retirados"       value={kpi.inactivos}
                    accent="#6b7280" iconBg="var(--ash-light)" iconColor="#6b7280" delay={240} />
                <KpiCard icon={TrendingUp}    label="Tasa BCV"        value={kpi.tasaBcv}
                    sub={today}
                    accent="#4f6ef7" iconBg="var(--pb-light)" iconColor="#4f6ef7" delay={300} />
            </div>

            {/* ── Row 2: inscripciones (independiente del resto de este dashboard) ── */}
            <InscripcionesBlock />

            {/* ── Solvencia por grado: inmediatamente debajo de "Ocupación por
                 grado" (Card colapsable dentro de InscripcionesBlock, no una
                 Row propia de este archivo — ver NOTAS_TECNICAS.md). Bloque
                 autoabastecido, visible solo para
                 director/administrador/cobranza/sistemas. ── */}
            <SolvenciaGradoBlock />

            {/* ── Row 3: gráficas + cobranza ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                {/* Estado financiero */}
                <Card titulo="Estado financiero" className="flex flex-col anim-scale-in card-lift">
                    <ChartHeader updatedAt={updatedAt} action={<button onClick={() => navigate('/morosos')} className="text-[10px] font-semibold underline underline-offset-2" style={{ color: 'var(--pb)' }}>Ver detalle</button>} />
                    <div className="flex justify-center flex-1 items-center">
                        <DonutChart data={financialData} size={180} thickness={30} />
                    </div>
                    <Legend items={financialData} />
                </Card>

                {/* Distribución por género */}
                <Card titulo="Distribución por género" className="flex flex-col anim-scale-in card-lift">
                    <ChartHeader updatedAt={updatedAt} action={<button onClick={() => navigate('/alumnos')} className="text-[10px] font-semibold underline underline-offset-2" style={{ color: 'var(--pb)' }}>Explorar</button>} />
                    <div className="flex justify-center my-4">
                        <DonutChart data={genderData} size={180} thickness={30} label="estudiantes" />
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
                </Card>

                {/* Cobranza hoy */}
                <Card titulo="Cobranza hoy" className="flex flex-col gap-3 anim-scale-in card-lift">
                    <ChartHeader updatedAt={updatedAt} action={<button onClick={() => navigate('/cobranza/dashboard')} className="text-[10px] font-semibold underline underline-offset-2" style={{ color: 'var(--pb)' }}>Profundizar</button>} />
                    <CobranzaFila icon={DollarSign} label="Total USD cobrado" value={kpi.cobradoHoyUsd} color="#16a34a" bg="#dcfce7" />
                    <CobranzaFila icon={Wallet}     label="Total VES cobrado" value={kpi.cobradoHoyVes} color="#4f6ef7" bg="var(--pb-light)" />
                    <CobranzaFila icon={BookOpen}   label="Pagos procesados"  value={kpi.pagosHoyCount} color="#7c3aed" bg="#ede9fe" />
                    {(s.pagos_hoy_count ?? 0) === 0 && (
                        <div className="rounded-lg p-3 text-center" style={{ background: '#fffbeb', border: '0.5px solid #fde68a' }}>
                            <p className="text-[11px] font-medium" style={{ color: '#92400e' }}>Datos insuficientes para generar una sugerencia confiable.</p>
                            <div className="mt-2 flex justify-center gap-2"><button onClick={retry} className="text-[11px] underline" style={{ color: '#92400e' }}>Probar consulta alternativa</button><button onClick={() => setShowHumanReview(true)} className="text-[11px] underline" style={{ color: '#92400e' }}>Solicitar revisión humana</button></div>
                        </div>
                    )}
                    {showHumanReview && <div className="rounded-lg p-2 text-[11px]" style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}><UserRoundCheck size={13} className="inline mr-1" />Solicitud registrada. Un responsable podrá revisar los datos de cobranza.</div>}
                </Card>
            </div>
            </div>
        </div>
    );
};

export default Dashboard;
