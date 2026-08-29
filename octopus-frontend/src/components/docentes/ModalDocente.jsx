import { useState } from 'react';
import { Save, Loader2, Trash2, AlertTriangle, UserRound } from 'lucide-react';
import { toast } from 'react-toastify';
import { INPUT_STYLE } from '../../constants/styles';
import { useSede } from '../../context/SedeContext';
import { nombreUsuario } from '../../utils/nombreUsuario';
import { Modal } from '../ui/Modal';

const buildForm = (docente) => ({
  id:                   docente?.id ?? null,
  user:                 docente?.user_id ?? '',
  titulo_academico:     docente?.titulo_academico ?? '',
  especialidad:         docente?.especialidad ?? '',
  fecha_ingreso:        docente?.fecha_ingreso ?? '',
  telefono:             docente?.telefono ?? '',
  email_institucional:  docente?.email_institucional ?? '',
  observaciones:        docente?.observaciones ?? '',
  activo:               docente?.activo ?? true,
  sede:                 docente?.sede ?? '',
});

export const ModalDocente = ({ docente, docentesDisponibles = [], saving, onClose, onSave, onDelete }) => {
  const [form, setForm] = useState(() => buildForm(docente));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sedeCtx = useSede();
  const sedes = sedeCtx?.sedes || [];

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const setCheckbox = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.checked }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.id && !form.user) { toast.warning('Selecciona el usuario del docente.'); return; }
    onSave({ ...form, sede: form.sede || null, fecha_ingreso: form.fecha_ingreso || null });
  };

  const footer = (
    <>
      <button type="button" onClick={onClose}
        className="w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-sm"
        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
        Cancelar
      </button>
      <button type="submit" form="form-docente" disabled={saving}
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
      titulo={(
        <>
          <UserRound size={17} />
          {form.id ? 'Editar Docente' : 'Nuevo Docente'}
        </>
      )}
      footer={footer}
      size="sm"
    >
      <form id="form-docente" onSubmit={handleSubmit} className="space-y-4">

        {!form.id && (
          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
              Usuario (rol docente)
            </label>
            <select
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={INPUT_STYLE}
              value={form.user}
              onChange={set('user')}
              required
            >
              <option value="">Selecciona un usuario...</option>
              {docentesDisponibles.map((u) => (
                <option key={u.id} value={u.id}>{nombreUsuario(u)}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Título académico
          </label>
          <input
            type="text"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={INPUT_STYLE}
            value={form.titulo_academico}
            onChange={set('titulo_academico')}
            autoFocus
          />
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Especialidad
          </label>
          <input
            type="text"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={INPUT_STYLE}
            value={form.especialidad}
            onChange={set('especialidad')}
          />
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Fecha de ingreso
          </label>
          <input
            type="date"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={INPUT_STYLE}
            value={form.fecha_ingreso || ''}
            onChange={set('fecha_ingreso')}
          />
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Teléfono
          </label>
          <input
            type="text"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={INPUT_STYLE}
            value={form.telefono}
            onChange={set('telefono')}
          />
        </div>

        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Email institucional
          </label>
          <input
            type="email"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={INPUT_STYLE}
            value={form.email_institucional}
            onChange={set('email_institucional')}
          />
        </div>

        {sedes.length > 0 && (
          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
              Sede
            </label>
            <select
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={INPUT_STYLE}
              value={form.sede || ''}
              onChange={set('sede')}
            >
              <option value="">Sin asignar</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
            Observaciones
          </label>
          <textarea
            rows={3}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={INPUT_STYLE}
            value={form.observaciones}
            onChange={set('observaciones')}
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="docente-activo"
            checked={form.activo}
            onChange={setCheckbox('activo')}
            className="w-4 h-4 rounded"
          />
          <label htmlFor="docente-activo" className="text-sm" style={{ color: 'var(--jet)' }}>
            Docente activo
          </label>
        </div>

        {form.id && !confirmDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="w-full py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
            style={{ color: 'var(--red)', border: '0.5px solid var(--red)', background: 'transparent' }}
          >
            <Trash2 size={14} />
            Desactivar docente
          </button>
        )}

        {confirmDelete && (
          <div className="rounded-xl p-4" style={{ background: '#fef2f2', border: '0.5px solid #fca5a5' }}>
            <p className="text-sm font-medium mb-3 flex items-center gap-2" style={{ color: '#991b1b' }}>
              <AlertTriangle size={15} />
              ¿Desactivar este docente?
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
                Desactivar
              </button>
            </div>
          </div>
        )}

      </form>
    </Modal>
  );
};
