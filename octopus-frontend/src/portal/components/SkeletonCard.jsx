/**
 * SkeletonLine — una sola línea de placeholder animada.
 * Props: width (ej. 'w-full', 'w-3/4'), height (ej. 'h-4'), className
 */
export const SkeletonLine = ({ width = 'w-full', height = 'h-4', className = '' }) => (
  <div
    className={`portal-skeleton animate-pulse ${width} ${height} ${className}`}
  />
);

/**
 * SkeletonCard — card completa con N líneas de placeholder.
 * Imita la tarjeta del portal: título ancho arriba y líneas con aire.
 * Props: lines (número de líneas), className
 */
const SkeletonCard = ({ lines = 3, className = '' }) => (
  <div className={`portal-card portal-card--soft p-5 sm:p-6 space-y-4 ${className}`} aria-busy="true" aria-label="Cargando">
    <SkeletonLine width="w-2/5" height="h-5" />
    <div className="space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine
          key={i}
          width={i % 2 === 0 ? 'w-full' : 'w-4/5'}
          height="h-4"
        />
      ))}
    </div>
  </div>
);

export default SkeletonCard;
