import { useId } from 'react';
import { RotateCcw } from 'lucide-react';
import BuscadorRepresentanteCxc from '../cxc/BuscadorRepresentanteCxc';

/**
 * Alumno que consume en una venta de efectivo o banco (opcional): con él, la
 * compra aparece en el estado de cuenta del portal. Busca por alumno o
 * representante, igual que "Cargar a cuenta". Sin elegir a nadie la venta se
 * cobra igual, porque también compran el personal y los visitantes.
 */
export default function AlumnoVentaPanel({
  representante, onSeleccionar, onQuitar, alumnoId, onCambiarAlumno, disabled,
}) {
  const selectId = useId();

  if (!representante) {
    return (
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--ash)' }}>
          Alumno que consume (opcional)
        </p>
        <BuscadorRepresentanteCxc
          onSelect={onSeleccionar}
          placeholder="Alumno o representante…"
          paraVenta
          soloRepresentantes
        />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <label htmlFor={selectId} className="text-xs uppercase tracking-widest" style={{ color: 'var(--ash)' }}>
          Alumno que consume (opcional)
        </label>
        <button
          type="button"
          onClick={onQuitar}
          disabled={disabled}
          className="shrink-0 flex items-center gap-1 text-xs px-3 py-2 rounded-lg min-h-[44px]"
          style={{ color: 'var(--pb-mid)' }}
        >
          <RotateCcw size={12} /> Cambiar
        </button>
      </div>
      <select
        id={selectId}
        value={alumnoId}
        onChange={e => onCambiarAlumno(e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2 rounded-lg text-sm outline-none min-h-[44px]"
        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
      >
        <option value="">Sin especificar</option>
        {(representante.alumnos ?? []).map(a => (
          <option key={a.id} value={a.id}>
            {`${a.nombre} ${a.apellido}`.trim()}{a.grado_seccion ? ` — ${a.grado_seccion}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
