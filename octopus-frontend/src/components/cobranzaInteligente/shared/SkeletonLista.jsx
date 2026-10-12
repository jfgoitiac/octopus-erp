/** Skeleton genérico de lista de tarjetas, para pestañas que aún no tienen contenido propio. */
export function SkeletonLista({ filas = 3, alto = 'h-24' }) {
    return (
        <div className="space-y-3 animate-pulse" aria-hidden="true">
            {Array.from({ length: filas }, (_, i) => (
                <div key={i} className={`${alto} rounded-xl`} style={{ background: 'var(--ash-light)' }} />
            ))}
        </div>
    );
}

export default SkeletonLista;
