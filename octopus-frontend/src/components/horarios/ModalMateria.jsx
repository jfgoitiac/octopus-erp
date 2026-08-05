import { useRef, useState } from 'react';
import { X, Save, Loader2, Trash2, AlertTriangle, BookOpen } from 'lucide-react';
import { toast } from 'react-toastify';
import { INPUT_STYLE } from '../../constants/styles';
import { useEscape } from '../../hooks/useEscape';
import { useFocusTrap } from '../../hooks/useFocusTrap';

const buildForm = (materia) => ({
  id:                        materia?.id    ?? null,
  nombre:                    materia?.nombre ?? '',
  horas_academicas:          materia?.horas_academicas ?? 4,
  tipo_evaluacion:           materia?.tipo_evaluacion ?? 'numerica',
  cuenta_para_promedio:      materia?.cuenta_para_promedio ?? true,
  aporta_a_todas_las_materias: materia?.aporta_a_todas_las_materias ?? false,
});

export const ModalMateria = ({ materia, saving, onClose, onSave, onDelete }) => {
  const [form, setForm]                 = useState(() => buildForm(materia));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const containerRef                    = useRef(null);

  useEscape(true, onClose);
  useFocusTrap(containerRef);

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) { toast.warning('Ingresa el nombre de la materia.'); return; }
    const horas = parseInt(form.horas_academicas, 10);
    if (!horas || horas < 1 || horas > 30) {
      toast.warning('Las horas académicas deben estar entre 1 y 30.');
      return;
    }
    onSave({ ...form, horas_academicas: horas });
  };

  const setCheckbox = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.checked }));

  return (
    <div
      className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(43,48,58,0.5)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-materia-titulo"
    >
      <div
        ref={containerRef}
        className="rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-fadeIn"
        style={{ background: 'var(--porcelain)' }}
      >
        {/* Header */}
        <div className="p-5 flex justify-between items-center"
          style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--pb)', color: '#fff' }}>
          <h3 id="modal-materia-titulo" className="font-bold text-base flex items-center gap-2">
            <BookOpen size={17} />
            {form.id ? 'Editar Materia' : 'Nueva Materia'}
          </h3>
          <button onClick={onClose} aria-label="Cerrar" style={{ color: '#fff' }}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {/* Nombre */}
          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
              Nombre
            </label>
            <input
              type="text"
              placeholder="Ej: Matemáticas, Lengua, Ciencias..."
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={INPUT_STYLE}
              value={form.nombre}
              onChange={set('nombre')}
              autoFocus
              required
            />
          </div>

          {/* Horas académicas */}
          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
              Horas académicas por semana
            </label>
            <input
              type="number"
              min={1}
              max={30}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={INPUT_STYLE}
              value={form.horas_academicas}
              onChange={set('horas_academicas')}
              required
            />
            <p className="text-[11px] mt-1.5" style={{ color: 'var(--ash)' }}>
              1 hora académica = 45 min · El generador asignará{' '}
              <span className="font-semibold" style={{ color: 'var(--jet)' }}>
                {parseInt(form.horas_academicas, 10) || 0} bloque{parseInt(form.horas_academicas, 10) !== 1 ? 's' : ''}
              </span>{' '}
              por semana para esta materia.
            </p>
          </div>

          {/* Tipo de evaluación */}
          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
              Tipo de evaluación
            </label>
            <select
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={INPUT_STYLE}
              value={form.tipo_evaluacion}
              onChange={set('tipo_evaluacion')}
            >
              <option value="numerica">Numérica (puntos)</option>
              <option value="literal">Literal (A/B/C)</option>
            </select>
          </div>

          {/* Cuenta para el promedio */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="materia-cuenta-promedio"
              checked={form.cuenta_para_promedio}
              onChange={setCheckbox('cuenta_para_promedio')}
              className="w-4 h-4 rounded"
            />
            <label htmlFor="materia-cuenta-promedio" className="text-sm" style={{ color: 'var(--jet)' }}>
              Cuenta para el promedio del estudiante
            </label>
          </div>

          {/* Aporta a todas las materias */}
          <div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="materia-aporta-todas"
                checked={form.aporta_a_todas_las_materias}
                onChange={setCheckbox('aporta_a_todas_las_materias')}
                className="w-4 h-4 rounded"
              />
              <label htmlFor="materia-aporta-todas" className="text-sm" style={{ color: 'var(--jet)' }}>
                Aporta puntos a todas las materias del grado (ej. EREC/Religión)
              </label>
            </div>
            <p className="text-[11px] mt-1.5 pl-6" style={{ color: 'var(--ash)' }}>
              Suma automáticamente los puntos de esta materia al total de las demás materias del mismo grado y lapso.
            </p>
          </div>

          {/* Botones */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm"
              style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 text-white disabled:opacity-50"
              style={{ background: 'var(--pb)' }}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {form.id ? 'Actualizar' : 'Agregar'}
            </button>
          </div>

          {/* Eliminar — solo en edición */}
          {form.id && !confirmDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="w-full py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
              style={{ color: 'var(--red)', border: '0.5px solid var(--red)', background: 'transparent' }}
            >
              <Trash2 size={14} />
              Eliminar materia
            </button>
          )}

          {confirmDelete && (
            <div className="rounded-xl p-4" style={{ background: '#fef2f2', border: '0.5px solid #fca5a5' }}>
              <p className="text-sm font-medium mb-3 flex items-center gap-2" style={{ color: '#991b1b' }}>
                <AlertTriangle size={15} />
                ¿Eliminar esta materia? Se desactivará y no aparecerá en el horario.
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
