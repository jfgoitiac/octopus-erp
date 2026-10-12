import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Card } from '../../ui/Card';
import { usd } from './hoyUtils';

/** Dona: cobrado vs pendiente de la cartera del mes. */
export function GraficoEstadoPagos({ cartera }) {
    const cobrado = Number(cartera?.cobrado_usd) || 0;
    const pendiente = Number(cartera?.pendiente_usd) || 0;
    const datos = [
        { nombre: 'Cobrado', valor: cobrado, color: 'var(--green)' },
        { nombre: 'Pendiente', valor: pendiente, color: 'var(--red)' },
    ];
    const hayDatos = cobrado + pendiente > 0;
    return (
        <Card titulo="Estado de los pagos del mes">
            {!hayDatos ? (
                <p className="text-sm text-center py-8" style={{ color: 'var(--ash)' }}>Aún no hay facturación este mes.</p>
            ) : (
                <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-around">
                    <div className="relative w-full max-w-[220px] h-[200px]">
                        <ResponsiveContainer>
                            <PieChart>
                                <Pie data={datos} dataKey="valor" nameKey="nombre" innerRadius="62%" outerRadius="90%"
                                    paddingAngle={2} stroke="none">
                                    {datos.map(d => <Cell key={d.nombre} fill={d.color} />)}
                                </Pie>
                                <Tooltip formatter={(v) => usd(v)} />
                            </PieChart>
                        </ResponsiveContainer>
                        <p className="absolute inset-0 flex items-center justify-center text-xl font-bold pointer-events-none"
                            style={{ color: 'var(--jet)' }}>{cartera.cobrado_pct ?? 0}%</p>
                    </div>
                    <ul className="text-sm space-y-1.5">
                        {datos.map(d => (
                            <li key={d.nombre} className="flex items-center gap-2">
                                <span className="inline-block size-3 rounded-full" style={{ background: d.color }} aria-hidden="true" />
                                <span style={{ color: 'var(--ash)' }}>{d.nombre}</span>
                                <strong style={{ color: 'var(--jet)' }}>{usd(d.valor)}</strong>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </Card>
    );
}

export default GraficoEstadoPagos;
