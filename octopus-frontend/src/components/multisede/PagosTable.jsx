import { fmt, fmtFecha } from '../../utils/format';
import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const ESTADO_STYLE = {
  pagado:    { bg: 'var(--green-light)',  color: 'var(--green)' },
  pendiente: { bg: 'var(--yellow-light)', color: 'var(--yellow)' },
  rechazado: { bg: 'var(--red-light)',    color: 'var(--red)' },
  anulado:   { bg: 'var(--red-light)',    color: 'var(--red)' },
};
const ESTADO_DEFAULT = { bg: 'var(--pb-light)', color: 'var(--pb-mid)' };

const Badge = ({ texto, tipo }) => {
  const style = ESTADO_STYLE[tipo?.toLowerCase()] ?? ESTADO_DEFAULT;
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap"
      style={{ background: style.bg, color: style.color }}
    >
      {texto || '—'}
    </span>
  );
};

const Skeleton = () => (
  <div className="space-y-2">
    {[1, 2, 3, 4, 5].map(i => (
      <div key={i} className="h-4 rounded animate-pulse" style={{ background: 'var(--border-md)' }} />
    ))}
  </div>
);

const Tabla = ({ pagos, tieneEstado }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-xs">
      <thead>
        <tr style={{ borderBottom: '0.5px solid var(--border-md)' }}>
          {['Fecha', 'Alumno', 'Monto USD', 'Método', ...(tieneEstado ? ['Estado'] : [])].map(h => (
            <th
              key={h}
              className="text-left pb-2 pr-3 font-medium uppercase tracking-wide"
              style={{ color: 'var(--ash)' }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {pagos.map(p => (
          <tr key={p.id ?? `${p.fecha_pago}-${p.alumno}`} style={{ borderBottom: '0.5px solid var(--border)' }}>
            <td className="py-2 pr-3" style={{ color: 'var(--jet)' }}>{fmtFecha(p.fecha_pago)}</td>
            <td className="py-2 pr-3 truncate max-w-[120px]" title={p.alumno} style={{ color: 'var(--jet)' }}>
              {p.alumno || '—'}
            </td>
            <td className="py-2 pr-3 font-medium" style={{ color: 'var(--green)' }}>
              ${fmt(p.monto_usd, 2)}
            </td>
            <td className="py-2 pr-3">
              <Badge texto={p.metodo_pago} />
            </td>
            {tieneEstado && (
              <td className="py-2">
                <Badge texto={p.estado} tipo={p.estado} />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const Cards = ({ pagos, tieneEstado }) => (
  <ul className="space-y-2">
    {pagos.map(p => (
      <li
        key={p.id ?? `${p.fecha_pago}-${p.alumno}`}
        className="rounded-lg p-3"
        style={{ background: 'var(--bg)', border: '0.5px solid var(--border)' }}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium truncate" title={p.alumno} style={{ color: 'var(--jet)' }}>
            {p.alumno || '—'}
          </span>
          <span className="text-xs font-bold flex-shrink-0" style={{ color: 'var(--green)' }}>
            ${fmt(p.monto_usd, 2)}
          </span>
        </div>
        <div className="flex items-center justify-between mt-1.5 gap-2 flex-wrap">
          <span className="text-[11px]" style={{ color: 'var(--ash)' }}>{fmtFecha(p.fecha_pago)}</span>
          <div className="flex items-center gap-1.5">
            <Badge texto={p.metodo_pago} />
            {tieneEstado && p.estado && <Badge texto={p.estado} tipo={p.estado} />}
          </div>
        </div>
      </li>
    ))}
  </ul>
);

const PagosTable = ({ pagos, loading }) => {
  const navigate    = useNavigate();
  const tieneEstado = pagos.some(p => p.estado != null);

  if (loading) return <Skeleton />;

  if (pagos.length === 0) {
    return (
      <p className="text-sm text-center py-6" style={{ color: 'var(--ash)' }}>
        Sin pagos registrados
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="hidden sm:block"><Tabla pagos={pagos} tieneEstado={tieneEstado} /></div>
      <div className="sm:hidden"><Cards pagos={pagos} tieneEstado={tieneEstado} /></div>
      <button
        onClick={() => navigate('/cobranza')}
        className="flex items-center gap-1 self-end text-[11px] transition-colors"
        style={{ color: 'var(--pb)' }}
      >
        Ver todos los pagos
        <ArrowRight size={11} />
      </button>
    </div>
  );
};

export default PagosTable;
