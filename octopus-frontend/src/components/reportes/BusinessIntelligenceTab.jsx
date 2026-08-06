import { useState, useEffect, useCallback } from 'react';
import {
    DollarSign, TrendingUp, TrendingDown, BarChart2, Target,
} from 'lucide-react';
import { toast } from 'react-toastify';
import axiosInstance from '../../api/apiClient';
import { CardSkeleton } from '../shared/Skeleton';
import {
    fmt, getErrorMessage, CURRENT_YEAR,
    sumPagos, countUniqAlumnos, mesConMayorRecaudacion,
} from '../../constants/reportes';
import TrendBadge from './TrendBadge';

const BusinessIntelligenceTab = () => {
    const [biStats, setBiStats] = useState(null);
    const [biPagos, setBiPagos] = useState([]);
    const [biPagosAnt, setBiPagosAnt] = useState({ actual: [], anterior: [] });
    const [loadingBI, setLoadingBI] = useState(true);
    const [biAnioFiltro, setBiAnioFiltro] = useState(() => new Date().getFullYear());

    const fetchBI = useCallback(async (anio) => {
        setLoadingBI(true);
        try {
            const hoy = new Date();
            const mesActual = String(hoy.getMonth() + 1).padStart(2, '0');
            const anioActual = hoy.getFullYear();
            const ultimoDia = new Date(anioActual, hoy.getMonth() + 1, 0).getDate();

            const fechaDesde = `${anioActual}-${mesActual}-01`;
            const fechaHasta = `${anioActual}-${mesActual}-${String(ultimoDia).padStart(2, '0')}`;

            const anioEscolarActualDesde = `${anio}-09-01`;
            const anioEscolarActualHasta = `${anio + 1}-07-31`;
            const anioEscolarAntDesde    = `${anio - 1}-09-01`;
            const anioEscolarAntHasta    = `${anio}-07-31`;

            const [resStats, resPagos, resAnioAct, resAnioAnt] = await Promise.all([
                axiosInstance.get('cobranza/stats/'),
                axiosInstance.get('cobranza/pagos/lista/', {
                    params: { fecha_desde: fechaDesde, fecha_hasta: fechaHasta, page_size: 1000 },
                }),
                axiosInstance.get('cobranza/pagos/lista/', {
                    params: { fecha_desde: anioEscolarActualDesde, fecha_hasta: anioEscolarActualHasta, page_size: 2000 },
                }),
                axiosInstance.get('cobranza/pagos/lista/', {
                    params: { fecha_desde: anioEscolarAntDesde, fecha_hasta: anioEscolarAntHasta, page_size: 2000 },
                }),
            ]);

            setBiStats(resStats.data);
            setBiPagos(resPagos.data?.results || resPagos.data || []);
            setBiPagosAnt({
                actual:   resAnioAct.data?.results || resAnioAct.data || [],
                anterior: resAnioAnt.data?.results || resAnioAnt.data || [],
            });
        } catch (err) {
            toast.warning(getErrorMessage(err, 'No se pudieron cargar los datos de Business Intelligence.'));
        } finally {
            setLoadingBI(false);
        }
    }, []);

    useEffect(() => { fetchBI(biAnioFiltro); }, [fetchBI, biAnioFiltro]);

    return (
        <section>
            <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h2 className="text-lg font-medium flex items-center gap-2" style={{ color: 'var(--jet)' }}>
                        <BarChart2 size={20} style={{ color: 'var(--pb)' }} />
                        Business Intelligence
                    </h2>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
                        Proyecciones, morosidad histórica y comparativa de períodos.
                    </p>
                </div>
                {loadingBI && <span className="text-xs" style={{ color: 'var(--ash)' }}>Cargando…</span>}
            </div>

            {/* ── BI 1: Proyección de ingresos mensuales ── */}
            <div className="rounded-xl overflow-hidden mb-6" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                <div className="px-5 py-3.5 flex items-center gap-3" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                    <div className="p-1.5 rounded-lg" style={{ background: '#dcfce7' }}>
                        <Target size={15} style={{ color: '#16a34a' }} />
                    </div>
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Proyección de Ingresos — Mes Actual</h3>
                </div>
                <div className="p-5">
                    {loadingBI ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <CardSkeleton /><CardSkeleton /><CardSkeleton />
                        </div>
                    ) : (() => {
                        const cobradoMes = sumPagos(biPagos);
                        const potencial = biStats?.ingreso_potencial_mensual
                            || biStats?.total_mensualidades_mes
                            || 0;
                        const porCobrar = Math.max(0, potencial - cobradoMes);
                        const pct = potencial > 0 ? Math.min(100, (cobradoMes / potencial) * 100) : 0;

                        // Top 5 deudores del mes
                        const deudoresMes = (biStats?.grados || [])
                            .flatMap(g => (g.top_deudores || []))
                            .sort((a, b) => parseFloat(b.deuda_usd || 0) - parseFloat(a.deuda_usd || 0))
                            .slice(0, 5);

                        return (
                            <div className="space-y-5">
                                {/* Cards métricas */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="rounded-xl p-4" style={{ border: '0.5px solid var(--border-md)', background: '#fff' }}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="p-1.5 rounded-lg" style={{ background: 'var(--pb-light)' }}>
                                                <DollarSign size={14} style={{ color: 'var(--pb)' }} />
                                            </div>
                                            <span className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Ingreso potencial</span>
                                        </div>
                                        <p className="text-2xl font-bold font-mono" style={{ color: 'var(--pb)' }}>${fmt(potencial)}</p>
                                        <p className="text-[11px] mt-1" style={{ color: 'var(--ash)' }}>si todos los alumnos pagaran</p>
                                    </div>
                                    <div className="rounded-xl p-4" style={{ border: '0.5px solid var(--border-md)', background: '#fff' }}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="p-1.5 rounded-lg" style={{ background: '#dcfce7' }}>
                                                <TrendingUp size={14} style={{ color: '#16a34a' }} />
                                            </div>
                                            <span className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Cobrado hasta hoy</span>
                                        </div>
                                        <p className="text-2xl font-bold font-mono" style={{ color: '#16a34a' }}>${fmt(cobradoMes)}</p>
                                        <p className="text-[11px] mt-1" style={{ color: 'var(--ash)' }}>{biPagos.length} pagos registrados</p>
                                    </div>
                                    <div className="rounded-xl p-4" style={{ border: '0.5px solid var(--border-md)', background: '#fff' }}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="p-1.5 rounded-lg" style={{ background: '#fef9c3' }}>
                                                <TrendingDown size={14} style={{ color: '#ca8a04' }} />
                                            </div>
                                            <span className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Por cobrar</span>
                                        </div>
                                        <p className="text-2xl font-bold font-mono" style={{ color: porCobrar > 0 ? '#ca8a04' : '#16a34a' }}>${fmt(porCobrar)}</p>
                                        <p className="text-[11px] mt-1" style={{ color: 'var(--ash)' }}>estimado pendiente</p>
                                    </div>
                                </div>

                                {/* Barra de progreso */}
                                <div>
                                    <div className="flex justify-between items-center mb-1.5">
                                        <span className="text-xs font-medium" style={{ color: 'var(--jet)' }}>Progreso de recaudación</span>
                                        <span className="text-xs font-bold font-mono" style={{ color: 'var(--pb)' }}>{pct.toFixed(1)}%</span>
                                    </div>
                                    <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--ash-light)' }}>
                                        <div className="h-full rounded-full transition-all duration-700"
                                            style={{
                                                width: `${pct}%`,
                                                background: pct >= 80 ? '#16a34a' : pct >= 50 ? 'var(--pb)' : '#ca8a04',
                                            }} />
                                    </div>
                                </div>

                                {/* Top deudores */}
                                {deudoresMes.length > 0 && (
                                    <div>
                                        <p className="text-[11px] uppercase tracking-widest mb-2 font-medium" style={{ color: 'var(--pb)' }}>Top 5 deudores del mes</p>
                                        <div className="space-y-1.5">
                                            {deudoresMes.map((d, i) => (
                                                <div key={d.alumno_id || d.alumno || i} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'var(--bg)', border: '0.5px solid var(--border)' }}>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold w-4 text-center" style={{ color: 'var(--ash)' }}>{i + 1}</span>
                                                        <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{d.nombre || d.alumno || '—'}</span>
                                                    </div>
                                                    <span className="text-sm font-bold font-mono" style={{ color: 'var(--red)' }}>
                                                        ${fmt(d.deuda_usd || d.deuda || 0)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>
            </div>

            {/* ── BI 2: Tasa de morosidad por grado ── */}
            <div className="rounded-xl overflow-hidden mb-6" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                <div className="px-5 py-3.5 flex items-center gap-3" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                    <div className="p-1.5 rounded-lg" style={{ background: 'var(--red-light)' }}>
                        <TrendingDown size={15} style={{ color: 'var(--red)' }} />
                    </div>
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Tasa de Morosidad por Grado</h3>
                    <div className="ml-auto flex items-center gap-2">
                        <span className="text-[11px]" style={{ color: 'var(--ash)' }}>Año:</span>
                        <select
                            value={biAnioFiltro}
                            onChange={e => setBiAnioFiltro(parseInt(e.target.value))}
                            className="px-2.5 py-1 rounded-lg text-xs outline-none"
                            style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}>
                            {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="p-5">
                    {loadingBI ? (
                        <div className="space-y-3">
                            <CardSkeleton /><CardSkeleton /><CardSkeleton />
                        </div>
                    ) : (biStats?.grados || []).filter(g => g.total_alumnos > 0).length === 0 ? (
                        <div className="flex flex-col items-center py-10" style={{ color: 'var(--ash)' }}>
                            <TrendingDown size={30} className="mb-2 opacity-20" />
                            <p className="text-sm">Sin alumnos activos registrados por grado.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {(biStats?.grados || [])
                                .filter(g => g.total_alumnos > 0)
                                .sort((a, b) => (b.morosos / b.total_alumnos) - (a.morosos / a.total_alumnos))
                                .map((g, idx) => {
                                    const pct = Math.min(100, (g.morosos / g.total_alumnos) * 100);
                                    const color = pct > 20 ? 'var(--red)' : pct > 10 ? '#ca8a04' : '#16a34a';
                                    const bg    = pct > 20 ? 'var(--red-light)' : pct > 10 ? '#fef9c3' : '#dcfce7';
                                    return (
                                        <div key={g.grado || g.nombre || idx} className="p-3 rounded-xl" style={{ border: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{g.grado}</span>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xs" style={{ color: 'var(--ash)' }}>{g.morosos}/{g.total_alumnos} morosos</span>
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase" style={{ background: bg, color }}>
                                                        {pct.toFixed(1)}%
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--ash-light)' }}>
                                                <div className="h-full rounded-full transition-all duration-500"
                                                    style={{ width: `${pct}%`, background: color }} />
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    )}
                </div>
            </div>

            {/* ── BI 3: Comparativa de períodos escolares ── */}
            <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                <div className="px-5 py-3.5 flex items-center gap-3" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                    <div className="p-1.5 rounded-lg" style={{ background: 'var(--pb-light)' }}>
                        <BarChart2 size={15} style={{ color: 'var(--pb)' }} />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Comparativa de Períodos Escolares</h3>
                        <p className="text-[11px]" style={{ color: 'var(--ash)' }}>
                            {biAnioFiltro - 1}-{biAnioFiltro} vs {biAnioFiltro}-{biAnioFiltro + 1}
                        </p>
                    </div>
                </div>
                <div className="p-5">
                    {loadingBI ? (
                        <div className="space-y-2">
                            <CardSkeleton /><CardSkeleton />
                        </div>
                    ) : (() => {
                        const actArr = biPagosAnt?.actual || [];
                        const antArr = biPagosAnt?.anterior || [];

                        const cobradoAct = sumPagos(actArr);
                        const cobradoAnt = sumPagos(antArr);
                        const alumnosAct = countUniqAlumnos(actArr);
                        const alumnosAnt = countUniqAlumnos(antArr);

                        // Morosidad aproximada (morosos en stats / total alumnos activos)
                        const totalAlumnos = (biStats?.grados || []).reduce((s, g) => s + (g.total_alumnos || 0), 0);
                        const totalMorosos = (biStats?.grados || []).reduce((s, g) => s + (g.morosos || 0), 0);
                        const morosidadAct = totalAlumnos > 0 ? (totalMorosos / totalAlumnos) * 100 : 0;

                        const mesActual = mesConMayorRecaudacion(actArr);
                        const mesAnterior = mesConMayorRecaudacion(antArr);

                        const diff = (a, b) => b === 0 ? null : ((a - b) / b) * 100;

                        const rows = [
                            {
                                label: 'Total cobrado (USD)',
                                act: `$${fmt(cobradoAct)}`,
                                ant: `$${fmt(cobradoAnt)}`,
                                trend: diff(cobradoAct, cobradoAnt),
                            },
                            {
                                label: 'Alumnos únicos con pago',
                                act: alumnosAct.toLocaleString(),
                                ant: alumnosAnt.toLocaleString(),
                                trend: diff(alumnosAct, alumnosAnt),
                            },
                            {
                                label: 'Tasa de morosidad (actual)',
                                act: `${morosidadAct.toFixed(1)}%`,
                                ant: '—',
                                trend: null,
                            },
                            {
                                label: 'Mes con mayor recaudación',
                                act: mesActual,
                                ant: mesAnterior,
                                trend: null,
                            },
                        ];

                        return (
                            <div className="overflow-x-auto rounded-xl" style={{ border: '0.5px solid var(--border-md)' }}>
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr style={{ background: 'var(--bg)', borderBottom: '0.5px solid var(--border-md)' }}>
                                            <th className="text-left px-4 py-3 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>
                                                Métrica
                                            </th>
                                            <th className="text-center px-4 py-3 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>
                                                {biAnioFiltro - 1}-{biAnioFiltro}
                                            </th>
                                            <th className="text-center px-4 py-3 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>
                                                {biAnioFiltro}-{biAnioFiltro + 1}
                                            </th>
                                            <th className="text-center px-4 py-3 text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>
                                                Variación
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((row, idx) => (
                                            <tr key={row.label} style={{
                                                background: idx % 2 === 0 ? '#fff' : 'var(--porcelain)',
                                                borderBottom: '0.5px solid var(--border-md)',
                                            }}>
                                                <td className="px-4 py-3 font-medium" style={{ color: 'var(--jet)' }}>{row.label}</td>
                                                <td className="px-4 py-3 text-center font-mono text-xs" style={{ color: 'var(--ash)' }}>{row.ant}</td>
                                                <td className="px-4 py-3 text-center font-mono text-xs font-semibold" style={{ color: 'var(--jet)' }}>{row.act}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <TrendBadge val={row.trend} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })()}
                </div>
            </div>
        </section>
    );
};

export default BusinessIntelligenceTab;
