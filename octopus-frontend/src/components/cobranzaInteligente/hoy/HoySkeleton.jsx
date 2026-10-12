const Bloque = ({ alto }) => (
    <div className={`${alto} rounded-2xl`} style={{ background: 'var(--ash-light)' }} />
);

/** Esqueleto de la pestaña Hoy: frase, KPIs, tarjetas y gráficos. */
export function HoySkeleton() {
    return (
        <div className="space-y-4 sm:space-y-6 animate-pulse" role="status" aria-label="Cargando Hoy">
            <Bloque alto="h-16" />
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[1, 2, 3, 4].map(i => <Bloque key={i} alto="h-20" />)}
            </div>
            <div className="space-y-3">
                {[1, 2, 3].map(i => <Bloque key={i} alto="h-28" />)}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <Bloque alto="h-56" />
                <Bloque alto="h-56" />
            </div>
        </div>
    );
}

export default HoySkeleton;
