const Bone = ({ className = '', style = {} }) => (
    <div
        className={`animate-pulse rounded ${className}`}
        style={{ background: 'var(--border-md)', ...style }}
    />
);

const PagosConceptoSkeleton = () => (
    <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <Bone className="h-10 w-full sm:w-56 rounded-lg" />
            <Bone className="h-10 w-full sm:w-40 rounded-lg" />
            <Bone className="h-10 w-full sm:w-32 rounded-lg" />
        </div>
        <div
            className="rounded-xl p-4 flex flex-col gap-3"
            style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}
        >
            {Array.from({ length: 6 }).map((_, i) => (
                <Bone key={i} className="h-10 w-full" />
            ))}
        </div>
    </div>
);

export default PagosConceptoSkeleton;
