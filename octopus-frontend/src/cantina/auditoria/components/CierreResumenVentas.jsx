import { Ban, History, Keyboard, MessageSquareText, Percent, ShoppingBag } from 'lucide-react';
import { ESTILO_TARJETA, fmtFechaHora } from './CierreFormato';

function Contador({ icono: Icono, etiqueta, valor, alerta }) {
  const activo = alerta && Number(valor) > 0;
  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-1"
      style={{ background: activo ? 'var(--yellow-light)' : 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}
    >
      <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: activo ? 'var(--amber-ink)' : 'var(--ash)' }}>
        <Icono size={14} aria-hidden="true" />
        {etiqueta}
      </span>
      <span className="text-xl font-semibold tabular-nums" style={{ color: 'var(--jet)' }}>{valor ?? 0}</span>
    </div>
  );
}

// Resumen de ventas del turno, observaciones del cajero y reaperturas.
export default function CierreResumenVentas({ resumen, observaciones, reaperturas = [] }) {
  return (
    <section className="rounded-2xl p-4 sm:p-5 flex flex-col gap-4" style={ESTILO_TARJETA} aria-labelledby="cierre-resumen-ventas">
      <h2 id="cierre-resumen-ventas" className="font-semibold text-sm" style={{ color: 'var(--jet)' }}>Ventas del turno</h2>
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <Contador icono={ShoppingBag} etiqueta="Ventas" valor={resumen?.cantidad} />
        <Contador icono={Ban} etiqueta="Anuladas" valor={resumen?.anuladas} alerta />
        <Contador icono={Percent} etiqueta="Con descuento" valor={resumen?.con_descuento} alerta />
        <Contador icono={Keyboard} etiqueta="Manuales" valor={resumen?.manuales} alerta />
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest" style={{ color: 'var(--ash)' }}>
          <MessageSquareText size={14} aria-hidden="true" />
          Observaciones del cajero
        </h3>
        {observaciones ? (
          <p className="text-sm rounded-xl p-3 whitespace-pre-line break-words" style={{ background: 'var(--porcelain)', color: 'var(--jet)', border: '0.5px solid var(--border)' }}>
            {observaciones}
          </p>
        ) : (
          <p className="text-sm italic" style={{ color: 'var(--ash)' }}>El cajero no dejó observaciones.</p>
        )}
      </div>

      {reaperturas.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest" style={{ color: 'var(--violet)' }}>
            <History size={14} aria-hidden="true" />
            Reaperturas
          </h3>
          <ul className="flex flex-col gap-2">
            {reaperturas.map((r) => (
              <li key={r.id} className="text-sm rounded-xl p-3" style={{ background: 'var(--violet-light)', color: 'var(--jet)' }}>
                <p className="break-words">{r.motivo}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--jet-mid)' }}>
                  Autorizó {r.autorizado_por?.nombre ?? '—'} · {fmtFechaHora(r.creado_en)} · nueva apertura #{r.apertura_nueva_id}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
