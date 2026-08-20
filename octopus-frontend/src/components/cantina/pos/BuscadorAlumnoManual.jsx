import { useState, useRef } from 'react';
import { toast } from 'react-toastify';
import { Search, Loader2 } from 'lucide-react';
import { buscarTarjetaActiva } from '../../../api/cantina.service';

/**
 * Búsqueda manual de respaldo del alumno/tarjeta (§6 cantina.md) — por si
 * el QR está dañado y no hay tiempo/forma de escanearlo. Busca por
 * `codigo` (si el cajero teclea el código completo CANT-XXXXXXXXXX) o por
 * `serial` (identificador humano impreso en la tarjeta física), mismo
 * criterio que ScannerTarjeta y RecargaCajeroModal — buscarTarjetaActiva
 * ya soporta ambos parámetros.
 */
export default function BuscadorAlumnoManual({ onTarjetaResuelta, disabled = false }) {
  const [valor, setValor] = useState('');
  const [buscando, setBuscando] = useState(false);
  const abortRef = useRef(null);

  const buscar = async () => {
    const entrada = valor.trim();
    if (!entrada) {
      toast.warning('Escribe el código o el serial de la tarjeta.');
      return;
    }
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
    } finally {
      setBuscando(false);
    }
  };

  const handleKeyDown = (e) => { if (e.key === 'Enter') buscar(); };

  return (
    <div>
      <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
        Búsqueda manual (si el QR no lee)
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          disabled={disabled || buscando}
          value={valor}
          onChange={e => setValor(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Código o serial de la tarjeta"
          aria-label="Búsqueda manual de tarjeta por código o serial"
          className="flex-1 px-3 py-2 rounded-lg text-sm outline-none min-h-[44px] font-mono"
          style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
        />
        <button
          type="button"
          onClick={buscar}
          disabled={disabled || buscando}
          className="px-4 rounded-xl text-sm font-medium text-white flex items-center gap-1.5 disabled:opacity-50 min-h-[44px]"
          style={{ background: 'var(--pb, #0fa3b1)' }}
        >
          {buscando ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Buscar
        </button>
      </div>
    </div>
  );
}
