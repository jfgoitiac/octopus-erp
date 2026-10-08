import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine, ResponsiveContainer, LabelList } from 'recharts';
import { AlertTriangle } from 'lucide-react';

const UMBRAL = 10;

const GraficaPorMateria = ({ porMateria = [] }) => {
  const data = porMateria.filter(m => m.promedio !== null && m.promedio !== undefined);

  if (!data.length) {
    return (
      <div className="rounded-xl p-8 text-center text-sm" style={{ background: 'var(--surface-sunken)', color: 'var(--ash)' }}>
        Las notas estarán disponibles cuando el docente las cargue.
      </div>
    );
  }

  const altura = Math.max(160, data.length * 44);

  return (
    <div>
      <div style={{ width: '100%', height: altura }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-md)" horizontal={false} />
            <XAxis type="number" domain={[0, 20]} tick={{ fontSize: 12, fill: 'var(--ash)' }} />
            <YAxis type="category" dataKey="materia" width={90} tick={{ fontSize: 12, fill: 'var(--jet-mid)' }} />
            <Tooltip formatter={(v) => [v, 'Promedio']} />
            <ReferenceLine x={UMBRAL} stroke="var(--red)" strokeDasharray="4 4" />
            <Bar dataKey="promedio" radius={[0, 6, 6, 0]} barSize={20}>
              <LabelList dataKey="promedio" position="right" style={{ fontSize: 12, fill: 'var(--jet-mid)' }} />
              {data.map((m, i) => (
                <Cell key={i} fill={m.promedio < UMBRAL ? 'var(--red)' : 'var(--portal-primary)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {data.some(m => m.promedio < UMBRAL) && (
        <p className="text-xs mt-2 flex items-center gap-1" style={{ color: 'var(--red)' }}>
          <AlertTriangle size={12} /> Materias por debajo del mínimo aprobatorio
        </p>
      )}
    </div>
  );
};

export default GraficaPorMateria;
