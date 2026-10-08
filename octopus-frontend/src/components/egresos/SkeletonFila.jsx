export default function SkeletonFila({ colSpan = 7 }) {
  return <tr className="animate-pulse border-t border-[var(--border)]"><td colSpan={colSpan} className="p-4"><div className="h-4 w-full rounded-lg bg-[var(--surface-sunken)]" /></td></tr>;
}
