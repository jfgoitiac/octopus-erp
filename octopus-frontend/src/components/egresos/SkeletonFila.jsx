export default function SkeletonFila({ colSpan = 7 }) {
  return <tr className="animate-pulse border-t border-slate-100"><td colSpan={colSpan} className="p-4"><div className="h-4 w-full rounded-lg bg-slate-100" /></td></tr>;
}
