import { useNavigate } from 'react-router-dom';
import { BookOpen, GraduationCap, ChevronRight } from 'lucide-react';
import { useDocenteMisMaterias } from '../hooks/useDocenteMisMaterias';
import SkeletonCard from '../../portal/components/SkeletonCard';

const DocenteMaterias = () => {
  const navigate = useNavigate();
  const { materias, loading } = useDocenteMisMaterias();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <BookOpen size={20} className="text-[var(--docente-primary)]" />
          Mis Materias
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">Notas, asistencia y material de estudio</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} lines={1} />)}
        </div>
      ) : materias.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400">
          <GraduationCap size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Todavía no tienes materias asignadas.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {materias.map(m => (
            <button
              key={m.id}
              onClick={() => navigate(`/portal-docente/materias/${m.id}`)}
              className="w-full text-left bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between gap-3 min-h-[44px] hover:border-[var(--docente-primary)]/40 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{m.nombre}</p>
                <p className="text-xs text-gray-400 mt-1">{m.grado_seccion}{m.codigo ? ` · ${m.codigo}` : ''}</p>
              </div>
              <ChevronRight size={18} className="text-gray-300 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default DocenteMaterias;
