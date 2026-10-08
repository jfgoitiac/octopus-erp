import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts';

const IndicadorAsistencia = ({ asistencia }) => {
  const { total_clases: total, presentes, porcentaje } = asistencia || {};

  if (!total) {
    return (
      <div className="rounded-xl p-6 text-center text-sm" style={{ background: 'var(--surface-sunken)', color: 'var(--ash)' }}>
        Aún no hay registros de asistencia.
      </div>
    );
  }

  const bajoUmbral = porcentaje < 85;
  const color = bajoUmbral ? 'var(--red)' : 'var(--portal-primary)';
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
            <RadialBar dataKey="value" background={{ fill: 'var(--surface-sunken)' }} cornerRadius={8} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold" style={{ color }}>{porcentaje}%</span>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium" style={{ color: bajoUmbral ? 'var(--red)' : 'var(--jet-mid)' }}>
          {presentes} de {total} clases
        </p>
        <p className="text-xs text-[var(--ash)]">Asistencia acumulada</p>
      </div>
    </div>
  );
};

export default IndicadorAsistencia;
