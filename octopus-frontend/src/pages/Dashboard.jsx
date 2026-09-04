import { useRef, useMemo, useEffect, memo } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    Users, AlertTriangle, TrendingUp, BookOpen,
    DollarSign, Wallet, CheckCircle, UserMinus, Award, RefreshCw,
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

    // date-fns format with locale is non-trivial; compute once per mount, not every render
    const today = useMemo(
        () => format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es }),
        []
    );

    if (loading) return <DashboardSkeleton />;

    if (error) return (
        <div className="flex flex-col items-center gap-4 p-20">
            <AlertTriangle size={36} style={{ color: '#dc2626' }} />
            <p className="text-sm" style={{ color: 'var(--ash)' }}>
                No se pudo cargar el resumen del dashboard.
            </p>
            <button
                onClick={retry}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium min-h-[44px]"
                style={{ background: 'var(--pb)', color: '#fff' }}
            >
                <RefreshCw size={14} />
                Reintentar
            </button>
        </div>
    );

    return (
        <div>
            <PageHeader
                titulo="Panel de control"
                descripcion={today}
                acciones={
                    <button
                        onClick={retry}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 min-h-[44px] w-full sm:w-auto justify-center"
                        style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                    >
                        <RefreshCw size={12} />
                        Actualizar
                    </button>
                }
            />

            <div className="flex flex-col gap-5">
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
                    <div className="flex justify-center flex-1 items-center">
                        <DonutChart data={financialData} size={180} thickness={30} />
                    </div>
                    <Legend items={financialData} />
                </Card>

                {/* Distribución por género */}
                <Card titulo="Distribución por género" className="flex flex-col anim-scale-in card-lift">
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
                    <CobranzaFila icon={DollarSign} label="Total USD cobrado" value={kpi.cobradoHoyUsd} color="#16a34a" bg="#dcfce7" />
                    <CobranzaFila icon={Wallet}     label="Total VES cobrado" value={kpi.cobradoHoyVes} color="#4f6ef7" bg="var(--pb-light)" />
                    <CobranzaFila icon={BookOpen}   label="Pagos procesados"  value={kpi.pagosHoyCount} color="#7c3aed" bg="#ede9fe" />
                    {(s.pagos_hoy_count ?? 0) === 0 && (
                        <p className="text-[11px] text-center" style={{ color: 'var(--ash)' }}>
                            Sin pagos registrados hoy.
                        </p>
                    )}
                </Card>
            </div>
            </div>
        </div>
    );
};

export default Dashboard;
