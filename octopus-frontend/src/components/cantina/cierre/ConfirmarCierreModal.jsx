import { CloudOff, Loader2, RotateCw, TriangleAlert } from 'lucide-react';
import { Modal } from '../../ui/Modal';
import EstadoDiferencia from './EstadoDiferencia';
import { formatoMoneda } from './calculosCierre';

const NOMBRE_MONEDA = { usd: 'Dólares', ves: 'Bolívares' };

const BOTON = 'w-full sm:w-auto min-h-[44px] flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60';

function BloqueMoneda({ moneda, contado, esperado, estado }) {
  return (
    <div className="rounded-xl p-3 sm:p-4 flex flex-col gap-2 min-w-0" style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}>
      <h4 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>{NOMBRE_MONEDA[moneda]}</h4>
      <dl className="flex flex-col gap-1 text-sm">
        <div className="flex justify-between gap-3">
          <dt style={{ color: 'var(--jet-mid)' }}>Contado</dt>
          <dd className="font-semibold tabular-nums text-right" style={{ color: 'var(--jet)' }}>{formatoMoneda(contado, moneda)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt style={{ color: 'var(--jet-mid)' }}>Esperado</dt>
          <dd className="tabular-nums text-right" style={{ color: 'var(--jet)' }}>
            {esperado === null ? '—' : formatoMoneda(esperado, moneda)}
          </dd>
        </div>
      </dl>
      <EstadoDiferencia tipo={estado.tipo} texto={estado.texto} />
    </div>
  );
}

function AvisoCambios({ cambios }) {
  return (
    <div role="alert" className="rounded-xl p-3 flex gap-2.5" style={{ background: 'var(--yellow-light)', color: 'var(--jet)' }}>
      <TriangleAlert size={18} aria-hidden="true" className="shrink-0 mt-0.5" style={{ color: 'var(--amber-ink)' }} />
      <div className="text-sm flex flex-col gap-1 min-w-0">
        <p className="font-semibold">Las cifras cambiaron mientras contabas</p>
        {cambios.map((c) => (
          <p key={c.moneda} className="tabular-nums">
            {NOMBRE_MONEDA[c.moneda]}: debías tener {formatoMoneda(c.antes, c.moneda)}, ahora {formatoMoneda(c.despues, c.moneda)}.
          </p>
        ))}
        <p>Revisa el conteo antes de cerrar.</p>
      </div>
    </div>
  );
}

// Confirmación del cierre. fase: 'cargando' | 'lista' | 'error'. Solo en 'lista'
// existe el botón de cerrar: sin cifras frescas no se cierra a ciegas.
export default function ConfirmarCierreModal({
  abierto, fase, errorRefresco, errorEnvio, cambios, contados, esperados, estados, nota,
  enviando, onVolver, onReintentar, onConfirmar,
}) {
  const footer = (
    <>
      <button
        type="button"
        onClick={onVolver}
        disabled={enviando}
        className={BOTON}
        style={{ background: '#fff', color: 'var(--jet)', border: '0.5px solid var(--border-md)' }}
      >
        Volver a contar
      </button>
      {fase === 'lista' && (
        <button
          type="button"
          onClick={onConfirmar}
          disabled={enviando}
          className={`${BOTON} text-white`}
          style={{ background: 'var(--pb-mid)' }}
        >
          {enviando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
          {enviando ? 'Cerrando...' : 'Cerrar caja'}
        </button>
      )}
      {fase === 'error' && (
        <button
          type="button"
          onClick={onReintentar}
          className={`${BOTON} text-white`}
          style={{ background: 'var(--pb-mid)' }}
        >
          <RotateCw size={16} aria-hidden="true" />
          Reintentar
        </button>
      )}
    </>
  );

  return (
    <Modal open={abierto} onClose={onVolver} titulo="¿Cerrar esta caja?" footer={footer} size="lg" bodyClassName="p-4 sm:p-6">
      {fase === 'cargando' && (
        <p role="status" className="flex items-center gap-2 text-sm py-6" style={{ color: 'var(--jet-mid)' }}>
          <Loader2 size={16} className="animate-spin shrink-0" aria-hidden="true" />
          Consultando las cifras de la caja...
        </p>
      )}

      {fase === 'error' && (
        <div role="alert" className="flex gap-2.5" style={{ color: 'var(--jet)' }}>
          <CloudOff size={20} aria-hidden="true" className="shrink-0 mt-0.5" style={{ color: 'var(--red)' }} />
          <div className="text-sm flex flex-col gap-1 min-w-0">
            <p className="font-semibold">No pudimos confirmar las cifras de la caja</p>
            <p style={{ color: 'var(--jet-mid)' }}>{errorRefresco}</p>
            <p>La caja sigue abierta. Reintenta para poder cerrarla.</p>
          </div>
        </div>
      )}

      {fase === 'lista' && (
        <div className="flex flex-col gap-4">
          {cambios.length > 0 && <AvisoCambios cambios={cambios} />}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {['usd', 'ves'].map((moneda) => (
              <BloqueMoneda
                key={moneda}
                moneda={moneda}
                contado={contados[moneda]}
                esperado={esperados[moneda]}
                estado={estados[moneda]}
              />
            ))}
          </div>

          {nota && (
            <div className="text-sm min-w-0">
              <p className="font-medium" style={{ color: 'var(--jet-mid)' }}>Nota</p>
              <p className="whitespace-pre-wrap break-words" style={{ color: 'var(--jet)' }}>{nota}</p>
            </div>
          )}

          <p className="text-sm sm:text-base font-semibold" style={{ color: 'var(--jet)' }}>
            No podrás seguir vendiendo en esta caja.
          </p>

          {errorEnvio && (
            <p role="alert" className="flex items-start gap-2 text-sm font-medium" style={{ color: 'var(--red)' }}>
              <TriangleAlert size={16} aria-hidden="true" className="shrink-0 mt-0.5" />
              <span className="min-w-0 break-words">{errorEnvio}</span>
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
