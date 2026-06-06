import { useRef, useState } from 'react';
import { X, Save, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'react-toastify';
import { DIAS, DIA_MAP, HORAS_INICIO, HORAS_FIN } from '../../constants/horarios';
import { INPUT_STYLE } from '../../constants/styles';
import { useEscape } from '../../hooks/useEscape';
import { useFocusTrap } from '../../hooks/useFocusTrap';

// Devuelve la hora siguiente en formato HH:00 ("07:00" → "08:00"), tope en 23:00
const nextHour = (hhmm) => {
  const next = parseInt(hhmm.split(':')[0], 10) + 1;
  return next < 24 ? `${String(next).padStart(2, '0')}:00` : '23:00';
};

const buildInitialForm = (claseInicial, celdaDefecto) => {
  if (claseInicial) {
    return {
      id:          claseInicial.id,
      materia_id:  claseInicial.materia?.id || '',
      dia_semana:  claseInicial.dia_semana,
      hora_inicio: claseInicial.hora_inicio,
      hora_fin:    claseInicial.hora_fin,
      aula:        claseInicial.aula || '',
    };
  }
  return {
    id:          null,
    materia_id:  '',
    dia_semana:  celdaDefecto?.dia || '',
    hora_inicio: celdaDefecto?.hora || '',
    hora_fin:    celdaDefecto?.hora ? nextHour(celdaDefecto.hora) : '',
    aula:        '',
  };
};

export const ModalClase = ({
  materias,
  claseInicial,
  celdaDefecto,
  saving,
  horasInicio = HORAS_INICIO,
  horasFin    = HORAS_FIN,
  tieneConflicto,
  onClose,
  onSave,
  onDelete,
}) => {
  const [form, setForm]             = useState(() => buildInitialForm(claseInicial, celdaDefecto));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const containerRef                = useRef(null);

  useEscape(true, onClose);
  useFocusTrap(containerRef);

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  // Conflicto: otra clase en el mismo día y hora (ignorando la clase actual al editar)
  const conflicto = tieneConflicto &&
    form.dia_semana &&
    form.hora_inicio &&
    tieneConflicto(form);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.materia_id || !form.dia_semana || !form.hora_inicio || !form.hora_fin) {
      toast.warning('Completa todos los campos obligatorios.');
      return;
    }
    if (conflicto) {
      toast.warning('Ya existe una clase en ese horario. Elige otro día u hora.');
      return;
    }
    onSave(form);
  };

  return (
    <div
      className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(43,48,58,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-clase-titulo"
    >
      <div
        ref={containerRef}
        className="rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-fadeIn"
        style={{ background: 'var(--porcelain)' }}
      >

        {/* Header */}
        <div className="p-5 flex justify-between items-center"
          style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--pb)', color: '#fff' }}>
          <h3 id="modal-clase-titulo" className="font-bold text-base">
            {form.id ? 'Editar Clase' : 'Nueva Clase'}
          </h3>
          <button onClick={onClose} aria-label="Cerrar modal" style={{ color: '#fff' }}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {/* Materia */}
          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
              Materia
            </label>
            <select className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={INPUT_STYLE}
              value={form.materia_id} onChange={set('materia_id')} required>
              {materias.length === 0 ? (
                <option value="" disabled>Sin materias registradas para este grado</option>
              ) : (
                <>
                  <option value="">Seleccionar...</option>
                  {materias.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </>
              )}
            </select>
            {materias.length === 0 && (
              <p className="text-[11px] mt-1.5" style={{ color: '#dc2626' }}>
                Registra materias para este grado antes de agregar clases.
              </p>
            )}
          </div>

          {/* Día */}
          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
              Día
            </label>
            <select className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={INPUT_STYLE}
              value={form.dia_semana} onChange={set('dia_semana')} required>
              <option value="">Seleccionar...</option>
              {DIAS.map(d => <option key={d} value={DIA_MAP[d]}>{d}</option>)}
            </select>
          </div>

          {/* Hora inicio / fin */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                Hora inicio
              </label>
              <select className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={INPUT_STYLE}
                value={form.hora_inicio} onChange={set('hora_inicio')} required>
                <option value="">—</option>
                {horasInicio.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                Hora fin
              </label>
              <select className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={INPUT_STYLE}
                value={form.hora_fin} onChange={set('hora_fin')} required>
                <option value="">—</option>
                {horasFin.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>

          {/* Aviso de conflicto */}
          {conflicto && (
            <div className="rounded-lg px-3 py-2 flex items-start gap-2"
              style={{ background: '#fffbeb', border: '0.5px solid #fcd34d' }}>
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#b45309' }} />
              <p className="text-xs" style={{ color: '#92400e' }}>
                Ya hay una clase asignada en ese día y hora. Elige otra combinación.
              </p>
            </div>
          )}

          {/* Aula */}
          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
              Aula
            </label>
            <input type="text" placeholder="Ej: Aula 3, Lab. Ciencias..."
              className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={INPUT_STYLE}
              value={form.aula} onChange={set('aula')} />
          </div>

          {/* Botones principales */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm"
              style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving || materias.length === 0}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 text-white disabled:opacity-50"
              style={{ background: 'var(--pb)' }}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {form.id ? 'Actualizar' : 'Agregar'}
            </button>
          </div>

          {/* Zona de eliminación — solo para clases existentes */}
          {form.id && !confirmDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="w-full py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all"
              style={{ color: 'var(--red)', border: '0.5px solid var(--red)', background: 'transparent' }}
            >
              <Trash2 size={14} />
              Eliminar clase
            </button>
          )}

          {confirmDelete && (
            <div className="rounded-xl p-4" style={{ background: '#fef2f2', border: '0.5px solid #fca5a5' }}>
              <p className="text-sm font-medium mb-3 flex items-center gap-2" style={{ color: '#991b1b' }}>
                <AlertTriangle size={15} />
                ¿Eliminar esta clase del horario? Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-2 rounded-lg text-sm"
                  style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                  Cancelar
                </button>
                <button type="button" onClick={() => onDelete(form.id)} disabled={saving}
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: 'var(--red)' }}>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Eliminar
                </button>
              </div>
            </div>
          )}

        </form>
      </div>
    </div>
  );
};
