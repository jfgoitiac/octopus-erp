// Refleja la forma de la pantalla de inicio del pase de lista (tarjeta con
// avatar, título, datos y botón principal) para que la carga no salte de layout.
const Bloque = ({ className = '' }) => (
  <div className={`rounded-lg ${className}`} style={{ background: 'var(--ash-light)' }} />
);

const SkeletonTarjeta = () => (
  <div className="mx-auto w-full max-w-md" role="status" aria-label="Cargando alumnos">
    <div
      className="animate-pulse rounded-2xl bg-white p-5 sm:p-6"
      style={{ border: '0.5px solid var(--border-md)', boxShadow: '0 12px 32px -8px rgba(43,48,58,0.12)' }}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <Bloque className="h-16 w-16 rounded-2xl" />
        <Bloque className="h-5 w-40" />
        <Bloque className="h-3.5 w-28" />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Bloque className="h-14 rounded-xl" />
        <Bloque className="h-14 rounded-xl" />
      </div>
      <Bloque className="mt-6 h-14 w-full rounded-xl" />
    </div>
  </div>
);

export default SkeletonTarjeta;
