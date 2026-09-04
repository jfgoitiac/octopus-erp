import { memo, useState } from 'react';
import {
    UserPlus, FileWarning, TrendingUp, TrendingDown, Minus, AlertTriangle, RefreshCw, ChevronDown,
} from 'lucide-react';
import { useInscripcionesStats } from '../../hooks/useInscripcionesStats';
import KpiCard from './KpiCard';
import InscripcionesSkeleton from './InscripcionesSkeleton';
import { Card } from '../ui/Card';
import { Tabla } from '../ui/Tabla';

const TendenciaIndicador = memo(({ tendencia, variacionPct }) => {
    if (tendencia === 'neutral') {
        return (
            <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--ash)' }}>
                <Minus size={13} />
                Sin variación previa
            </span>
        );
    }
    const up = tendencia === 'up';
    const Icon = up ? TrendingUp : TrendingDown;
    const color = up ? '#16a34a' : '#dc2626';
    return (
        <span className="flex items-center gap-1 text-xs font-semibold" style={{ color }}>
            <Icon size={13} />
            {Math.abs(variacionPct).toFixed(1)}% vs. mes anterior
        </span>
    );
});
TendenciaIndicador.displayName = 'TendenciaIndicador';

const InscripcionesBlock = () => {
    const {
        loading, error, retry, visible, periodoEscolar, kpi, mesActual, gradoData,
    } = useInscripcionesStats();
    const [ocupacionAbierta, setOcupacionAbierta] = useState(false);

    if (loading) return <InscripcionesSkeleton />;

    if (!error && !visible) return null;

    if (error) return (
        <Card className="anim-scale-in card-lift">
            <div className="flex flex-col items-center gap-4 py-12">
                <AlertTriangle size={32} style={{ color: '#dc2626' }} />
                <p className="text-sm text-center" style={{ color: 'var(--ash)' }}>
                    No se pudo cargar el resumen de inscripciones.
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
        </Card>
    );

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-sm sm:text-base font-semibold" style={{ color: 'var(--jet)' }}>
                    Inscripciones
                </h2>
                <span
                    className="text-xs font-medium px-2.5 py-1 rounded-full w-fit"
                    style={{ background: 'var(--pb-light)', color: '#4f6ef7' }}
                >
                    Período {periodoEscolar}
                </span>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiCard icon={UserPlus}    label="Total inscritos"      value={kpi.totalInscritos}
                    accent="#4f6ef7" iconBg="var(--pb-light)" iconColor="#4f6ef7" delay={0} />
                <KpiCard icon={UserPlus}    label="Nuevo ingreso"        value={kpi.nuevoIngreso}
                    sub={`${kpi.nuevoIngresoPct}% del total`}
                    accent="#16a34a" iconBg="#dcfce7" iconColor="#16a34a" delay={60} />
                <KpiCard icon={UserPlus}    label="Regular"              value={kpi.regular}
                    sub={`${kpi.regularPct}% del total`}
                    accent="#7c3aed" iconBg="#ede9fe" iconColor="#7c3aed" delay={120} />
                <KpiCard icon={FileWarning} label="Documentos pendientes" value={kpi.documentosPendientes}
                    accent="#d97706" iconBg="#fef3c7" iconColor="#d97706" delay={180} />
            </div>

            {/* Mes actual */}
            <Card titulo="Inscripciones del mes" className="flex flex-col justify-between gap-3 anim-scale-in card-lift">
                <p className="text-3xl font-semibold leading-none" style={{ color: 'var(--jet)' }}>
                    {mesActual.cantidad}
                </p>
                <TendenciaIndicador tendencia={mesActual.tendencia} variacionPct={mesActual.variacionPct} />
            </Card>

            {/* Tabla de ocupación por grado — colapsada por defecto */}
            <Card
                className="anim-scale-in card-lift"
                padding="none"
                titulo="Ocupación por grado"
                accion={
                    <button
                        type="button"
                        onClick={() => setOcupacionAbierta(v => !v)}
                        aria-expanded={ocupacionAbierta}
                        className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg min-h-[36px] sm:min-h-0"
                        style={{ color: 'var(--ash)' }}
                    >
                        {ocupacionAbierta ? 'Ocultar' : 'Ver detalle'}
                        <ChevronDown
                            size={16}
                            style={{
                                transform: ocupacionAbierta ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.25s ease',
                            }}
                        />
                    </button>
                }
            >
                <div
                    style={{
                        display: 'grid',
                        gridTemplateRows: ocupacionAbierta ? '1fr' : '0fr',
                        transition: 'grid-template-rows 0.3s ease',
                    }}
                >
                    <div style={{ overflow: 'hidden' }}>
                        <div className="p-[var(--pad-card)] sm:p-[var(--pad-card-lg)] pt-0">
                            {gradoData.length === 0 ? (
                                <p className="text-sm text-center py-8" style={{ color: 'var(--ash)' }}>
                                    Sin grados configurados
                                </p>
                            ) : (
                                <Tabla
                                    minWidth={560}
                                    columnas={[
                                        { key: 'grado', label: 'Grado / Sección' },
                                        { key: 'inscritos', label: 'Inscritos', align: 'right' },
                                        { key: 'cupos', label: 'Cupos máximos', align: 'right' },
                                        { key: 'disponibles', label: 'Disponibles', align: 'right' },
                                        { key: 'pct', label: '%', align: 'right' },
                                    ]}
                                >
                                    {gradoData.map((g) => (
                                        <tr
                                            key={g.grado_seccion}
                                            style={g.sinCupos ? { background: 'var(--red-light, #fee2e2)' } : undefined}
                                        >
                                            <td className="px-3 py-3 sm:px-4 font-medium" style={{ color: g.sinCupos ? 'var(--red, #dc2626)' : 'var(--jet)' }}>
                                                {g.grado_seccion}
                                            </td>
                                            <td className="px-3 py-3 sm:px-4 text-right tabular-nums" style={{ color: g.sinCupos ? 'var(--red, #dc2626)' : 'var(--ash)' }}>
                                                {g.inscritos}
                                            </td>
                                            <td className="px-3 py-3 sm:px-4 text-right tabular-nums" style={{ color: g.sinCupos ? 'var(--red, #dc2626)' : 'var(--ash)' }}>
                                                {g.cupos_maximos}
                                            </td>
                                            <td className="px-3 py-3 sm:px-4 text-right tabular-nums font-semibold" style={{ color: g.sinCupos ? 'var(--red, #dc2626)' : 'var(--jet)' }}>
                                                {g.cupos_disponibles}
                                            </td>
                                            <td className="px-3 py-3 sm:px-4 text-right tabular-nums" style={{ color: g.sinCupos ? 'var(--red, #dc2626)' : 'var(--ash)' }}>
                                                {g.pct}%
                                            </td>
                                        </tr>
                                    ))}
                                </Tabla>
                            )}
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    );
};

export default InscripcionesBlock;
