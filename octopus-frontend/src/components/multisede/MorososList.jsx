import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fmt } from '../../utils/format';

const Skeleton = () => (
  <div className="space-y-2">
    {[1, 2, 3].map(i => (
      <div key={i} className="h-3 rounded animate-pulse" style={{ background: 'var(--border-md)' }} />
    ))}
  </div>
);

const MorososList = ({ morosos, loading }) => {
  const navigate = useNavigate();

  if (loading) return <Skeleton />;

  if (morosos.length === 0) {
    return <p className="text-xs" style={{ color: 'var(--ash)' }}>Sin morosos</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="space-y-1.5">
        {morosos.map(m => {
          const nombre = [m.nombre, m.apellido].filter(Boolean).join(' ') || '—';
          const key    = m.cedula ?? nombre;
          return (
            <li key={key} className="flex items-center justify-between gap-2">
              <span className="text-xs truncate" title={nombre} style={{ color: 'var(--jet)' }}>
                {nombre}
              </span>
              <div className="flex items-center gap-2 flex-shrink-0">
                {m.deuda_usd != null && (
                  <span className="text-[10px] font-semibold" style={{ color: 'var(--red)' }}>
                    ${fmt(m.deuda_usd, 2)}
                  </span>
                )}
                <span className="text-[10px]" style={{ color: 'var(--ash)' }}>
                  {m.grado_seccion || '—'}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <button
        onClick={() => navigate('/morosos')}
        className="flex items-center gap-1 self-end text-[11px] transition-colors"
        style={{ color: 'var(--pb)' }}
      >
        Ver todos en cobranza
        <ArrowRight size={11} />
      </button>
    </div>
  );
};

export default MorososList;
