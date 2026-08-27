// Refleja la forma real de FilaAlumno (avatar + nombre arriba en mobile,
// fila de 4 botones de estado abajo) para que la carga no salte de layout.
const SkeletonFila = () => (
  <div
    className="rounded-xl overflow-hidden animate-pulse"
    style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}
  >
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full flex-shrink-0" style={{ background: 'var(--ash-light)' }} />
        <div className="h-4 w-32 rounded" style={{ background: 'var(--ash-light)' }} />
      </div>
      <div className="flex gap-2 flex-wrap w-full sm:w-auto">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-11 sm:h-8 w-16 sm:w-24 rounded-lg" style={{ background: 'var(--ash-light)' }} />
        ))}
      </div>
    </div>
  </div>
);

export default SkeletonFila;
