// Skeleton del panel ejecutivo: replica la grilla real para que no salte el
// layout al llegar los datos.
const Bloque = ({ className = '' }) => (
  <div className={`animate-pulse rounded-md ${className}`} style={{ background: 'var(--jet-light)' }} />
);

const Tarjeta = ({ filas = 3, className = '' }) => (
  <div
    className={`flex flex-col gap-3 rounded-[var(--radius-card)] p-[var(--pad-card)] sm:p-[var(--pad-card-lg)] ${className}`}
    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
  >
    <div className="flex items-center gap-2.5">
      <Bloque className="size-8 rounded-lg" />
      <Bloque className="h-4 w-1/3" />
    </div>
    {Array.from({ length: filas }, (_, i) => (
      <Bloque key={i} className="h-11 w-full rounded-lg" />
    ))}
  </div>
);

const PanelSkeleton = () => (
  <div className="flex flex-col gap-4 sm:gap-5" aria-busy="true" aria-label="Cargando panel">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`flex flex-col gap-2.5 rounded-[var(--radius-card)] p-[var(--pad-card)] sm:p-[var(--pad-card-lg)] ${i === 2 ? 'sm:col-span-2 lg:col-span-1' : ''}`}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <Bloque className="h-3 w-16" />
          <Bloque className="h-8 w-2/3" />
          <Bloque className="h-5 w-1/2 rounded-full" />
        </div>
      ))}
    </div>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Tarjeta filas={2} />
      <Tarjeta filas={3} />
    </div>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Tarjeta filas={4} />
      <Tarjeta filas={2} />
      <Tarjeta filas={3} />
    </div>
  </div>
);

export default PanelSkeleton;
