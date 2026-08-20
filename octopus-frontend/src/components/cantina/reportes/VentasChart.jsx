import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale/es';

// Gráfico de ventas por día del rango seleccionado (§6/§7.4 cantina.md,
// FASE 7). Espera `porDia`: [{ fecha: 'YYYY-MM-DD', total_usd }, ...]
// (= `ventas_por_dia` de ReporteVentasView, ver contrato en api/cantina.service.js).
export default function VentasChart({ porDia = [] }) {
  const data = (porDia || []).map(d => ({
    ...d,
    fechaLabel: (() => {
      try { return format(parseISO(d.fecha), 'dd/MM', { locale: es }); }
      catch { return d.fecha; }
    })(),
    total_usd: Number(d.total_usd ?? 0),
  }));

  if (!data.length) {
    return (
      <div className="rounded-xl p-8 text-center text-sm" style={{ background: 'var(--porcelain)', color: 'var(--ash)' }}>
        No hay ventas registradas en el rango seleccionado.
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis dataKey="fechaLabel" tick={{ fontSize: 11, fill: '#6b7280' }} />
          <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={(v) => `$${v}`} />
          <Tooltip
            formatter={(v, name) => name === 'total_usd' ? [`$${Number(v).toFixed(2)}`, 'Total'] : [v, 'Ventas']}
            labelFormatter={(label) => `Día ${label}`}
          />
          <Bar dataKey="total_usd" radius={[6, 6, 0, 0]} fill="var(--pb, #0fa3b1)" barSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
