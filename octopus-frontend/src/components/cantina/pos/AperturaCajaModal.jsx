import { useState, useRef } from 'react';
import { toast } from 'react-toastify';
import { Loader2, Wallet, Store, BookOpen } from 'lucide-react';
import { abrirCajaCantina } from '../../../api/cantina.service';
import { Modal } from '../../ui/Modal';

const FIELD_STYLE = { border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' };
const LABEL_STYLE = { color: 'var(--ash)' };
const ACTIVE_STYLE = { border: '2px solid var(--pb)', color: 'var(--pb)', background: 'var(--pb-light, #e6f7f9)' };
const IDLE_STYLE = { border: '0.5px solid var(--border-md)', color: 'var(--ash)', background: '#fff' };

// Dos cajas (D1/D2 del prompt CxC): el cajero elige el área AL ABRIR; la
// venta y el cierre la heredan de la apertura en el backend.
const AREAS = [
  { value: 'cantina', label: 'Cantina', icon: Store },
  { value: 'libreria', label: 'Librería', icon: BookOpen },
];

const noop = () => {};

// Apertura de caja del cajero autenticado — se muestra ANTES de la primera
// venta del turno (bloqueante: no se puede cerrar con Escape ni con el
// overlay, por eso `onClose` es un no-op y el encabezado va en el cuerpo, sin
// botón X). El colegio puede tener hasta 3 cajeros por área vendiendo a la
// vez, cada uno con su propia sesión de caja independiente.
export default function AperturaCajaModal({ onAbierta }) {
  const [area, setArea] = useState('');
  const [montoInicial, setMontoInicial] = useState('');
  const [abriendo, setAbriendo] = useState(false);
  const abortRef = useRef(null);

  const validar = () => {
    if (!area) {
      toast.warning('Elige la caja que vas a abrir: Cantina o Librería.');
      return false;
    }
    const n = parseFloat(montoInicial);
    if (montoInicial === '' || Number.isNaN(n) || n < 0) {
      toast.warning('Ingresa el monto inicial de caja (0 o mayor).');
      return false;
    }
    return true;
  };

  const handleAbrir = async (e) => {
    e?.preventDefault();
    if (!validar() || abriendo) return;

    setAbriendo(true);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const n = parseFloat(montoInicial);
      const res = await abrirCajaCantina(n.toFixed(2), area, controller.signal);
      toast.success('Caja abierta correctamente.');
      onAbierta?.(res.data);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      const msg = err.response?.data?.detail || err.response?.data?.area?.[0] || 'No se pudo abrir la caja. Intenta de nuevo.';
      toast.error(msg);
    } finally {
      setAbriendo(false);
    }
  };

  const footer = (
    <button
      type="submit"
      form="form-apertura-caja"
      disabled={abriendo}
      className="w-full text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
      style={{ background: 'var(--pb)' }}
    >
      {abriendo ? <><Loader2 size={14} className="animate-spin" /> Abriendo...</> : 'Abrir caja y empezar a vender'}
    </button>
  );

  return (
    <Modal open onClose={noop} footer={footer} size="sm">
      <form id="form-apertura-caja" onSubmit={handleAbrir} className="space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Wallet size={18} style={{ color: 'var(--pb)' }} />
            <h3 className="font-bold" style={{ color: 'var(--jet)' }}>Abrir caja</h3>
          </div>
          <p className="text-sm" style={{ color: 'var(--ash)' }}>
            Elige la caja y declara el monto inicial con el que empiezas tu turno.
          </p>
        </div>

        <div>
          <span id="apertura-caja-area" className="block text-[11px] uppercase tracking-widest mb-1.5" style={LABEL_STYLE}>Caja</span>
          <div role="group" aria-labelledby="apertura-caja-area" className="grid grid-cols-2 gap-2">
            {AREAS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setArea(value)}
                disabled={abriendo}
                aria-pressed={area === value}
                className="flex flex-col items-center justify-center gap-1.5 rounded-xl py-4 text-sm font-semibold min-h-[88px]"
                style={area === value ? ACTIVE_STYLE : IDLE_STYLE}
              >
                <Icon size={24} />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="apertura-monto-inicial" className="block text-[11px] uppercase tracking-widest mb-1.5" style={LABEL_STYLE}>
            Monto inicial de caja (USD)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: 'var(--ash)' }}>$</span>
            <input
              id="apertura-monto-inicial"
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
      </form>
    </Modal>
  );
}
