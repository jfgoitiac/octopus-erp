const Bone = ({ className = '' }) => (
    <div
        className={`animate-pulse rounded ${className}`}
        style={{ background: 'var(--border-md)' }}
    />
);

const DashboardSkeleton = () => (
    <div className="flex flex-col gap-5">

        {/* Row 1: 6 KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
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

        {/* Row 2: 3 chart cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
                <div
                    key={i}
                    className="rounded-xl p-4 flex flex-col gap-4"
                    style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)', minHeight: 260 }}
                >
                    <Bone className="h-2.5 w-32" />
                    <div className="flex justify-center flex-1 items-center">
                        <div
                            className="animate-pulse rounded-full"
                            style={{ width: 140, height: 140, background: 'var(--border-md)' }}
                        />
                    </div>
                    <div className="flex justify-center gap-4">
                        <Bone className="h-2.5 w-16" />
                        <Bone className="h-2.5 w-16" />
                    </div>
                </div>
            ))}
        </div>

        {/* Row 3: grade occupancy */}
        <div
            className="rounded-xl p-4"
            style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}
        >
            <Bone className="h-2.5 w-36 mb-4" />
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex flex-col gap-2">
                        <div className="flex justify-between">
                            <Bone className="h-3 w-24" />
                            <Bone className="h-3 w-16" />
                        </div>
                        <Bone className="h-2 w-full rounded-full" />
                    </div>
                ))}
            </div>
        </div>
    </div>
);

export default DashboardSkeleton;
