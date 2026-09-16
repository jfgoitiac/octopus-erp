import { useState } from 'react';
import { Plus, Trash2, Loader2, CalendarClock } from 'lucide-react';
import { DIAS_GENERADOR } from '../../constants/horarios';
import { INPUT_STYLE } from '../../constants/styles';
import { useDisponibilidadDocente } from '../../hooks/useDisponibilidadDocente';

// Franjas de disponibilidad semanal de un docente. Standalone — pensado para
// montarse dentro de la ficha/detalle de un Docente (src/pages/Docentes.jsx
// o un futuro modal de detalle), pasándole su `docenteId`. No se integra
// automáticamente ahí en este cambio: no se encontró un punto de entrada de
// "ficha de docente" evidente en la página actual de Docentes (lista +
// modal de alta/edición simple), así que se deja como componente exportado
// listo para montarse cuando exista esa vista de detalle.
export const PanelDisponibilidadDocente = ({ docenteId }) => {
  const { disponibilidad, loading, saving, agregar, eliminar } = useDisponibilidadDocente(docenteId);
  const [dia, setDia]         = useState(DIAS_GENERADOR[0].value);
  const [horaInicio, setHoraInicio] = useState('07:00');
  const [horaFin, setHoraFin]       = useState('13:00');

  const porDia = DIAS_GENERADOR.map(d => ({
    dia: d,
    items: disponibilidad
      .filter(f => f.dia_semana === d.value)
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio)),
  }));

  const handleAgregar = async () => {
    if (horaInicio >= horaFin) return;
    await agregar({ dia_semana: dia, hora_inicio: horaInicio, hora_fin: horaFin });
  };

  if (!docenteId) return null;

  return (
    <div className="rounded-xl p-4 space-y-4" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
      <p className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--jet)' }}>
        <CalendarClock size={15} style={{ color: 'var(--pb)' }} />
        Disponibilidad semanal
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <select className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={INPUT_STYLE}
          value={dia} onChange={e => setDia(e.target.value)}>
          {DIAS_GENERADOR.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <input type="time" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={INPUT_STYLE}
          value={horaInicio} onChange={e => setHoraInicio(e.target.value)} />
        <input type="time" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={INPUT_STYLE}
          value={horaFin} onChange={e => setHoraFin(e.target.value)} />
        <button type="button" onClick={handleAgregar} disabled={saving || horaInicio >= horaFin}
          className="w-full px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 text-white disabled:opacity-50"
          style={{ background: 'var(--pb)' }}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Agregar
        </button>
      </div>

      {loading ? (
        <p className="text-xs" style={{ color: 'var(--ash)' }}>Cargando disponibilidad...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {porDia.map(({ dia: d, items }) => (
            <div key={d.value} className="rounded-lg p-2.5" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
              <p className="text-[11px] font-bold mb-1.5" style={{ color: 'var(--jet)' }}>{d.label}</p>
              {items.length === 0 ? (
                <p className="text-[11px]" style={{ color: 'var(--ash)' }}>Sin franjas.</p>
              ) : (
                <ul className="space-y-1">
                  {items.map(f => (
                    <li key={f.id} className="flex items-center justify-between gap-2 text-xs">
                      <span style={{ color: 'var(--jet)' }}>{f.hora_inicio}–{f.hora_fin}</span>
                      <button type="button" onClick={() => eliminar(f.id)} disabled={saving}
                        aria-label={`Eliminar franja ${f.hora_inicio}`}
                        className="p-1 rounded hover:bg-[var(--red-light)] disabled:opacity-50">
                        <Trash2 size={11} style={{ color: 'var(--red)' }} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
