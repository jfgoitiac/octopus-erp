export function PageHeader({ titulo, descripcion, acciones, children }) {
  return (
    <div className="mb-[var(--gap-section)] sm:mb-[var(--gap-section-lg)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl truncate" style={{ color: 'var(--jet)', fontWeight: 'var(--fw-semibold)' }}>
            {titulo}
          </h1>
          {descripcion && (
            <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>
              {descripcion}
            </p>
          )}
        </div>
        {acciones && <div className="w-full sm:w-auto">{acciones}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

export default PageHeader;
