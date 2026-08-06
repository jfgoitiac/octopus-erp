const TrendBadge = ({ val }) => {
    if (val === null) return null;
    const up = val >= 0;
    return (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: up ? '#dcfce7' : 'var(--red-light)', color: up ? '#16a34a' : 'var(--red)' }}>
            {up ? '↑' : '↓'}
            {Math.abs(val).toFixed(1)}%
        </span>
    );
};

export default TrendBadge;
