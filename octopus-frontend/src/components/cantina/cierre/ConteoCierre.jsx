import { Banknote, Coins, Loader2 } from 'lucide-react';
import EstadoDiferencia from './EstadoDiferencia';
import { formatoMoneda, montoParaCampo, parsearMonto } from './calculosCierre';

const FILAS = {
  usd: { titulo: 'Dólares en gaveta', icono: Banknote, prefijo: '$', relleno: 'pl-9' },
  ves: { titulo: 'Bolívares en gaveta', icono: Coins, prefijo: 'Bs', relleno: 'pl-11' },
};

const ANILLO_FOCO = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pb-mid)]';

function FilaConteo({ moneda, valor, esperado, estado, onCambiar, entradaRef, soloLectura }) {
  const { titulo, icono: Icono, prefijo, relleno } = FILAS[moneda];
  const idCampo = `cierre-conteo-${moneda}`;
  const idEstado = `${idCampo}-estado`;

  // Al salir del campo se muestra cómo se leyó el monto ("1.234" → "1.234,00").
  const normalizar = () => {
    const n = parsearMonto(valor);
    if (n !== null) onCambiar(montoParaCampo(n));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={idCampo} className="flex items-center gap-2 text-sm sm:text-base font-semibold" style={{ color: 'var(--jet)' }}>
        <Icono size={18} aria-hidden="true" style={{ color: 'var(--jet-mid)' }} />
        {titulo}
      </label>
      {esperado !== null && (
        <p className="text-sm tabular-nums" style={{ color: 'var(--jet-mid)' }}>
          Debes tener <span className="font-semibold" style={{ color: 'var(--jet)' }}>{formatoMoneda(esperado, moneda)}</span>
        </p>
      )}
      <div className="relative">
        <span
          aria-hidden="true"
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-semibold pointer-events-none"
          style={{ color: 'var(--jet-mid)' }}
        >
          {prefijo}
        </span>
        <input
          ref={entradaRef}
          id={idCampo}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          readOnly={soloLectura}
          value={valor}
          onChange={(e) => onCambiar(e.target.value)}
          onBlur={normalizar}
          placeholder="0,00"
          aria-describedby={idEstado}
          aria-invalid={estado.tipo === 'invalido'}
          className={`w-full h-14 ${relleno} pr-3 rounded-xl text-lg sm:text-xl font-semibold tabular-nums ${ANILLO_FOCO}`}
          style={{
            background: '#fff',
            color: 'var(--jet)',
            border: `1px solid ${estado.tipo === 'invalido' ? 'var(--red)' : 'var(--border-md)'}`,
          }}
        />
      </div>
      <EstadoDiferencia id={idEstado} tipo={estado.tipo} texto={estado.texto} enVivo />
    </div>
  );
}

// Panel de conteo. Es un <form> para que Enter abra la revisión desde cualquier
// campo; nunca cierra la caja por sí mismo.
export default function ConteoCierre({
  conteos, esperados, estados, observaciones, hayDiferencia, revisando,
  onCambiarConteo, onCambiarObservaciones, onRevisar, refUsd, refVes,
}) {
  const enviar = (e) => {
    e.preventDefault();
    onRevisar();
  };

  return (
    <form
      onSubmit={enviar}
      noValidate
      aria-label="Conteo de la gaveta"
      className="rounded-2xl p-4 sm:p-5 flex flex-col gap-5 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto scroll-fino"
      style={{ background: '#fff', border: '0.5px solid var(--border-md)', boxShadow: 'var(--shadow-sm)' }}
    >
      <FilaConteo
        moneda="usd"
        valor={conteos.usd}
        esperado={esperados.usd}
        estado={estados.usd}
        onCambiar={(v) => onCambiarConteo('usd', v)}
        entradaRef={refUsd}
        soloLectura={revisando}
      />
      <FilaConteo
        moneda="ves"
        valor={conteos.ves}
        esperado={esperados.ves}
        estado={estados.ves}
        onCambiar={(v) => onCambiarConteo('ves', v)}
        entradaRef={refVes}
        soloLectura={revisando}
      />

      <div
        className="flex flex-col gap-1.5 rounded-xl transition-colors"
        style={hayDiferencia ? { background: 'var(--yellow-light)', padding: '0.75rem' } : undefined}
      >
        <label htmlFor="cierre-observaciones" className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
          Observaciones <span className="font-normal" style={{ color: 'var(--jet-mid)' }}>(opcional)</span>
        </label>
        <textarea
          id="cierre-observaciones"
          rows={hayDiferencia ? 3 : 2}
          value={observaciones}
          onChange={(e) => onCambiarObservaciones(e.target.value)}
          placeholder={hayDiferencia ? 'Explica la diferencia' : 'Algo que deba saber quien revise'}
          className={`w-full px-3 py-2.5 rounded-xl text-base resize-none ${ANILLO_FOCO}`}
          style={{
            background: '#fff',
            color: 'var(--jet)',
            border: `1px solid ${hayDiferencia ? 'var(--amber-ink)' : 'var(--border-md)'}`,
          }}
        />
      </div>

      <button
        type="submit"
        disabled={revisando}
        className={`w-full min-h-14 shrink-0 flex items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold text-white disabled:opacity-60 ${ANILLO_FOCO}`}
        style={{ background: 'var(--pb-mid)' }}
      >
        {revisando && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
        {revisando ? 'Revisando cifras...' : 'Revisar y cerrar'}
      </button>
    </form>
  );
}
