import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine, ResponsiveContainer, LabelList } from 'recharts';
import { AlertTriangle } from 'lucide-react';

const UMBRAL = 10;

const GraficaPorMateria = ({ porMateria = [] }) => {
  const data = porMateria.filter(m => m.promedio !== null && m.promedio !== undefined);

  if (!data.length) {
    return (
      <div className="rounded-xl p-8 text-center text-sm" style={{ background: '#f9fafb', color: '#9ca3af' }}>
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
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
            <XAxis type="number" domain={[0, 20]} tick={{ fontSize: 11, fill: '#6b7280' }} />
            <YAxis type="category" dataKey="materia" width={90} tick={{ fontSize: 11, fill: '#374151' }} />
            <Tooltip formatter={(v) => [v, 'Promedio']} />
            <ReferenceLine x={UMBRAL} stroke="#ef4444" strokeDasharray="4 4" />
            <Bar dataKey="promedio" radius={[0, 6, 6, 0]} barSize={20}>
              <LabelList dataKey="promedio" position="right" style={{ fontSize: 11, fill: '#374151' }} />
              {data.map((m, i) => (
                <Cell key={i} fill={m.promedio < UMBRAL ? '#ef4444' : 'var(--portal-primary, #0fa3b1)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {data.some(m => m.promedio < UMBRAL) && (
        <p className="text-xs mt-2 flex items-center gap-1" style={{ color: '#ef4444' }}>
          <AlertTriangle size={12} /> Materias por debajo del mínimo aprobatorio
        </p>
      )}
    </div>
  );
};

export default GraficaPorMateria;
