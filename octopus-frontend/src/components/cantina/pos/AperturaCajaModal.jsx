import { useState, useRef } from 'react';
import { toast } from 'react-toastify';
import { Loader2, Wallet } from 'lucide-react';
import { abrirCajaCantina } from '../../../api/cantina.service';

const FIELD_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };
const LABEL_STYLE = { color: 'var(--ash)' };

// Apertura de caja del cajero autenticado — se muestra ANTES de la primera
// venta del turno (bloqueante, sin botón "cerrar"): el colegio puede tener
// hasta 3 cajeros vendiendo a la vez, cada uno con su propia sesión de caja
// independiente (nunca una caja global), así que cada cajero debe declarar
// su monto inicial una sola vez por turno antes de poder cobrar.
export default function AperturaCajaModal({ onAbierta }) {
  const [montoInicial, setMontoInicial] = useState('');
  const [abriendo, setAbriendo] = useState(false);
  const abortRef = useRef(null);

  const validar = () => {
    const n = parseFloat(montoInicial);
    if (montoInicial === '' || Number.isNaN(n) || n < 0) {
      toast.warning('Ingresa el monto inicial de caja (0 o mayor).');
      return false;
    }
    return true;
  };

  const handleAbrir = async (e) => {
    e.preventDefault();
    if (!validar() || abriendo) return;

    setAbriendo(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const n = parseFloat(montoInicial);
      const res = await abrirCajaCantina(n.toFixed(2), controller.signal);
      toast.success('Caja abierta correctamente.');
      onAbierta?.(res.data);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      const msg = err.response?.data?.detail || 'No se pudo abrir la caja. Intenta de nuevo.';
      toast.error(msg);
    } finally {
      setAbriendo(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-apertura-caja-titulo"
      tabIndex={-1}
    >
      <form onSubmit={handleAbrir} className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-2 mb-1">
          <Wallet size={18} style={{ color: 'var(--pb)' }} />
          <h3 id="modal-apertura-caja-titulo" className="font-bold" style={{ color: 'var(--jet)' }}>
            Abrir caja
          </h3>
        </div>
        <p className="text-sm mt-1 mb-4" style={{ color: 'var(--ash)' }}>
          Declara el monto inicial con el que empiezas tu turno para poder registrar ventas.
        </p>

        <div>
          <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={LABEL_STYLE}>
            Monto inicial de caja (USD)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: 'var(--ash)' }}>$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              autoFocus
              className="w-full pl-9 pr-3 py-2 rounded-lg text-sm font-semibold outline-none min-h-[44px]"
              style={FIELD_STYLE}
              value={montoInicial}
              onChange={e => setMontoInicial(e.target.value)}
              placeholder="0.00"
              disabled={abriendo}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={abriendo}
          className="w-full mt-6 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
          style={{ background: 'var(--pb)' }}
        >
          {abriendo ? <><Loader2 size={14} className="animate-spin" /> Abriendo...</> : 'Abrir caja y empezar a vender'}
        </button>
      </form>
    </div>
  );
}
