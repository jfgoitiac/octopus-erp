import { AlertTriangle, ClipboardList, Hourglass, Scale } from 'lucide-react';
import { ESTILO_TARJETA, colorDiferencia, usdConSigno } from './CierreFormato';

function Kpi({ icono: Icono, etiqueta, valor, tono = 'var(--jet)', fondoIcono = 'var(--pb-light)', colorIcono = 'var(--pb-mid)' }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl p-3 sm:p-4" style={ESTILO_TARJETA}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background: fondoIcono, color: colorIcono }} aria-hidden="true">
        <Icono size={18} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs uppercase tracking-wider" style={{ color: 'var(--ash)' }}>{etiqueta}</p>
        <p className="truncate font-mono text-lg font-semibold tabular-nums sm:text-xl" style={{ color: tono }}>{valor}</p>
      </div>
    </div>
  );
}

// Resumen de los cierres que se están viendo (la página actual de resultados).
export default function CierreResumenLista({ cierres, total }) {
  const pendientes = cierres.filter((c) => c.estado_revision === 'pendiente' || c.estado_revision === 'observado').length;
  const conDiferencia = cierres.filter((c) => Number(c.diferencia_usd) !== 0).length;
  const neta = cierres.reduce((acc, c) => acc + Number(c.diferencia_usd ?? 0), 0);

  return (
    <section aria-label="Resumen de los cierres mostrados" className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icono={ClipboardList} etiqueta="Cierres encontrados" valor={total} />
        <Kpi icono={Hourglass} etiqueta="Por revisar" valor={pendientes} fondoIcono="var(--yellow-light)" colorIcono="var(--amber-ink)" />
        <Kpi icono={AlertTriangle} etiqueta="Con diferencia" valor={conDiferencia} fondoIcono="var(--red-light)" colorIcono="var(--red)" />
        <Kpi icono={Scale} etiqueta="Diferencia neta" valor={usdConSigno(neta)} tono={colorDiferencia(neta)} fondoIcono="var(--jet-light)" colorIcono="var(--jet-mid)" />
      </div>
      {total > cierres.length && (
        <p className="text-xs" style={{ color: 'var(--ash)' }}>Por revisar, con diferencia y diferencia neta suman solo los cierres de esta página.</p>
      )}
    </section>
  );
}
