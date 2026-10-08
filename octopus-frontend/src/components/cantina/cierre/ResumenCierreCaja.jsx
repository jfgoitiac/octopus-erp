import { DollarSign, CreditCard, Banknote, Wallet } from 'lucide-react';

// Tarjetas de resumen de los 4 totales del día (§5.6/§8 FASE 5 cantina.md).
// Reutilizado tanto en el estado "por cerrar" (totales preliminares) como
// referencia visual — el estado "ya cerrado" muestra estos mismos totales
// más el conteo físico/diferencia en CantinaCierreCaja.
// Todos los montos llegan como string decimal del backend, se formatean acá.
const TARJETAS = [
  {
    key: 'total_ventas',
    label: 'Total ventas del día',
    icon: DollarSign,
    color: 'var(--pb)',
    bg: 'var(--pb-light)',
  },
  {
    key: 'total_tarjeta',
    label: 'Cobrado con tarjeta prepago',
    icon: CreditCard,
    color: 'var(--teal)',
    bg: 'var(--teal-light)',
  },
  {
    key: 'total_efectivo',
    label: 'Cobrado en efectivo',
    icon: Banknote,
    color: 'var(--amber-ink)',
    bg: 'var(--yellow-light)',
  },
  {
    key: 'total_recargas_efectivo',
    label: 'Recargas en efectivo',
    icon: Wallet,
    color: 'var(--violet)',
    bg: 'var(--violet-light)',
  },
];

export default function ResumenCierreCaja({ resumen }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {TARJETAS.map(({ key, label, icon: Icon, color, bg }) => (
        <div
          key={key}
          className="rounded-2xl p-4 sm:p-5 flex flex-col gap-3"
          style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}
        >
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{ background: bg, color }}
          >
            <Icon size={20} />
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>
              {label}
            </p>
            <p className="text-2xl font-bold font-mono mt-1" style={{ color: 'var(--jet)' }}>
              ${parseFloat(resumen?.[key] || 0).toFixed(2)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
