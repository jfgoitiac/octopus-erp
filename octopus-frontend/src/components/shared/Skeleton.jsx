export const Bone = ({ className = '', style }) => (
    <div
        className={`animate-pulse rounded ${className}`}
        style={{ background: 'var(--border-md)', ...style }}
    />
);

/** Fila de tabla "hueso" genérica: una cada `cols`, para reemplazar el
 * spinner centrado en tablas de reportes mientras cargan. */
export const TableRowSkeleton = ({ cols = 5, rows = 5 }) => (
    <>
        {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                {Array.from({ length: cols }).map((__, c) => (
                    <td key={c} className="px-4 py-3">
                        <Bone className="h-2.5" style={{ width: `${55 + ((r + c) % 4) * 10}%` }} />
                    </td>
                ))}
            </tr>
        ))}
    </>
);

/** Tarjeta "hueso" para grids de cards (KPIs, resúmenes). */
export const CardSkeleton = () => (
    <div className="rounded-xl p-6" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
        <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg animate-pulse" style={{ background: 'var(--border-md)' }} />
            <Bone className="h-2.5 w-24" />
        </div>
        <Bone className="h-7 w-32" />
    </div>
);
