export function Card({ titulo, subtitulo, accion, children, padding = 'normal', className = '' }) {
  const paddingClass = padding === 'none'
    ? ''
    : 'p-[var(--pad-card)] sm:p-[var(--pad-card-lg)]';

  return (
    <div
      className={`w-full rounded-[var(--radius-card)] ${paddingClass} ${className}`}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {(titulo || accion) && (
        <div
          className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3 ${padding === 'none' ? 'p-[var(--pad-card)] sm:p-[var(--pad-card-lg)] pb-0' : ''}`}
        >
          <div className="min-w-0">
            {titulo && (
              <h3 className="text-sm sm:text-base truncate" style={{ color: 'var(--jet)', fontWeight: 'var(--fw-semibold)' }}>
                {titulo}
              </h3>
            )}
            {subtitulo && (
              <p className="text-xs sm:text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
                {subtitulo}
              </p>
            )}
          </div>
          {accion && <div className="w-full sm:w-auto">{accion}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export default Card;
