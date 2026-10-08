import { Layers, List } from 'lucide-react';
import { VISTA } from './useVistaAsistencia';

const OPCIONES = [
  { id: VISTA.TARJETAS, label: 'Tarjetas', icon: Layers },
  { id: VISTA.LISTA, label: 'Lista', icon: List },
];

/** Selector segmentado Tarjetas | Lista. Dos botones cortos: caben en 360px. */
const SelectorVistaAsistencia = ({ vista, onCambiar }) => (
  <div role="group" aria-label="Vista de asistencia" className="inline-grid grid-cols-2 gap-1 rounded-xl p-1" style={{ background: 'var(--ash-light)' }}>
    {OPCIONES.map(({ id, label, icon: Icon }) => {
      const activa = vista === id;
      return (
        <button
          key={id}
          type="button"
          aria-pressed={activa}
          onClick={() => onCambiar(id)}
          className={`flex min-h-[36px] items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-[background-color,color,box-shadow] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pb)]/40 ${
            activa ? 'bg-white shadow-sm text-[var(--jet)]' : 'text-[var(--ash)] hover:text-[var(--jet)]'
          }`}
        >
          <Icon size={15} aria-hidden="true" /> {label}
        </button>
      );
    })}
  </div>
);

export default SelectorVistaAsistencia;
