import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts';

const IndicadorAsistencia = ({ asistencia }) => {
  const { total_clases: total, presentes, porcentaje } = asistencia || {};

  if (!total) {
    return (
      <div className="rounded-xl p-6 text-center text-sm" style={{ background: '#f9fafb', color: '#9ca3af' }}>
        Aún no hay registros de asistencia.
      </div>
    );
  }

  const bajoUmbral = porcentaje < 85;
  const color = bajoUmbral ? '#ef4444' : '#0fa3b1';
  const data = [{ name: 'asistencia', value: porcentaje, fill: color }];

  return (
    <div className="flex items-center gap-4">
      <div style={{ width: 96, height: 96 }} className="relative flex-shrink-0">
        <ResponsiveContainer>
          <RadialBarChart
            innerRadius="70%"
            outerRadius="100%"
            data={data}
            startAngle={90}
            endAngle={90 - 360 * (porcentaje / 100)}
            barSize={10}
          >
            <RadialBar dataKey="value" background={{ fill: '#f3f4f6' }} cornerRadius={8} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold" style={{ color }}>{porcentaje}%</span>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium" style={{ color: bajoUmbral ? '#ef4444' : '#374151' }}>
          {presentes} de {total} clases
        </p>
        <p className="text-xs text-gray-400">Asistencia acumulada</p>
      </div>
    </div>
  );
};

export default IndicadorAsistencia;
