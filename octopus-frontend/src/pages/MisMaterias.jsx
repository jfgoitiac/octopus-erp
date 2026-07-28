import { useNavigate } from 'react-router-dom';
import { BookOpen, GraduationCap, ChevronRight } from 'lucide-react';
import { useMisMaterias } from '../hooks/useMisMaterias';

const SkeletonCard = () => (
  <div className="rounded-xl p-4" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
    <div className="h-4 w-2/3 rounded animate-pulse mb-2" style={{ background: 'var(--border-md)' }} />
    <div className="h-3 w-1/3 rounded animate-pulse" style={{ background: 'var(--border-md)' }} />
  </div>
);

const MisMaterias = () => {
  const navigate = useNavigate();
  const { materias, loading } = useMisMaterias();

  return (
    <div className="animate-fadeIn">
      <div className="mb-6">
        <h2 className="text-lg font-medium flex items-center gap-2" style={{ color: 'var(--jet)' }}>
          <BookOpen size={20} style={{ color: 'var(--pb)' }} />
          Mis Materias
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>
          Notas y material de estudio de tus materias asignadas
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : materias.length === 0 ? (
        <div
          className="rounded-xl p-16 text-center"
          style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}
        >
          <GraduationCap size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Todavía no tienes materias asignadas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {materias.map(m => (
            <button
              key={m.id}
              onClick={() => navigate(`/mis-materias/${m.id}`)}
              className="text-left rounded-xl p-4 flex items-center justify-between gap-3 transition-colors min-h-[44px]"
              style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--jet)' }}>{m.nombre}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>{m.grado_seccion}</p>
              </div>
              <ChevronRight size={18} style={{ color: 'var(--ash)' }} className="flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default MisMaterias;
