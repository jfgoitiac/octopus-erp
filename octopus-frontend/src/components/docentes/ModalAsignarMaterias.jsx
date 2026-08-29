import { useEffect, useState } from 'react';
import { Save, Loader2, BookOpen } from 'lucide-react';
import { toast } from 'react-toastify';
import { getMaterias } from '../../api/academico.service';
import { Modal } from '../ui/Modal';

export const ModalAsignarMaterias = ({ docente, saving, onClose, onSave }) => {
  const [materias, setMaterias] = useState([]);
  const [loadingMaterias, setLoadingMaterias] = useState(true);
  const [seleccionadas, setSeleccionadas] = useState(() => new Set((docente?.materias || []).map(m => m.id)));

  useEffect(() => {
    const controller = new AbortController();
    setLoadingMaterias(true);
    getMaterias(undefined, controller.signal)
      .then(res => setMaterias(res.data || []))
      .catch((err) => {
        if (err.code === 'ERR_CANCELED' || controller.signal.aborted) return;
        toast.error('No se pudieron cargar las materias.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoadingMaterias(false); });
    return () => controller.abort();
  }, []);

  const toggle = (id) => {
    setSeleccionadas(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(docente.id, Array.from(seleccionadas));
  };

  const footer = (
    <>
      <button type="button" onClick={onClose}
        className="w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-sm"
        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--ash)' }}>
        Cancelar
      </button>
      <button type="submit" form="form-asignar-materias" disabled={saving}
        className="w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 text-white disabled:opacity-50"
        style={{ background: 'var(--pb)' }}>
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        Guardar
      </button>
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      titulo={(
        <>
          <BookOpen size={17} />
          Asignar materias
        </>
      )}
      footer={footer}
      size="sm"
    >
      <form id="form-asignar-materias" onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm" style={{ color: 'var(--ash)' }}>
          Selecciona las materias que dictará este docente.
        </p>

        <div className="space-y-1.5">
          {loadingMaterias ? (
            [1, 2, 3].map(item => (
              <div key={item} className="h-10 rounded-lg animate-pulse" style={{ background: 'var(--border)' }} />
            ))
          ) : materias.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: 'var(--ash)' }}>No hay materias registradas.</p>
          ) : (
            materias.map((materia) => (
              <label
                key={materia.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer"
                style={{ border: '0.5px solid var(--border-md)' }}
              >
                <input
                  type="checkbox"
                  checked={seleccionadas.has(materia.id)}
                  onChange={() => toggle(materia.id)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm flex-1" style={{ color: 'var(--jet)' }}>
                  {materia.nombre} <span style={{ color: 'var(--ash)' }}>· {materia.grado_seccion}</span>
                </span>
              </label>
            ))
          )}
        </div>
      </form>
    </Modal>
  );
};
