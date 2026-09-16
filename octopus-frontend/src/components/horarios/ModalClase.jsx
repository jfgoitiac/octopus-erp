import { useState } from 'react';
import { Save, Loader2, Trash2, AlertTriangle, Clock } from 'lucide-react';
import { toast } from 'react-toastify';
import { DIA_MAP } from '../../constants/horarios';
import { INPUT_STYLE } from '../../constants/styles';
import { Modal } from '../ui/Modal';

const DIA_LABEL = Object.fromEntries(Object.entries(DIA_MAP).map(([label, val]) => [val, label]));

// El día/hora ya no se eligen aquí: la clase queda fija al bloque de la
// grilla donde se creó (celda vacía) o donde ya estaba (edición). Para
// moverla de bloque se usa drag & drop en GrillaHorario.
const buildInitialForm = (claseInicial, bloque) => {
  if (claseInicial) {
    return {
      id:          claseInicial.id,
      materia_id:  claseInicial.materia?.id || '',
      dia_semana:  claseInicial.dia_semana,
      bloque_id:   claseInicial.bloque_id,
      aula:        claseInicial.aula || '',
    };
  }
  return {
    id:          null,
    materia_id:  '',
    dia_semana:  bloque?.dia_semana || '',
    bloque_id:   bloque?.id ?? null,
    aula:        '',
  };
};

export const ModalClase = ({
  materias,
  claseInicial,
  bloque,
  saving,
  tieneConflicto,
  onClose,
  onSave,
  onDelete,
}) => {
  const [form, setForm]             = useState(() => buildInitialForm(claseInicial, bloque));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  // Conflicto: otro horario ya ocupa este mismo bloque (ignorando la clase actual al editar)
  const conflicto = tieneConflicto && tieneConflicto(form);

  const horaInicio = claseInicial?.hora_inicio || bloque?.hora_inicio;
  const horaFin    = claseInicial?.hora_fin    || bloque?.hora_fin;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.materia_id || !form.bloque_id) {
      toast.warning('Selecciona una materia.');
      return;
    }
    if (conflicto) {
      toast.warning('Ya existe una clase en ese bloque. Elige otra celda.');
      return;
    }
    onSave(form);
  };

  const footer = (
    <>
      <button type="button" onClick={onClose}
        className="w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-sm"
        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
        Cancelar
      </button>
      <button type="submit" form="form-clase" disabled={saving || materias.length === 0 || conflicto}
        className="w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 text-white disabled:opacity-50"
        style={{ background: 'var(--pb)' }}>
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        {form.id ? 'Actualizar' : 'Agregar'}
      </button>
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      titulo={form.id ? 'Editar Clase' : 'Nueva Clase'}
      footer={footer}
      size="sm"
    >
      <form id="form-clase" onSubmit={handleSubmit} className="space-y-4">

        {/* Día y hora — fijos al bloque, no editables aquí (usa drag & drop en la grilla) */}
        <div className="rounded-lg px-3 py-2.5 flex items-center gap-2"
          style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
          <Clock size={14} style={{ color: 'var(--pb)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
            {DIA_LABEL[form.dia_semana] || form.dia_semana}
            {horaInicio && horaFin ? ` · ${horaInicio}–${horaFin}` : ''}
          </p>
        </div>

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

        {/* Aviso de conflicto */}
        {conflicto && (
          <div className="rounded-lg px-3 py-2 flex items-start gap-2"
            style={{ background: '#fffbeb', border: '0.5px solid #fcd34d' }}>
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#b45309' }} />
            <p className="text-xs" style={{ color: '#92400e' }}>
              Ya hay una clase asignada en ese bloque. Elige otra celda.
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
    </Modal>
  );
};
