const Bone = ({ className = '' }) => (
    <div
        className={`animate-pulse rounded ${className}`}
        style={{ background: 'var(--border-md)' }}
    />
);

const SkeletonRow = () => (
    <tr style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
        {/* Alumno */}
        <td className="px-4 py-3">
            <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full animate-pulse flex-shrink-0"
                    style={{ background: 'var(--border-md)' }} />
                <div className="flex flex-col gap-1.5">
                    <Bone className="h-2.5 w-28" />
                    <Bone className="h-2 w-16" />
                </div>
            </div>
        </td>
        {/* Cédula */}
        <td className="px-4 py-3"><Bone className="h-2.5 w-20" /></td>
        {/* Grado */}
        <td className="px-4 py-3"><Bone className="h-5 w-16 rounded-full" /></td>
        {/* Representante */}
        <td className="px-4 py-3">
            <div className="flex flex-col gap-1.5">
                <Bone className="h-2.5 w-28" />
                <Bone className="h-2 w-16" />
            </div>
        </td>
        {/* Teléfono */}
        <td className="px-4 py-3"><Bone className="h-2.5 w-24" /></td>
        {/* Deuda */}
        <td className="px-4 py-3"><Bone className="h-2.5 w-14" /></td>
        {/* Acción */}
        <td className="px-4 py-3"><Bone className="h-7 w-16 rounded-lg" /></td>
    </tr>
);

const MorososSkeleton = ({ rows = 6 }) => (
    <>
        {Array.from({ length: rows }).map((_, i) => (
            <SkeletonRow key={i} />
        ))}
    </>
);

export default MorososSkeleton;
