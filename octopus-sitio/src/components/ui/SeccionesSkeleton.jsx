import Skeleton from './Skeleton';

/** Skeleton compartido para páginas que cargan `secciones` (Home/PaginaDinamica). */
const SeccionesSkeleton = () => (
  <div className="contenedor py-12 space-y-8">
    <Skeleton className="h-64 w-full" />
    <Skeleton className="h-40 w-full" />
    <Skeleton className="h-40 w-full" />
  </div>
);

export default SeccionesSkeleton;
