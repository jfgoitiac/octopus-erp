import { useEffect, useState } from 'react';
import { Loader2, MessageSquareWarning, XCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import { Modal } from '../ui/Modal';
import { ErrorCampo } from '../ui/ErrorCampo';
import { Bone } from '../shared/Skeleton';
import { listarMotivosRechazo } from '../../services/comprobantesRevisionService';

const inputStyle = (conError) => ({
  border: `0.5px solid ${conError ? '#dc2626' : 'var(--border-md)'}`,
  background: 'var(--porcelain)',
  color: 'var(--jet)',
});

/**
 * Rechazo de un comprobante: motivo del catálogo y/o detalle libre (al menos
 * uno). El representante verá: texto del motivo + "\n" + detalle.
 */
export default function ModalRechazo({ open, onClose, onConfirmar, procesando, errores = {} }) {
  // Se monta solo mientras está abierto, así el formulario arranca vacío.
  const [motivos, setMotivos] = useState(null);
  const [motivoId, setMotivoId] = useState('');
  const [detalle, setDetalle] = useState('');
  const [errorLocal, setErrorLocal] = useState(null);
  const cargando = motivos === null;

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    listarMotivosRechazo({ soloActivos: true }, controller.signal)
      .then(({ data }) => setMotivos(Array.isArray(data) ? data : data?.results || []))
      .catch((error) => {
        if (error?.code === 'ERR_CANCELED') return;
        toast.error('No se pudieron cargar los motivos de rechazo.');
        setMotivos([]);
      });
    return () => controller.abort();
  }, [open]);

  const motivo = (motivos || []).find((m) => String(m.id) === motivoId);
  const textoFinal = [motivo?.texto, detalle.trim()].filter(Boolean).join('\n');

  const confirmar = () => {
    if (!motivoId && !detalle.trim()) {
      setErrorLocal('Selecciona un motivo o escribe un detalle para el representante.');
      return;
    }
    onConfirmar({ motivo_rechazo_id: motivoId ? Number(motivoId) : null, observaciones: detalle.trim() });
  };

  const cerrar = () => { if (!procesando) onClose(); };
  const errorMotivo = errorLocal || errores.motivo_rechazo_id;

  return (
    <Modal
      open={open}
      onClose={cerrar}
      size="md"
      titulo={<><XCircle size={18} aria-hidden="true" /> Rechazar comprobante</>}
      footer={
        <>
          <button
            type="button"
            onClick={cerrar}
            disabled={procesando}
            className="inline-flex w-full min-h-[44px] items-center justify-center rounded-xl px-4 text-sm font-medium disabled:opacity-60 sm:w-auto"
            style={{ border: '0.5px solid var(--border-md)', color: 'var(--jet)' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={procesando}
            className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 sm:w-auto"
          >
            {procesando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            Rechazar comprobante
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block text-sm font-medium" style={{ color: 'var(--jet)' }}>
          Motivo
          {cargando ? (
            <Bone className="mt-1 h-11 w-full rounded-xl" />
          ) : (
            <select
              className="mt-1 w-full min-h-[44px] rounded-xl px-3 text-sm"
              style={inputStyle(errorMotivo)}
              value={motivoId}
              onChange={(e) => { setMotivoId(e.target.value); setErrorLocal(null); }}
            >
              <option value="">Sin motivo del catálogo</option>
              {(motivos || []).map((m) => <option key={m.id} value={String(m.id)}>{m.nombre}</option>)}
            </select>
          )}
          <ErrorCampo msg={errorMotivo} />
        </label>

        <label className="block text-sm font-medium" style={{ color: 'var(--jet)' }}>
          Detalle para el representante (opcional)
          <textarea
            rows={3}
            className="mt-1 w-full rounded-xl px-3 py-2 text-sm"
            style={inputStyle(errores.observaciones)}
            value={detalle}
            onChange={(e) => { setDetalle(e.target.value); setErrorLocal(null); }}
            placeholder="Ej.: el monto transferido es Bs. 1.000 y la mensualidad es Bs. 1.215."
          />
          <ErrorCampo msg={errores.observaciones} />
        </label>

        <div className="rounded-xl p-3" style={{ background: 'var(--surface-sunken)', border: '0.5px solid var(--border)' }}>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ash)' }}>
            <MessageSquareWarning size={14} aria-hidden="true" /> Lo que verá el representante
          </p>
          <p className="mt-2 whitespace-pre-line text-sm" style={{ color: textoFinal ? 'var(--jet)' : 'var(--ash)' }}>
            {textoFinal || 'Selecciona un motivo o escribe un detalle.'}
          </p>
        </div>
      </div>
    </Modal>
  );
}
