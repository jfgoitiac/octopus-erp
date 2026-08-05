import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';

const UMBRAL = 10;

const GraficaPromedioLapsos = ({ porLapso = [] }) => {
  const data = porLapso.map(l => ({ lapso: l.lapso, promedio: l.promedio_general }));
  const hayDatos = data.some(d => d.promedio !== null && d.promedio !== undefined);

  if (!hayDatos) {
    return (
      <div className="rounded-xl p-8 text-center text-sm" style={{ background: '#f9fafb', color: '#9ca3af' }}>
        Las notas estarán disponibles cuando el docente las cargue.
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: 220 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="lapso" tick={{ fontSize: 11, fill: '#6b7280' }} />
          <YAxis domain={[0, 20]} tick={{ fontSize: 11, fill: '#6b7280' }} />
          <Tooltip formatter={(v) => [v ?? 'Sin datos', 'Promedio']} />
          <ReferenceLine y={UMBRAL} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'Mínimo', position: 'insideTopRight', fontSize: 10, fill: '#ef4444' }} />
          <Line
            type="monotone"
            dataKey="promedio"
            stroke="var(--portal-primary, #0fa3b1)"
            strokeWidth={2.5}
            dot={{ r: 4, fill: 'var(--portal-primary, #0fa3b1)' }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default GraficaPromedioLapsos;
