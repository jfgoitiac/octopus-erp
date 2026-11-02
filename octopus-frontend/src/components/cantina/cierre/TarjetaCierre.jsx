// Tarjeta de un dato del cierre. El icono es monocromo: en esta pantalla el
// color se reserva para el estado de la diferencia.
export default function TarjetaCierre({ icono: Icono, titulo, cifra, equivalente, detalle, pie }) {
  return (
    <article
      className="rounded-xl p-4 flex flex-col gap-1 min-w-0"
      style={{ background: '#fff', border: '0.5px solid var(--border-md)' }}
    >
      <div className="flex items-center gap-2 min-w-0">
        {Icono && <Icono size={18} aria-hidden="true" className="shrink-0" style={{ color: 'var(--jet-mid)' }} />}
        <h3 className="text-sm font-medium min-w-0 break-words" style={{ color: 'var(--jet-mid)' }}>{titulo}</h3>
      </div>
      <p className="text-xl sm:text-2xl font-semibold tabular-nums break-words mt-1" style={{ color: 'var(--jet)' }}>
        {cifra}
      </p>
      {equivalente && (
        <p className="text-sm tabular-nums" style={{ color: 'var(--jet-mid)' }}>{equivalente}</p>
      )}
      {detalle && <p className="text-xs sm:text-sm" style={{ color: 'var(--jet-mid)' }}>{detalle}</p>}
      {pie && <p className="text-xs mt-1 tabular-nums" style={{ color: 'var(--jet-mid)' }}>{pie}</p>}
    </article>
  );
}
