import { iniciales } from './navPortal';

/**
 * EstudianteSelector
 * Props:
 *   alumnos: Array<{ id, nombre, apellido, grado_seccion }>
 *   alumnoActivo: { id, ... } | null
 *   onSelect: (alumno) => void
 *
 * Si hay 1 solo alumno, no renderiza nada (el padre ya lo muestra).
 * Si hay 2+, renderiza fichas con iniciales y scroll horizontal propio.
 */
const EstudianteSelector = ({ alumnos = [], alumnoActivo, onSelect }) => {
  if (!alumnos || alumnos.length <= 1) return null;

  return (
    <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 mt-2 pb-1">
      <div className="flex gap-2 min-w-max" role="group" aria-label="Elegir estudiante">
        {alumnos.map((alumno) => {
          const isActive = alumnoActivo?.id === alumno.id;
          return (
            <button
              key={alumno.id}
              type="button"
              onClick={() => onSelect(alumno)}
              aria-pressed={isActive}
              className={`flex-shrink-0 flex items-center gap-3 rounded-full py-1.5 pl-1.5 pr-5 text-left transition-colors border min-h-[52px] ${
                isActive
                  ? 'bg-[var(--portal-surface)] border-[var(--portal-primary)] shadow-[var(--portal-shadow)]'
                  : 'bg-[var(--portal-surface)]/70 border-[var(--portal-line)] hover:bg-[var(--portal-surface)]'
              }`}
            >
              <span
                className={`portal-avatar h-10 w-10 text-xs ${isActive ? '!bg-[var(--portal-hero)] !text-white' : ''}`}
                aria-hidden="true"
              >
                {iniciales(`${alumno.nombre} ${alumno.apellido}`)}
              </span>
              <span>
                <span className="block text-sm font-semibold leading-tight text-[var(--portal-ink)]">{alumno.nombre} {alumno.apellido}</span>
                <span className="block text-xs text-[var(--portal-muted)]">{alumno.grado_seccion}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default EstudianteSelector;
