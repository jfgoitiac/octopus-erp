import { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { ScanLine, Loader2 } from 'lucide-react';
import { buscarProductoPorCodigo } from '../../../api/cantina.service';

/**
 * Input de escaneo de producto por código de barras (§7.2 cantina.md,
 * reglas de foco 1-2-4-5).
 *
 * - Foco por defecto: se autoenfoca al montar y se re-enfoca cada vez que
 *   el foco del documento "cae" a ningún lado (document.body) — nunca le
 *   quita el foco a un input/modal que el cajero esté usando activamente
 *   (regla 4), porque solo actúa cuando activeElement es body o este mismo
 *   input.
 * - Enter busca por codigo_barras, agrega al carrito, limpia y re-enfoca.
 * - Sin loops de re-render: el listener de foco vive en un solo useEffect
 *   con dependencias estables (useCallback).
 */
export default function ScannerProducto({ onProductoEncontrado, disabled = false }) {
  const [valor, setValor] = useState('');
  const [buscando, setBuscando] = useState(false);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  const enfocar = useCallback(() => {
    if (disabled) return;
    const activo = document.activeElement;
    if (!activo || activo === document.body || activo === inputRef.current) {
      inputRef.current?.focus();
    }
  }, [disabled]);

  useEffect(() => {
    enfocar();
    // focusout se dispara ANTES de que el nuevo elemento reciba el foco —
    // se espera un tick para que document.activeElement ya refleje al
    // elemento que sí quedó enfocado (o a body si no quedó ninguno).
    const handleFocusOut = () => window.setTimeout(enfocar, 0);
    document.addEventListener('focusout', handleFocusOut);
    return () => document.removeEventListener('focusout', handleFocusOut);
  }, [enfocar]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleKeyDown = async (e) => {
    if (e.key !== 'Enter') return;
    const codigo = valor.trim();
    if (!codigo) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setBuscando(true);
    try {
      const res = await buscarProductoPorCodigo(codigo, controller.signal);
      onProductoEncontrado(res.data);
      setValor('');
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      if (err.response?.status === 404) {
        toast.error(`No se encontró ningún producto con el código "${codigo}".`);
      } else {
        toast.error(err.response?.data?.detail || 'No se pudo buscar el producto.');
      }
      setValor('');
    } finally {
      setBuscando(false);
      enfocar();
    }
  };

  return (
    <div className="relative">
      <ScanLine
        size={18}
        className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: 'var(--pb, #0fa3b1)' }}
      />
      <input
        ref={inputRef}
        type="text"
        autoFocus
        disabled={disabled}
        value={valor}
        onChange={e => setValor(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Escanea el código de barras del producto y presiona Enter"
        aria-label="Escaneo de producto por código de barras"
        className="w-full pl-10 pr-10 py-3 rounded-xl text-sm outline-none min-h-[48px] font-mono"
        style={{ border: '1.5px solid var(--pb, #0fa3b1)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
      />
      {buscando && (
        <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: 'var(--pb)' }} />
      )}
    </div>
  );
}
