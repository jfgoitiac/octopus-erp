// Tarjeta de dato compartida por Egresos, Detalle de egreso y Tablero: etiqueta, valor y detalle con icono opcional.
export default function DatoResumen({ icono: Icono, etiqueta, valor, detalle, alerta = false, className = '' }) {
  return (
    <article className={`flex items-start justify-between gap-3 rounded-[var(--radius-card)] border p-4 ${alerta ? 'border-[var(--yellow)] bg-[var(--yellow-light)]' : 'border-[var(--border)] bg-[var(--surface)]'} ${className}`}>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ash)]">{etiqueta}</p>
        <p className="mt-1.5 break-words text-xl font-semibold tabular-nums text-[var(--jet)] sm:text-2xl">{valor}</p>
        {detalle && <p className="mt-1 text-xs tabular-nums text-[var(--ash)]">{detalle}</p>}
      </div>
      {Icono && (
        <span className={`grid size-9 shrink-0 place-items-center rounded-[10px] ${alerta ? 'bg-white/60 text-[var(--yellow)]' : 'bg-[var(--pb-light)] text-[var(--pb-mid)]'}`}>
          <Icono size={18} strokeWidth={1.8} aria-hidden="true" />
        </span>
      )}
    </article>
  );
}
