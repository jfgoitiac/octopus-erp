const Bone = ({ className = '', style = {} }) => (
    <div
        className={`animate-pulse rounded ${className}`}
        style={{ background: 'var(--border-md)', ...style }}
    />
);

const InscripcionesSkeleton = () => (
    <div
        className="rounded-[var(--radius-card)] p-[var(--pad-card)] sm:p-[var(--pad-card-lg)] flex flex-col gap-5"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
        <div className="flex items-center justify-between">
            <Bone className="h-4 w-48" />
            <Bone className="h-4 w-24" />
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
                <div
                    key={i}
                    className="rounded-xl p-4 flex flex-col gap-3"
                    style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}
                >
                    <div className="flex items-start justify-between">
                        <Bone className="h-2.5 w-20" />
                        <Bone className="h-7 w-7 rounded-lg" />
                    </div>
                    <Bone className="h-7 w-16" />
                    <Bone className="h-2.5 w-24" />
                </div>
            ))}
        </div>

        {/* Mes actual */}
        <div
            className="rounded-xl p-4 flex flex-col gap-3"
            style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)', minHeight: 140 }}
        >
            <Bone className="h-2.5 w-32" />
            <Bone className="h-8 w-20" />
            <Bone className="h-2.5 w-24" />
        </div>

        {/* Tabla de ocupación por grado */}
        <div
            className="rounded-xl p-4"
            style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}
        >
            <Bone className="h-2.5 w-40 mb-4" />
            <div className="flex flex-col gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Bone key={i} className="h-8 w-full" />
                ))}
            </div>
        </div>
    </div>
);

export default InscripcionesSkeleton;
