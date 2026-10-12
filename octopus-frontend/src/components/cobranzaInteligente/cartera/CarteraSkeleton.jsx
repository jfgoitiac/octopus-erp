/** Skeleton de la pestaña Cartera: barra de filtros + filas/tarjetas. */
export function CarteraSkeleton({ filas = 5 }) {
    return (
        <div className="space-y-3 animate-pulse" role="status" aria-label="Cargando cartera">
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                <div className="h-10 w-full sm:w-72 rounded-xl" style={{ background: 'var(--ash-light)' }} />
                <div className="h-10 w-full sm:w-40 rounded-xl" style={{ background: 'var(--ash-light)' }} />
            </div>
            {Array.from({ length: filas }, (_, i) => (
                <div key={i} className="h-20 rounded-2xl" style={{ background: 'var(--ash-light)' }} />
            ))}
        </div>
    );
}

export default CarteraSkeleton;
