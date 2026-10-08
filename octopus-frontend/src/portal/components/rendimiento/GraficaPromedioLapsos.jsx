import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';

const UMBRAL = 10;

const GraficaPromedioLapsos = ({ porLapso = [] }) => {
  const data = porLapso.map(l => ({ lapso: l.lapso, promedio: l.promedio_general }));
  const hayDatos = data.some(d => d.promedio !== null && d.promedio !== undefined);

  if (!hayDatos) {
    return (
      <div className="rounded-xl p-8 text-center text-sm" style={{ background: 'var(--surface-sunken)', color: 'var(--ash)' }}>
        Las notas estarán disponibles cuando el docente las cargue.
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: 220 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-md)" />
          <XAxis dataKey="lapso" tick={{ fontSize: 12, fill: 'var(--ash)' }} />
          <YAxis domain={[0, 20]} tick={{ fontSize: 12, fill: 'var(--ash)' }} />
          <Tooltip formatter={(v) => [v ?? 'Sin datos', 'Promedio']} />
          <ReferenceLine y={UMBRAL} stroke="var(--red)" strokeDasharray="4 4" label={{ value: 'Mínimo', position: 'insideTopRight', fontSize: 12, fill: 'var(--red)' }} />
          <Line
            type="monotone"
            dataKey="promedio"
            stroke="var(--portal-primary)"
            strokeWidth={2.5}
            dot={{ r: 4, fill: 'var(--portal-primary)' }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default GraficaPromedioLapsos;
