import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card } from '../../ui/Card';
import { ETIQUETA_ANTIGUEDAD } from './hoyUtils';

/** Barras: deudas abiertas por antigüedad de la mora. */
export function GraficoMoraAntiguedad({ mora }) {
    const datos = ETIQUETA_ANTIGUEDAD.map(([clave, nombre]) => ({ nombre, deudas: Number(mora?.[clave]) || 0 }));
    const hayDatos = datos.some(d => d.deudas > 0);
    return (
        <Card titulo="Mora por antigüedad">
            {!hayDatos ? (
                <p className="text-sm text-center py-8" style={{ color: 'var(--ash)' }}>No hay deudas abiertas.</p>
            ) : (
                <div className="w-full h-[220px]">
                    <ResponsiveContainer>
                        <BarChart data={datos} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-md)" vertical={false} />
                            <XAxis dataKey="nombre" tick={{ fontSize: 11 }} interval={0} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                            <Tooltip formatter={(v) => [v, 'Deudas']} />
                            <Bar dataKey="deudas" fill="var(--pb)" radius={[6, 6, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </Card>
    );
}

export default GraficoMoraAntiguedad;
