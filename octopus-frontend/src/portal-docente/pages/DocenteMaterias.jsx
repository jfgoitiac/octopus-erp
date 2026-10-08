import { Link } from 'react-router-dom';
import { BookOpen, GraduationCap, ChevronRight } from 'lucide-react';
import { useDocenteMisMaterias } from '../hooks/useDocenteMisMaterias';
import SkeletonCard from '../../portal/components/SkeletonCard';

const DocenteMaterias = () => {
  const { materias, loading } = useDocenteMisMaterias();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-[var(--jet)] flex items-center gap-2">
          <BookOpen size={20} className="text-[var(--docente-primary)]" />
          Mis Materias
        </h1>
        <p className="text-xs text-[var(--ash)] mt-0.5">Notas, asistencia y material de estudio</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} lines={1} />)}
        </div>
      ) : materias.length === 0 ? (
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-10 text-center text-[var(--ash)]">
          <GraduationCap size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Todavía no tienes materias asignadas.</p>
        </div>
      ) : (
        <div className="space-y-3 md:grid md:grid-cols-2 xl:grid-cols-3 md:gap-3 md:space-y-0">
          {materias.map(m => (
            <Link
              key={m.id}
              to={`/portal-docente/materias/${m.id}`}
              className="w-full text-left bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 flex items-center justify-between gap-3 min-h-[44px] hover:border-[var(--docente-primary)]/40 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--jet)] truncate">{m.nombre}</p>
                <p className="text-xs text-[var(--ash)] mt-1 truncate">{m.grado_seccion}{m.codigo ? ` · ${m.codigo}` : ''}</p>
              </div>
              <ChevronRight size={18} className="text-[var(--ash)] flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default DocenteMaterias;
