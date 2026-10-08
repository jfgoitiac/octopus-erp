import { BarChart3, Layers, List } from 'lucide-react';
import { VISTA } from './useVistaAsistencia';

const OPCIONES = [
  { id: VISTA.TARJETAS, label: 'Tarjetas', icon: Layers },
  { id: VISTA.LISTA, label: 'Lista', icon: List },
];
const OPCION_RESUMEN = { id: VISTA.RESUMEN, label: 'Resumen', icon: BarChart3 };

/**
 * Selector segmentado Tarjetas | Lista (| Resumen con `conResumen`). Botones
 * cortos: caben en 360px.
 */
const SelectorVistaAsistencia = ({ vista, onCambiar, conResumen = false }) => {
  const opciones = conResumen ? [...OPCIONES, OPCION_RESUMEN] : OPCIONES;
  return (
    <div
      role="group"
      aria-label="Vista de asistencia"
      className={`inline-grid gap-1 rounded-xl p-1 ${conResumen ? 'grid-cols-3' : 'grid-cols-2'}`}
      style={{ background: 'var(--ash-light)' }}
    >
      {opciones.map(({ id, label, icon: Icon }) => {
        const activa = vista === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={activa}
            onClick={() => onCambiar(id)}
            className={`flex min-h-[36px] items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-[background-color,color,box-shadow] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 ${
              activa ? 'bg-white shadow-sm text-[var(--jet)]' : 'text-[var(--jet-mid)] hover:text-[var(--jet)]'
            }`}
          >
            <Icon size={15} aria-hidden="true" /> {label}
          </button>
        );
      })}
    </div>
  );
};

export default SelectorVistaAsistencia;
