import { useState, useEffect, useCallback } from 'react';
import { Clock, AlertTriangle, CheckCircle2, ChevronsRight } from 'lucide-react';
import { toast } from 'react-toastify';
import axiosInstance from '../../api/apiClient';
import DatePickerES from '../DatePickerES';
import { CardSkeleton } from '../shared/Skeleton';
import { getErrorMessage, today, MONTH_NAMES, CURRENT_YEAR } from '../../constants/reportes';
import { Card } from '../ui/Card';

const PuntualidadTab = () => {
    const [puntualidad, setPuntualidad] = useState({ total: 0, atrasado: 0, a_tiempo: 0, adelantado: 0 });
    const [loadingPuntualidad, setLoadingPuntualidad] = useState(true);
    const [puntGranularidad, setPuntGranularidad] = useState('anio');
    const [puntAnio, setPuntAnio] = useState(() => new Date().getFullYear());
    const [puntMes, setPuntMes] = useState(() => new Date().getMonth() + 1);
    const [puntFecha, setPuntFecha] = useState(today);

    const fetchPuntualidad = useCallback(async (granularidad, anio, mes, fecha) => {
        setLoadingPuntualidad(true);
        try {
            const params = { granularidad };
            if (granularidad === 'dia')       params.fecha = fecha;
            else if (granularidad === 'mes')  { params.anio = anio; params.mes = mes; }
            else                              params.anio = anio;
            const res = await axiosInstance.get('cobranza/mensualidades/puntualidad/', { params });
            setPuntualidad(res.data);
        } catch (err) {
            toast.warning(getErrorMessage(err, 'No se pudo cargar el reporte de puntualidad.'));
        } finally {
            setLoadingPuntualidad(false);
        }
    }, []);

    useEffect(() => {
        fetchPuntualidad(puntGranularidad, puntAnio, puntMes, puntFecha);
    }, [fetchPuntualidad, puntGranularidad, puntAnio, puntMes, puntFecha]);

    const { total, atrasado, a_tiempo, adelantado } = puntualidad;
    const pct = (v) => total > 0 ? ((v / total) * 100).toFixed(1) : '0.0';

    const periodoLabel = puntGranularidad === 'dia'
        ? `el ${new Date(puntFecha + 'T12:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' })}`
        : puntGranularidad === 'mes'
        ? `${MONTH_NAMES[puntMes - 1]} ${puntAnio}`
        : String(puntAnio);

    const cards = [
        {
            label:    'Atrasados',
            desc:     'Pagaron después del mes que corresponde',
            value:    atrasado,
            icon:     <AlertTriangle size={20} />,
            color:    'var(--red)',
            bg:       'var(--red-light)',
            barColor: '#ef4444',
        },
        {
            label:    'A tiempo',
            desc:     'Pagaron durante el mismo mes',
            value:    a_tiempo,
            icon:     <CheckCircle2 size={20} />,
            color:    '#16a34a',
            bg:       '#dcfce7',
            barColor: '#16a34a',
        },
        {
            label:    'Adelantados',
            desc:     'Pagaron antes del mes que corresponde',
            value:    adelantado,
            icon:     <ChevronsRight size={20} />,
            color:    'var(--pb)',
            bg:       'var(--pb-light)',
            barColor: 'var(--pb)',
        },
    ];

    return (
        <section>
            <div className="mb-5 flex items-start justify-between flex-wrap gap-4">
                <div>
                    <h2 className="text-lg font-medium flex items-center gap-2" style={{ color: 'var(--jet)' }}>
                        <Clock size={20} style={{ color: 'var(--pb)' }} />
                        Puntualidad de Mensualidades
                    </h2>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
                        Clasificación de pagos: atrasados, a tiempo y adelantados · viendo {periodoLabel}.
                    </p>
                </div>

                {/* Controles de filtro */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* Selector de granularidad */}
                    <div className="flex rounded-lg overflow-hidden" style={{ border: '0.5px solid var(--border-md)' }}>
                        {[
                            { val: 'dia',  label: 'Día' },
                            { val: 'mes',  label: 'Mes' },
                            { val: 'anio', label: 'Año' },
                        ].map(({ val, label }) => (
                            <button
                                key={val}
                                onClick={() => setPuntGranularidad(val)}
                                className="px-3 py-1.5 text-xs font-medium transition-all"
                                style={{
                                    background: puntGranularidad === val ? 'var(--pb)' : '#fff',
                                    color:      puntGranularidad === val ? '#fff'       : 'var(--ash)',
                                }}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Picker condicional */}
                    {puntGranularidad === 'dia' && (
                        <DatePickerES
                            value={puntFecha}
                            onChange={e => setPuntFecha(e.target.value)}
                            className="px-2.5 py-1.5 rounded-lg text-xs outline-none"
                            style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                        />
                    )}

                    {puntGranularidad === 'mes' && (
                        <>
                            <select
                                value={puntMes}
                                onChange={e => setPuntMes(parseInt(e.target.value))}
                                className="px-2.5 py-1.5 rounded-lg text-xs outline-none"
                                style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}>
                                {MONTH_NAMES.map((m, i) => (
                                    <option key={i} value={i + 1}>{m}</option>
                                ))}
                            </select>
                            <select
                                value={puntAnio}
                                onChange={e => setPuntAnio(parseInt(e.target.value))}
                                className="px-2.5 py-1.5 rounded-lg text-xs outline-none"
                                style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}>
                                {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        </>
                    )}

                    {puntGranularidad === 'anio' && (
                        <select
                            value={puntAnio}
                            onChange={e => setPuntAnio(parseInt(e.target.value))}
                            className="px-2.5 py-1.5 rounded-lg text-xs outline-none"
                            style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}>
                            {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            {loadingPuntualidad ? (
                <div className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <CardSkeleton /><CardSkeleton /><CardSkeleton />
                    </div>
                </div>
            ) : (
                <div className="space-y-5">
                    {/* Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {cards.map((c) => (
                            <Card key={c.label}>
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 rounded-lg" style={{ background: c.bg, color: c.color }}>
                                        {c.icon}
                                    </div>
                                    <div>
                                        <p className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>{c.label}</p>
                                        <p className="text-[10px]" style={{ color: 'var(--ash)' }}>{c.desc}</p>
                                    </div>
                                </div>
                                <p className="text-3xl font-bold font-mono" style={{ color: c.color }}>
                                    {c.value.toLocaleString()}
                                </p>
                                <div className="mt-3">
                                    <div className="flex justify-between mb-1">
                                        <span className="text-[10px]" style={{ color: 'var(--ash)' }}>del total</span>
                                        <span className="text-[10px] font-bold font-mono" style={{ color: c.color }}>{pct(c.value)}%</span>
                                    </div>
                                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--ash-light)' }}>
                                        <div className="h-full rounded-full transition-all duration-700"
                                            style={{ width: `${pct(c.value)}%`, background: c.barColor }} />
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>

                    {/* Barra proporcional apilada */}
                    {total > 0 && (
                        <Card>
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                    Distribución total — {total.toLocaleString()} mensualidades en {periodoLabel}
                                </span>
                            </div>
                            <div className="h-5 rounded-full overflow-hidden flex" style={{ background: 'var(--ash-light)' }}>
                                {atrasado > 0 && (
                                    <div title={`Atrasadas: ${atrasado}`}
                                        className="h-full transition-all duration-700"
                                        style={{ width: `${pct(atrasado)}%`, background: '#ef4444' }} />
                                )}
                                {a_tiempo > 0 && (
                                    <div title={`A tiempo: ${a_tiempo}`}
                                        className="h-full transition-all duration-700"
                                        style={{ width: `${pct(a_tiempo)}%`, background: '#16a34a' }} />
                                )}
                                {adelantado > 0 && (
                                    <div title={`Adelantadas: ${adelantado}`}
                                        className="h-full transition-all duration-700"
                                        style={{ width: `${pct(adelantado)}%`, background: 'var(--pb)' }} />
                                )}
                            </div>
                            <div className="flex flex-wrap gap-4 mt-3">
                                {[
                                    { label: 'Atrasadas',   color: '#ef4444',    val: atrasado },
                                    { label: 'A tiempo',    color: '#16a34a',    val: a_tiempo },
                                    { label: 'Adelantadas', color: 'var(--pb)',  val: adelantado },
                                ].map(l => (
                                    <div key={l.label} className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: l.color }} />
                                        <span className="text-xs" style={{ color: 'var(--ash)' }}>
                                            {l.label}: <strong style={{ color: 'var(--jet)' }}>{l.val.toLocaleString()}</strong>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}

                    {total === 0 && (
                        <Card className="flex flex-col items-center py-10">
                            <Clock size={32} className="mb-2 opacity-20" style={{ color: 'var(--pb)' }} />
                            <p className="text-sm" style={{ color: 'var(--ash)' }}>
                                Sin mensualidades pagadas registradas para {periodoLabel}.
                            </p>
                        </Card>
                    )}
                </div>
            )}
        </section>
    );
};

export default PuntualidadTab;
