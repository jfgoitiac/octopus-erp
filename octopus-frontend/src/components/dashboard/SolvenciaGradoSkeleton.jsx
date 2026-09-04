const Bone = ({ className = '', style = {} }) => (
    <div
        className={`animate-pulse rounded ${className}`}
        style={{ background: 'var(--border-md)', ...style }}
    />
);

const SolvenciaGradoSkeleton = () => (
    <div
        className="rounded-[var(--radius-card)] p-[var(--pad-card)] sm:p-[var(--pad-card-lg)] flex flex-col gap-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Bone className="h-4 w-40" />
            <div className="flex gap-2">
                <Bone className="h-8 w-28 rounded-lg" />
                <Bone className="h-8 w-32 rounded-lg" />
            </div>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
            {Array.from({ length: 6 }).map((_, i) => (
                <div
                    key={i}
                    className="shrink-0 w-40 sm:w-44 rounded-xl p-4 flex flex-col gap-3"
                    style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)', height: 112 }}
                >
                    <Bone className="h-2.5 w-24" />
                    <Bone className="h-5 w-20" />
                    <Bone className="h-2.5 w-16" />
                </div>
            ))}
        </div>
    </div>
);

export default SolvenciaGradoSkeleton;
