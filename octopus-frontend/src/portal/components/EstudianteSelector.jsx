/**
 * EstudianteSelector
 * Props:
 *   alumnos: Array<{ id, nombre, apellido, grado_seccion }>
 *   alumnoActivo: { id, ... } | null
 *   onSelect: (alumno) => void
 *
 * Si hay 1 solo alumno, no renderiza nada (el padre ya lo muestra).
 * Si hay 2+, renderiza tabs con scroll horizontal.
 */
const EstudianteSelector = ({ alumnos = [], alumnoActivo, onSelect }) => {
  if (!alumnos || alumnos.length <= 1) return null;

  return (
    <div className="overflow-x-auto -mx-4 px-4 mb-4">
      <div className="flex gap-2 min-w-max">
        {alumnos.map((alumno) => {
          const isActive = alumnoActivo?.id === alumno.id;
          return (
            <button
              key={alumno.id}
              onClick={() => onSelect(alumno)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
                isActive
                  ? 'bg-[#0fa3b1] text-white border-[#0fa3b1]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-[#0fa3b1] hover:text-[#0fa3b1]'
              }`}
            >
              <span className="block leading-tight">{alumno.nombre} {alumno.apellido}</span>
              <span className={`block text-xs ${isActive ? 'text-teal-100' : 'text-gray-400'}`}>
                {alumno.grado_seccion}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default EstudianteSelector;
