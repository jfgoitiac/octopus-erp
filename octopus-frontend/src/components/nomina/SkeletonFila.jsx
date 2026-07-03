const SkeletonFila = () => (
    <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
        {[...Array(6)].map((_, i) => (
            <td key={i} className="px-4 py-3">
                <div className="h-4 rounded animate-pulse" style={{ width: i === 0 ? '70%' : '50%', background: 'var(--border-md)' }} />
            </td>
        ))}
    </tr>
);

export default SkeletonFila;
