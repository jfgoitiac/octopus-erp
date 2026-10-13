import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fmt } from '../../utils/format';

const ESTADOS_PAGO = [
    { clave: 'pagados', label: 'Al día', color: 'var(--green)' },
    { clave: 'parciales', label: 'Abono parcial', color: 'var(--yellow)' },
    { clave: 'pendientes', label: 'Con deuda', color: 'var(--red)' },
];

const porcentaje = (n, total) => (total ? Math.round((n / total) * 100) : 0);

export function DonutEstadoPagos({ resumen }) {
    const total = resumen.total_filas;
    const datos = ESTADOS_PAGO.map(e => ({ ...e, valor: resumen[e.clave] }));
    return (
        <div className="flex flex-col items-center gap-4">
            <div className="relative w-40 h-40 shrink-0">
                <ResponsiveContainer>
                    <PieChart>
                        <Pie data={total ? datos : [{ valor: 1 }]} dataKey="valor" innerRadius="70%" outerRadius="100%"
                            paddingAngle={total ? 2 : 0} stroke="none" startAngle={90} endAngle={-270} isAnimationActive={false}>
                            {total
                                ? datos.map(d => <Cell key={d.clave} fill={d.color} />)
                                : <Cell fill="var(--ash-light)" />}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-bold" style={{ color: 'var(--jet)' }}>{porcentaje(resumen.pagados, total)}%</span>
                    <span className="text-[11px]" style={{ color: 'var(--ash)' }}>al día</span>
                </div>
            </div>
            <ul className="w-full space-y-2.5">
                {datos.map(d => (
                    <li key={d.clave} className="flex items-center gap-2 text-sm">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                        <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--jet-mid)' }}>{d.label}</span>
                        <span className="font-semibold tabular-nums" style={{ color: 'var(--jet)' }}>{d.valor}</span>
                        <span className="w-10 text-right text-xs tabular-nums" style={{ color: 'var(--ash)' }}>
                            {porcentaje(d.valor, total)}%
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

const TooltipPendientes = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const l = payload[0].payload;
    return (
        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--jet)', color: '#fff', boxShadow: 'var(--shadow-md)' }}>
            <p className="font-semibold">{l.etiqueta}</p>
            <p>{l.pendientes + l.parciales} mensualidades sin cubrir</p>
            <p>${fmt(l.monto_pendiente_usd, 2)} pendiente</p>
        </div>
    );
};

export function BarrasPendientes({ lineas, seleccionada }) {
    const datos = lineas.map(l => ({ ...l, corto: l.etiqueta.slice(0, 3), sinCubrir: l.pendientes + l.parciales }));
    return (
        <div className="w-full h-48">
            <ResponsiveContainer>
                <BarChart data={datos} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="corto" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--ash)' }} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--ash)' }} />
                    <Tooltip content={<TooltipPendientes />} cursor={{ fill: 'var(--pb-light)' }} />
                    <Bar dataKey="sinCubrir" radius={[6, 6, 0, 0]} maxBarSize={28} isAnimationActive={false}>
                        {datos.map(d => (
                            <Cell key={d.etiqueta}
                                fill={d.etiqueta === seleccionada ? 'var(--pb)' : 'color-mix(in srgb, var(--pb) 35%, transparent)'} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
