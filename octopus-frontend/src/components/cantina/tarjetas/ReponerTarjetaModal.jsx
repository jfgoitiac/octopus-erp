import { useState } from 'react';
import { toast } from 'react-toastify';
import { Loader2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { buscarTarjetaParaReponer, reponerTarjeta } from '../../../api/cantina.service';
import { Modal } from '../../ui/Modal';

const FIELD_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };
const LABEL_STYLE = { color: 'var(--ash)' };
const IDLE_STYLE  = { border: '0.5px solid var(--border-md)', color: 'var(--ash)', background: 'var(--porcelain)' };

const MOTIVOS = [
  { value: 'extravio', label: 'Extravío' },
  { value: 'dano', label: 'Tarjeta dañada' },
];

// tarjetaInicial (opcional): { id, serial, alumnoNombre } — llega cuando el
// admin viene sugerido desde el conflicto de AsignarTarjetaModal (§7.3bis).
// Si no llega, este modal pide primero el código/serial para ubicarla (aún
// no existe listado/tabla de tarjetas — eso es Fase 3, §5 cantina.md).
export default function ReponerTarjetaModal({ tarjetaInicial, onClose, onRepuesta }) {
  const [tarjeta, setTarjeta] = useState(tarjetaInicial?.id ? tarjetaInicial : null);
  const [entradaTarjeta, setEntradaTarjeta] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState('');

  const [motivo, setMotivo] = useState('extravio');
  const [confirmado, setConfirmado] = useState(false);
  const [reponiendo, setReponiendo] = useState(false);

  const handleBuscar = async () => {
    const valor = entradaTarjeta.trim();
    if (!valor) {
      toast.warning('Escribe el código o el serial de la tarjeta a reponer.');
      return;
    }
    setBuscando(true);
    setErrorBusqueda('');
    try {
      const query = /^CANT-/i.test(valor) ? { codigo: valor } : { serial: valor };
      const res = await buscarTarjetaParaReponer(query);
      setTarjeta(res.data);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      setErrorBusqueda(err.response?.data?.detail || 'No se encontró una tarjeta con ese código/serial.');
    } finally {
      setBuscando(false);
    }
  };

  const handleConfirmar = async () => {
    if (!tarjeta?.id) return;
    if (!confirmado) {
      toast.warning('Confirma que entiendes que el código físico anterior quedará inválido.');
      return;
    }
    setReponiendo(true);
    try {
      await reponerTarjeta(tarjeta.id, motivo);
      toast.success('Tarjeta repuesta. El código anterior ya no es válido.');
      onRepuesta?.();
      onClose();
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      toast.error(err.response?.data?.detail || 'No se pudo reponer la tarjeta.');
    } finally {
      setReponiendo(false);
    }
  };

  const handleClose = () => { if (!reponiendo) onClose(); };

  const footer = (
    <>
      <button
        onClick={handleClose}
        disabled={reponiendo}
        className="w-full sm:w-auto px-4 rounded-xl py-2.5 text-sm min-h-[44px] disabled:opacity-40"
        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
      >
        Cancelar
      </button>
      {tarjeta && (
        <button
          onClick={handleConfirmar}
          disabled={reponiendo || !confirmado}
          className="w-full sm:w-auto px-4 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
          style={{ background: '#b45309' }}
        >
          {reponiendo ? <><Loader2 size={14} className="animate-spin" /> Reponiendo...</> : 'Confirmar reposición'}
        </button>
      )}
    </>
  );

  return (
    <Modal
      open
      onClose={handleClose}
      titulo={(
        <>
          <ShieldAlert size={17} style={{ color: '#b45309' }} />
          Reponer tarjeta extraviada/dañada
        </>
      )}
      footer={footer}
      size="sm"
    >
      {!tarjeta ? (
        <div className="space-y-3">
          <label className="block text-[11px] uppercase tracking-widest" style={LABEL_STYLE}>
            Código QR o serial de la tarjeta a reponer
          </label>
          <div className="flex gap-2">
            <input
              autoFocus
              className="flex-1 px-3 py-2 rounded-lg text-sm outline-none min-h-[44px]"
              style={FIELD_STYLE}
              value={entradaTarjeta}
              onChange={e => { setEntradaTarjeta(e.target.value); setErrorBusqueda(''); }}
              onKeyDown={e => { if (e.key === 'Enter') handleBuscar(); }}
              placeholder="CANT-7K9M2XQPRT o L003-0007"
            />
            <button
              onClick={handleBuscar}
              disabled={buscando}
              className="px-4 rounded-xl text-sm font-medium text-white disabled:opacity-50 min-h-[44px]"
              style={{ background: 'var(--pb)' }}
            >
              {buscando ? <Loader2 size={14} className="animate-spin" /> : 'Buscar'}
            </button>
          </div>
          {errorBusqueda && (
            <p className="text-sm flex items-center gap-1.5" style={{ color: 'var(--red, #dc2626)' }}>
              <AlertTriangle size={14} /> {errorBusqueda}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--ash)' }}>
            Tarjeta <strong style={{ color: 'var(--jet)' }}>{tarjeta.serial}</strong>
            {tarjeta.alumnoNombre || tarjeta.alumno ? (
              <> — {tarjeta.alumnoNombre || `${tarjeta.alumno?.nombre ?? ''} ${tarjeta.alumno?.apellido ?? ''}`.trim()}</>
            ) : null}
          </p>

          <div>
            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={LABEL_STYLE}>Motivo</label>
            <div className="flex gap-2">
              {MOTIVOS.map(m => (
                <button
                  key={m.value}
                  type="button"
                  aria-pressed={motivo === m.value}
                  onClick={() => setMotivo(m.value)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium min-h-[44px]"
                  style={motivo === m.value
                    ? { background: '#fef3c7', color: '#b45309', border: '1.5px solid #f59e0b' }
                    : IDLE_STYLE}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg px-3 py-3 text-sm flex gap-2" style={{ background: '#fef2f2', border: '0.5px solid #fecaca', color: '#b91c1c' }}>
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>
              El código físico (QR) anterior quedará <strong>permanentemente inválido</strong>. Si alguien lo escanea después, no resolverá a ninguna tarjeta activa. El saldo actual de la tarjeta se conserva.
            </span>
          </div>

          <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: 'var(--jet)' }}>
            <input
              type="checkbox"
              checked={confirmado}
              onChange={e => setConfirmado(e.target.checked)}
              className="mt-0.5"
            />
            Entiendo que el código anterior queda inválido y se generará uno nuevo.
          </label>
        </div>
      )}
    </Modal>
  );
}
