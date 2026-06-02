const SkeletonFila = () => (
  <div
    className="p-4 rounded-xl animate-pulse flex items-center justify-between"
    style={{ background: 'var(--ash-light)' }}
  >
    <div className="h-4 w-40 rounded" style={{ background: 'var(--border-md)' }} />
    <div className="flex gap-2">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-8 w-24 rounded-lg" style={{ background: 'var(--border-md)' }} />
      ))}
    </div>
  </div>
);

export default SkeletonFila;
