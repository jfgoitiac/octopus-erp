/**
 * Skeleton loader genérico reutilizable — evita duplicar `animate-pulse` en
 * cada página/bloque mientras cargan datos.
 */
const Skeleton = ({ className = '' }) => (
  <div className={`animate-pulse rounded-md bg-[var(--border)] ${className}`} />
);

export default Skeleton;
