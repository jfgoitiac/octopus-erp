import { useState } from 'react';
import { toast } from 'react-toastify';
import { CalendarPlus, Loader2 } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';

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
    <Modal
      open
      onClose={onClose}
      size="sm"
      titulo={<span className="flex items-center gap-2"><CalendarPlus size={18} /> Nuevo evento</span>}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-xl py-2.5 px-4 text-sm border border-[var(--border)] text-[var(--ash)] hover:bg-[var(--surface-sunken)] transition-colors min-h-[44px]">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleGuardar}
            disabled={creando}
            className="text-white rounded-xl py-2.5 px-4 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px] bg-[var(--docente-primary)] hover:bg-[var(--docente-primary-dark)] transition-colors"
          >
            {creando ? <><Loader2 size={14} className="animate-spin" /> Guardando…</> : 'Agregar evento'}
          </button>
        </>
      }
    >
        <div className="space-y-4">
          <div>
            <label htmlFor="nuevo-evento-titulo-input" className="block text-xs font-medium text-[var(--ash)] mb-1.5">Título</label>
            <input
              id="nuevo-evento-titulo-input"
              type="text"
              className="w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30"
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              placeholder="Ej. Entrega de proyecto final"
              maxLength={120}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="nuevo-evento-fecha" className="block text-xs font-medium text-[var(--ash)] mb-1.5">Fecha</label>
              <input
                id="nuevo-evento-fecha"
                type="date"
                className="w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="nuevo-evento-hora" className="block text-xs font-medium text-[var(--ash)] mb-1.5">Hora (opcional)</label>
              <input
                id="nuevo-evento-hora"
                type="time"
                className="w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30"
                value={hora}
                onChange={e => setHora(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="nuevo-evento-tipo" className="block text-xs font-medium text-[var(--ash)] mb-1.5">Tipo</label>
            <select
              id="nuevo-evento-tipo"
              className="w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30"
              value={tipo}
              onChange={e => setTipo(e.target.value)}
            >
              {TIPOS.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="nuevo-evento-descripcion" className="block text-xs font-medium text-[var(--ash)] mb-1.5">Descripción (opcional)</label>
            <textarea
              id="nuevo-evento-descripcion"
              rows={2}
              className="w-full border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--docente-primary)]/30"
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Detalles adicionales..."
            />
          </div>
        </div>
    </Modal>
  );
};

export default ModalNuevoEvento;
