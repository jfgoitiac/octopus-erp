import { useState, useRef } from 'react';
import { toast } from 'react-toastify';
import { CalendarPlus, X, Loader2 } from 'lucide-react';
import { useEscape } from '../../hooks/useEscape';
import { useFocusTrap } from '../../hooks/useFocusTrap';

const TIPOS = [
  { value: 'recordatorio', label: 'Recordatorio' },
  { value: 'evaluacion', label: 'Evaluación' },
  { value: 'reunion', label: 'Reunión' },
  { value: 'entrega', label: 'Entrega' },
  { value: 'otro', label: 'Otro' },
];

const ModalNuevoEvento = ({ fechaInicial, onClose, onSubmit, creando }) => {
  const [titulo, setTitulo] = useState('');
  const [fecha, setFecha] = useState(fechaInicial);
  const [hora, setHora] = useState('');
  const [tipo, setTipo] = useState('recordatorio');
  const [descripcion, setDescripcion] = useState('');
  const containerRef = useRef(null);

  useEscape(true, onClose);
  useFocusTrap(containerRef);

  const handleGuardar = async () => {
    if (!titulo.trim()) { toast.warning('Escribe un título para el evento.'); return; }
    if (!fecha) { toast.warning('Selecciona una fecha.'); return; }
    const ok = await onSubmit({
      titulo: titulo.trim(),
      fecha,
      hora: hora || null,
      tipo,
      descripcion: descripcion.trim(),
    });
    if (ok) onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nuevo-evento-titulo"
    >
      <div ref={containerRef} className="bg-white rounded-t-2xl sm:rounded-2xl p-5 w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 id="nuevo-evento-titulo" className="font-bold text-gray-800 flex items-center gap-2">
            <CalendarPlus size={18} className="text-[var(--docente-primary)]" />
            Nuevo evento
          </h3>
          <button onClick={onClose} aria-label="Cerrar" className="p-1 text-gray-400">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="nuevo-evento-titulo-input" className="block text-xs font-medium text-gray-500 mb-1.5">Título</label>
            <input
              id="nuevo-evento-titulo-input"
              type="text"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30"
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              placeholder="Ej. Entrega de proyecto final"
              maxLength={120}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="nuevo-evento-fecha" className="block text-xs font-medium text-gray-500 mb-1.5">Fecha</label>
              <input
                id="nuevo-evento-fecha"
                type="date"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="nuevo-evento-hora" className="block text-xs font-medium text-gray-500 mb-1.5">Hora (opcional)</label>
              <input
                id="nuevo-evento-hora"
                type="time"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30"
                value={hora}
                onChange={e => setHora(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="nuevo-evento-tipo" className="block text-xs font-medium text-gray-500 mb-1.5">Tipo</label>
            <select
              id="nuevo-evento-tipo"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30"
              value={tipo}
              onChange={e => setTipo(e.target.value)}
            >
              {TIPOS.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="nuevo-evento-descripcion" className="block text-xs font-medium text-gray-500 mb-1.5">Descripción (opcional)</label>
            <textarea
              id="nuevo-evento-descripcion"
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30"
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Detalles adicionales..."
            />
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl py-2.5 text-sm border border-gray-200 text-gray-500 min-h-[44px]"
          >
            Cancelar
          </button>
          <button
            onClick={handleGuardar}
            disabled={creando}
            className="flex-1 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px] bg-[var(--docente-primary)] hover:bg-[var(--docente-primary-dark)]"
          >
            {creando ? <><Loader2 size={14} className="animate-spin" /> Guardando...</> : 'Agregar evento'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalNuevoEvento;
