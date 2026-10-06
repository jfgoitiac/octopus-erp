import { ArrowLeftRight, AlertTriangle } from 'lucide-react';
import { Modal } from '../ui/Modal';

const hora = (clase) => `${clase.dia_semana_label || clase.dia_semana} · ${clase.hora_inicio}–${clase.hora_fin}`;

export const ModalConfirmarIntercambio = ({ origen, destino, saving, onClose, onConfirmar }) => (
  <Modal
    open
    onClose={onClose}
    titulo={<><ArrowLeftRight size={17} /> Propuesta para resolver el choque</>}
    size="sm"
    footer={<>
      <button type="button" onClick={onClose} disabled={saving} className="w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-sm" style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>Mantener como está</button>
      <button type="button" onClick={onConfirmar} disabled={saving} className="w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-50" style={{ background: 'var(--pb)' }}>Confirmar intercambio</button>
    </>}
  >
    <div className="space-y-4">
      <div className="rounded-xl p-3 flex items-start gap-2" style={{ background: '#fffbeb', border: '0.5px solid #fcd34d' }}>
        <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: '#b45309' }} />
        <p className="text-sm" style={{ color: '#92400e' }}>El bloque elegido ya está ocupado. Esta propuesta evita crear dos clases en el mismo horario.</p>
      </div>
      <div className="grid grid-cols-1 gap-2 text-sm">
        <div className="rounded-lg p-3" style={{ border: '0.5px solid var(--border-md)' }}><strong>{origen.materia?.nombre}</strong><p className="mt-1 text-xs" style={{ color: 'var(--ash)' }}>pasará a {hora(destino)}</p></div>
        <div className="flex justify-center"><ArrowLeftRight size={18} style={{ color: 'var(--pb)' }} /></div>
        <div className="rounded-lg p-3" style={{ border: '0.5px solid var(--border-md)' }}><strong>{destino.materia?.nombre}</strong><p className="mt-1 text-xs" style={{ color: 'var(--ash)' }}>pasará a {hora(origen)}</p></div>
      </div>
    </div>
  </Modal>
);
