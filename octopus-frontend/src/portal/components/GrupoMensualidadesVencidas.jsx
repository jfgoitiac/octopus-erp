import { Check, Minus, Square } from 'lucide-react';
import { fmtMonto, montoEnBs } from '../utils/montos';
import { textoVencimiento } from '../utils/fechas';

const montoDe = (mensualidad) => Number(mensualidad.monto_total ?? mensualidad.saldo ?? mensualidad.monto_usd ?? 0);

const GrupoMensualidadesVencidas = ({
  titulo,
  mensualidades,
  seleccionadas,
  onToggle,
  onToggleGrupo,
  tasaBcv,
  variosAlumnos = false,
  comprobantePorMensualidad = {},
}) => {
  const cantidadSeleccionada = mensualidades.filter((mensualidad) => seleccionadas.has(mensualidad.id)).length;
  const todasSeleccionadas = cantidadSeleccionada === mensualidades.length;
  const algunasSeleccionadas = cantidadSeleccionada > 0 && !todasSeleccionadas;

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--portal-line)] bg-[var(--portal-surface)]" aria-label={titulo}>
      <div className="flex flex-col gap-2 border-b border-[var(--portal-line)] bg-[var(--portal-canvas)] px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div>
          <h4 className="text-sm font-semibold text-[var(--portal-ink)]">{titulo}</h4>
          <p className="text-xs text-[var(--portal-muted)]">
            {cantidadSeleccionada} de {mensualidades.length} seleccionada{cantidadSeleccionada === 1 ? '' : 's'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onToggleGrupo(mensualidades, !todasSeleccionadas)}
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-[var(--portal-tint-ink)] transition-colors hover:bg-[var(--portal-tint)] sm:w-auto"
          aria-pressed={todasSeleccionadas}
        >
          {todasSeleccionadas ? <Check size={17} aria-hidden="true" /> : algunasSeleccionadas ? <Minus size={17} aria-hidden="true" /> : <Square size={17} aria-hidden="true" />}
          {todasSeleccionadas ? `Quitar todo ${titulo}` : `Seleccionar todo ${titulo}`}
        </button>
      </div>

      <ul className="divide-y divide-[var(--portal-line)]">
        {mensualidades.map((mensualidad) => {
          const activa = seleccionadas.has(mensualidad.id);
          const monto = montoDe(mensualidad);
          const comprobanteAnterior = comprobantePorMensualidad[mensualidad.id];
          const rechazo = comprobanteAnterior?.estatus === 'rechazado'
            ? comprobanteAnterior.observaciones
            : null;
          return (
            <li key={mensualidad.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={activa}
                onClick={() => onToggle(mensualidad.id)}
                className={`flex min-h-[64px] w-full items-start gap-3 px-3 py-3 text-left transition-colors sm:px-4 ${activa ? 'bg-[var(--portal-tint)]' : 'hover:bg-[var(--portal-canvas)]'}`}
              >
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${activa ? 'border-[var(--portal-primary)] bg-[var(--portal-primary)] text-white' : 'border-[var(--portal-line)] bg-[var(--portal-surface)] text-transparent'}`} aria-hidden="true">
                  <Check size={15} strokeWidth={3} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[var(--portal-ink)]">
                    {variosAlumnos && mensualidad.alumno_nombre ? mensualidad.alumno_nombre : `${mensualidad.mes_nombre} ${mensualidad.anio}`}
                  </span>
                  <span className="block text-xs font-medium text-[var(--red)]">{textoVencimiento(mensualidad)}</span>
                  {rechazo && (
                    <span className="mt-1 block whitespace-pre-line break-words text-xs text-[var(--red)]">
                      Comprobante anterior rechazado: {rechazo}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block whitespace-nowrap text-sm font-semibold text-[var(--portal-ink)]">REF. {fmtMonto(monto)}</span>
                  {tasaBcv && <span className="block whitespace-nowrap text-xs text-[var(--portal-muted)]">Bs. {fmtMonto(montoEnBs(monto, tasaBcv))}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default GrupoMensualidadesVencidas;
