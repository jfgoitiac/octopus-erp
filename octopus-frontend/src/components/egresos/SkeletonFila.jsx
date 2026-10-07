export default function SkeletonFila({ colSpan = 7 }) {
  return <tr className="animate-pulse"><td colSpan={colSpan} className="p-4"><div className="h-4 rounded bg-slate-200 w-full" /></td></tr>;
}
