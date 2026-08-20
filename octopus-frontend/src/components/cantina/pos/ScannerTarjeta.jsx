import { useState, useRef, useEffect } from 'react';
import { toast } from 'react-toastify';
import { CreditCard, Loader2 } from 'lucide-react';
import { buscarTarjetaActiva } from '../../../api/cantina.service';

/**
 * Input de escaneo de tarjeta prepago — SOLO se monta en el DOM cuando el
 * método de pago elegido es "Tarjeta prepago" (regla de foco 3, §7.2
 * cantina.md): CantinaPOS controla el montaje condicional, este componente
 * no decide eso, solo se autoenfoca al montar para que el cajero pueda
 * escanear de inmediato.
 *
 * Acepta tanto el código QR (prefijo 'CANT-') como el serial impreso —
 * mismo criterio de doble búsqueda que ya usa RecargaCajeroModal.
 */
export default function ScannerTarjeta({ onTarjetaResuelta, disabled = false }) {
  const [valor, setValor] = useState('');
  const [buscando, setBuscando] = useState(false);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    return () => abortRef.current?.abort();
  }, []);

  const handleKeyDown = async (e) => {
    if (e.key !== 'Enter') return;
    const entrada = valor.trim();
    if (!entrada) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setBuscando(true);
    try {
      const query = /^CANT-/i.test(entrada) ? { codigo: entrada } : { serial: entrada };
      const res = await buscarTarjetaActiva(query, controller.signal);
      onTarjetaResuelta(res.data);
      setValor('');
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      if (err.response?.status === 404) {
        toast.error(`No se encontró ninguna tarjeta activa con ese código/serial ("${entrada}").`);
      } else {
        toast.error(err.response?.data?.detail || err.response?.data?.error || 'No se pudo buscar la tarjeta.');
      }
      setValor('');
    } finally {
      setBuscando(false);
      if (!disabled) inputRef.current?.focus();
    }
  };

  return (
    <div className="relative">
      <CreditCard
        size={18}
        className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: 'var(--pb, #0fa3b1)' }}
      />
      <input
        ref={inputRef}
        type="text"
        disabled={disabled}
        value={valor}
        onChange={e => setValor(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Escanea el QR de la tarjeta o escribe el código/serial y presiona Enter"
        aria-label="Escaneo de tarjeta prepago"
        className="w-full pl-10 pr-10 py-3 rounded-xl text-sm outline-none min-h-[48px] font-mono"
        style={{ border: '1.5px solid var(--pb, #0fa3b1)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
      />
      {buscando && (
        <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: 'var(--pb)' }} />
      )}
    </div>
  );
}
