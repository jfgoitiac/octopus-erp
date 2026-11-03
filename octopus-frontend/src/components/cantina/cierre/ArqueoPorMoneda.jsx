import { Banknote, Coins } from 'lucide-react';
import EstadoDiferencia from './EstadoDiferencia';
import { arqueoPorMoneda, formatoMoneda, formatoVes } from './calculosCierre';

const MONEDAS = {
  usd: { titulo: 'Dólares en gaveta', icono: Banknote },
  ves: { titulo: 'Bolívares en gaveta', icono: Coins },
};

// Contado frente a esperado de cada moneda de un cierre ya guardado. No pinta
// nada en cierres antiguos, que solo guardaron el conteo total en USD.
export default function ArqueoPorMoneda({ cierre }) {
  const arqueo = arqueoPorMoneda(cierre);
  if (!arqueo) return null;

  return (
    <section className="flex flex-col gap-3 min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-base sm:text-lg font-semibold" style={{ color: 'var(--jet)' }}>Arqueo por moneda</h2>
        {arqueo.tasa !== null && (
          <p className="text-sm tabular-nums" style={{ color: 'var(--jet-mid)' }}>
            Tasa del turno {formatoVes(arqueo.tasa)} por $
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {arqueo.filas.map(({ moneda, contado, esperado, estado }) => {
          const { titulo, icono: Icono } = MONEDAS[moneda];
          return (
            <div
              key={moneda}
              className="rounded-xl p-4 flex flex-col gap-2 min-w-0"
              style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}
            >
              <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--jet)' }}>
                <Icono size={18} aria-hidden="true" style={{ color: 'var(--jet-mid)' }} />
                {titulo}
              </p>
              <p className="text-xl sm:text-2xl font-semibold tabular-nums break-words" style={{ color: 'var(--jet)' }}>
                {formatoMoneda(contado, moneda)}
              </p>
              <p className="text-sm tabular-nums" style={{ color: 'var(--jet-mid)' }}>
                Debía haber {esperado === null ? '—' : formatoMoneda(esperado, moneda)}
              </p>
              <EstadoDiferencia tipo={estado.tipo} texto={estado.texto} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
