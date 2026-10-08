import { Smartphone, Share, SquarePlus } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';

// Pasos de "Agregar a pantalla de inicio" en Safari (iOS no permite lanzar la
// instalación desde la página).
const InstruccionesIOSModal = ({ open, onClose }) => (
  <Modal
    open={open}
    onClose={onClose}
    size="sm"
    titulo={<><Smartphone size={18} /> Instalar en tu iPhone</>}
    footer={
      <button
        type="button"
        onClick={onClose}
        className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
        style={{ background: 'var(--portal-primary, #0fa3b1)' }}
      >
        Entendido
      </button>
    }
  >
    <ol className="space-y-4 text-sm text-[var(--jet-mid)]">
      <li className="flex items-start gap-3">
        <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--surface-sunken)] flex items-center justify-center text-xs font-bold">1</span>
        <span>
          Abre esta página en <strong>Safari</strong> y toca el botón Compartir{' '}
          <Share size={16} className="inline -mt-0.5 text-[var(--portal-primary,#0fa3b1)]" aria-label="Compartir" />{' '}
          de la barra inferior.
        </span>
      </li>
      <li className="flex items-start gap-3">
        <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--surface-sunken)] flex items-center justify-center text-xs font-bold">2</span>
        <span>
          Desliza y elige <strong>Agregar a pantalla de inicio</strong>{' '}
          <SquarePlus size={16} className="inline -mt-0.5 text-[var(--portal-primary,#0fa3b1)]" aria-hidden="true" />.
        </span>
      </li>
      <li className="flex items-start gap-3">
        <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--surface-sunken)] flex items-center justify-center text-xs font-bold">3</span>
        <span>Toca <strong>Agregar</strong>. El portal quedará como una app más en tu celular.</span>
      </li>
    </ol>
  </Modal>
);

export default InstruccionesIOSModal;
