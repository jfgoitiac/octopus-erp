/**
 * SkeletonLine — una sola línea de placeholder animada.
 * Props: width (ej. 'w-full', 'w-3/4'), height (ej. 'h-4'), className
 */
export const SkeletonLine = ({ width = 'w-full', height = 'h-4', className = '' }) => (
  <div
    className={`animate-pulse bg-gray-200 rounded ${width} ${height} ${className}`}
  />
);

/**
 * SkeletonCard — card completa con N líneas de placeholder.
 * Props: lines (número de líneas), className
 */
const SkeletonCard = ({ lines = 3, className = '' }) => (
  <div className={`bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3 ${className}`}>
    <SkeletonLine width="w-2/5" height="h-3" />
    {Array.from({ length: lines }).map((_, i) => (
      <SkeletonLine
        key={i}
        width={i % 2 === 0 ? 'w-full' : 'w-4/5'}
        height="h-4"
      />
    ))}
  </div>
);

export default SkeletonCard;
