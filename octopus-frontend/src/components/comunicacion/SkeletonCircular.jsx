const SkeletonCircular = () => (
  <div
    className="p-4 rounded-xl animate-pulse space-y-3"
    style={{ background: 'var(--ash-light)' }}
  >
    <div className="flex items-center justify-between">
      <div className="h-4 w-48 rounded" style={{ background: 'var(--border-md)' }} />
      <div className="h-5 w-20 rounded-full" style={{ background: 'var(--border-md)' }} />
    </div>
    <div className="h-3 w-full rounded" style={{ background: 'var(--border-md)' }} />
    <div className="h-3 w-2/3 rounded" style={{ background: 'var(--border-md)' }} />
  </div>
);

export default SkeletonCircular;
