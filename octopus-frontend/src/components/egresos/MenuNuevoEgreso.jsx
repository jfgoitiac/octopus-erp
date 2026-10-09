import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Plus, ReceiptText, WalletCards } from 'lucide-react';

const OPCIONES = [
  { to: '/egresos/nuevo', icono: ReceiptText, titulo: 'Compra de contado', ayuda: 'Ya la pagaste' },
  { to: '/cuentas-por-pagar/nueva', icono: WalletCards, titulo: 'Cuenta por pagar', ayuda: 'La pagarás después' },
];

// Botón principal "Nuevo egreso" con las dos formas de registrar un gasto.
export default function MenuNuevoEgreso() {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef(null);
  useEffect(() => {
    if (!abierto) return undefined;
    const cerrar = (e) => { if (e.type === 'keydown' ? e.key === 'Escape' : !raiz.current?.contains(e.target)) setAbierto(false); };
    document.addEventListener('mousedown', cerrar);
    document.addEventListener('keydown', cerrar);
    return () => { document.removeEventListener('mousedown', cerrar); document.removeEventListener('keydown', cerrar); };
  }, [abierto]);
  return (
    <div ref={raiz} className="relative w-full sm:w-auto">
      <button type="button" onClick={() => setAbierto((x) => !x)} aria-haspopup="menu" aria-expanded={abierto} className="btn btn-primary w-full sm:w-auto">
        <Plus size={17} /> Nuevo egreso <ChevronDown size={15} className={`transition-transform ${abierto ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {abierto && (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-full overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] shadow-lg sm:w-72">
          {OPCIONES.map(({ to, icono: Icono, titulo, ayuda }) => (
            <Link key={to} to={to} role="menuitem" className="flex min-h-14 items-center gap-3 px-3.5 py-2.5 hover:bg-[var(--surface-sunken)]">
              <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[var(--pb-light)] text-[var(--pb-mid)]"><Icono size={18} strokeWidth={1.8} aria-hidden="true" /></span>
              <span><span className="block text-sm font-semibold text-[var(--jet)]">{titulo}</span><span className="block text-xs text-[var(--ash)]">{ayuda}</span></span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
