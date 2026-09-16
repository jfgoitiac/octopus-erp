import { useState } from 'react';
import { Plus, Trash2, Loader2, Clock3, Coffee, BookOpen } from 'lucide-react';
import { DIAS_GENERADOR } from '../../constants/horarios';
import { INPUT_STYLE } from '../../constants/styles';
import { Modal } from '../ui/Modal';
import { useBloquesPaquete } from '../../hooks/usePaquetesHorario';

const DURACIONES = [15, 20, 30, 45, 60, 90];

// Editor de la jornada horaria (BloqueHorario) de un paquete: agrega bloques
// día por día (el backend los encadena automáticamente a partir del último
// bloque de ese día, o desde las 07:00 si es el primero), permite editar su
// duración/tipo y eliminarlos. Se abre desde Horarios.jsx sobre el paquete
// actual.
export const EditorBloques = ({ paqueteId, onClose }) => {
  const { bloques, loading, saving, crear, eliminar } = useBloquesPaquete(paqueteId);
  const [diaNuevo, setDiaNuevo]         = useState(DIAS_GENERADOR[0].value);
  const [duracionNueva, setDuracionNueva] = useState(45);
  const [tipoNuevo, setTipoNuevo]       = useState('clase');

  const bloquesPorDia = DIAS_GENERADOR.map(d => ({
    dia: d,
    items: bloques
      .filter(b => b.dia_semana === d.value)
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.hora_inicio.localeCompare(b.hora_inicio)),
  }));

  const handleAgregar = async () => {
    await crear({ dia_semana: diaNuevo, duracion_min: duracionNueva, tipo: tipoNuevo });
  };

  return (
    <Modal
      open
      onClose={onClose}
      titulo={(
        <>
          <Clock3 size={17} />
          Editar bloques de la jornada
        </>
      )}
      footer={(
        <button type="button" onClick={onClose}
          className="w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-sm text-white"
          style={{ background: 'var(--pb)' }}>
          Listo
        </button>
      )}
      size="lg"
    >
      <div className="space-y-6">

        {/* Agregar bloque nuevo */}
        <div className="rounded-xl p-4 space-y-3" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
          <p className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>
            Agregar bloque
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={INPUT_STYLE}
              value={diaNuevo} onChange={e => setDiaNuevo(e.target.value)}>
              {DIAS_GENERADOR.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            <select className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={INPUT_STYLE}
              value={duracionNueva} onChange={e => setDuracionNueva(parseInt(e.target.value, 10))}>
              {DURACIONES.map(d => <option key={d} value={d}>{d} min</option>)}
            </select>
            <select className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={INPUT_STYLE}
              value={tipoNuevo} onChange={e => setTipoNuevo(e.target.value)}>
              <option value="clase">Clase</option>
              <option value="receso">Receso</option>
            </select>
          </div>
          <button type="button" onClick={handleAgregar} disabled={saving}
            className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 text-white disabled:opacity-50"
            style={{ background: 'var(--pb)' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Agregar al final del día
          </button>
          <p className="text-[11px]" style={{ color: 'var(--ash)' }}>
            El bloque se agrega a continuación del último bloque de ese día (o desde las 07:00 si es el primero).
          </p>
        </div>

        {/* Bloques por día */}
        {loading ? (
          <div className="py-8 text-center text-sm" style={{ color: 'var(--ash)' }}>
            <Loader2 size={18} className="animate-spin mx-auto mb-2" />
            Cargando bloques...
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {bloquesPorDia.map(({ dia, items }) => (
              <div key={dia.value} className="rounded-xl p-3" style={{ border: '0.5px solid var(--border-md)' }}>
                <p className="text-xs font-bold mb-2" style={{ color: 'var(--jet)' }}>{dia.label}</p>
                {items.length === 0 ? (
                  <p className="text-[11px]" style={{ color: 'var(--ash)' }}>Sin bloques.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {items.map(b => (
                      <li key={b.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs"
                        style={{ background: b.tipo === 'receso' ? '#f4f4f5' : 'var(--pb-light)' }}>
                        <span className="flex items-center gap-1.5" style={{ color: 'var(--jet)' }}>
                          {b.tipo === 'receso' ? <Coffee size={11} /> : <BookOpen size={11} />}
                          {b.hora_inicio}–{b.hora_fin}
                        </span>
                        <button type="button" onClick={() => eliminar(b.id)} disabled={saving}
                          aria-label={`Eliminar bloque ${b.hora_inicio}`}
                          className="p-1 rounded hover:bg-white/60 disabled:opacity-50">
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
    </Modal>
  );
};
