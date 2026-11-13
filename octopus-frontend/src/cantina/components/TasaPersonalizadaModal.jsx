import { useId, useState } from 'react';
import { AlertTriangle, BadgeDollarSign } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';

const formatear = (valor) => {
  const numero = Number(valor);
  return Number.isFinite(numero)
    ? numero.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    : '—';
};

export default function TasaPersonalizadaModal({ open, tasa, modo, guardando, error, onClose, onConfirmar }) {
  const [valor, setValor] = useState(() => (tasa?.personalizada_activa ? String(tasa.valor_bs ?? '') : ''));
  const [motivo, setMotivo] = useState('');
  const [errorLocal, setErrorLocal] = useState('');
  const ayudaId = useId();
  const errorId = useId();
  const desactivar = modo === 'desactivar';

  const cerrar = () => {
    if (!guardando) onClose();
  };

  const enviar = (evento) => {
    evento.preventDefault();
    if (desactivar) {
      onConfirmar();
      return;
    }
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero <= 0) {
      setErrorLocal('Ingresa una tasa mayor que cero.');
      return;
    }
    if (!motivo.trim()) {
      setErrorLocal('Indica el motivo del cambio para dejarlo en la auditoría.');
      return;
    }
    setErrorLocal('');
    onConfirmar({ valor_bs: valor, motivo: motivo.trim() });
  };

  const mensajeError = errorLocal || error;
  const footer = (
    <>
      <button type="button" onClick={cerrar} disabled={guardando} className="btn btn-secondary min-h-11 w-full sm:w-auto">
        Cancelar
      </button>
      <button
        type="submit"
        form="form-tasa-personalizada"
        disabled={guardando}
        className={`${desactivar ? 'btn btn-danger' : 'btn btn-primary'} min-h-11 w-full sm:w-auto`}
      >
        {guardando ? 'Guardando…' : desactivar ? 'Volver a la tasa BCV' : 'Usar esta tasa'}
      </button>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={cerrar}
      titulo={desactivar ? 'Volver a la tasa BCV' : tasa?.personalizada_activa ? 'Cambiar tasa personalizada' : 'Activar tasa personalizada'}
      size="sm"
      bodyClassName="p-4 sm:p-6"
      footer={footer}
    >
      <form id="form-tasa-personalizada" onSubmit={enviar} className="space-y-5">
        {desactivar ? (
          <div className="flex items-start gap-3 rounded-xl bg-[var(--yellow-light)] p-4 text-sm text-[var(--amber-ink)]">
            <AlertTriangle size={20} aria-hidden="true" className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold">Las próximas operaciones usarán la BCV vigente.</p>
              <p className="mt-1 break-words">La tasa personalizada actual es Bs. {formatear(tasa?.valor_bs)}. Las ventas y recargas anteriores conservarán la tasa con la que fueron registradas.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 rounded-xl bg-[var(--surface-sunken)] p-3 text-sm">
              <BadgeDollarSign size={20} aria-hidden="true" className="shrink-0 text-[var(--pb)]" />
              <div className="min-w-0">
                <p className="font-semibold text-[var(--jet)]">BCV actual: Bs. {formatear(tasa?.tasa_bcv)}</p>
                <p className="text-xs text-[var(--ash)]">La BCV seguirá actualizándose aunque uses una tasa personalizada.</p>
              </div>
            </div>

            <label className="block text-sm font-medium text-[var(--jet)]">
              Tasa personalizada (Bs/USD)
              <input
                autoFocus
                type="number"
                inputMode="decimal"
                min="0.0001"
                max="99999999.9999"
                step="0.0001"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                disabled={guardando}
                required
                aria-describedby={`${ayudaId}${mensajeError ? ` ${errorId}` : ''}`}
                aria-invalid={Boolean(mensajeError)}
                className="input mt-1 min-h-11 text-base tabular-nums"
              />
              <span id={ayudaId} className="mt-1 block text-xs font-normal text-[var(--ash)]">Hasta cuatro decimales.</span>
            </label>

            <label className="block text-sm font-medium text-[var(--jet)]">
              Motivo del cambio
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                disabled={guardando}
                required
                maxLength={255}
                rows={3}
                className="input mt-1 min-h-24 resize-y text-base"
                placeholder="Ej.: tasa acordada para la jornada"
              />
              <span className="mt-1 block text-right text-xs font-normal tabular-nums text-[var(--ash)]">{motivo.length}/255</span>
            </label>
          </>
        )}

        {mensajeError && <p id={errorId} role="alert" className="break-words text-sm font-medium text-[var(--red)]">{mensajeError}</p>}
      </form>
    </Modal>
  );
}
