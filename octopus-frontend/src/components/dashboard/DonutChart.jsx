import { memo, useMemo } from 'react';

const DonutChart = memo(({ data, size = 180, thickness = 28, label = 'alumnos' }) => {
    const cx   = size / 2;
    const cy   = size / 2;
    const r    = (size - thickness) / 2;
    const circ = 2 * Math.PI * r;

    // Arc geometry is pure math — memoize so it only runs when data or size changes.
    const { total, segments, ariaLabel } = useMemo(() => {
        const total = data.reduce((s, d) => s + (d.value || 0), 0);
        const ariaLabel = total === 0
            ? 'Sin datos'
            : data.map(d => `${d.label}: ${d.value}`).join(', ');

        if (total === 0) return { total, segments: [], ariaLabel };

        let cumulative = 0;
        const segments = data.map(d => {
            const pct    = d.value / total;
            const dash   = pct * circ;
            const gap    = circ - dash;
            const rotate = (cumulative / total) * 360 - 90;
            cumulative  += d.value;
            return { ...d, dash, gap, rotate };
        });
        return { total, segments, ariaLabel };
    }, [data, circ]);

    if (total === 0) return (
        <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size }}
            role="img" aria-label="Sin datos">
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border-md)" strokeWidth={thickness} />
            <text x={cx} y={cy + 5} textAnchor="middle" fontSize={11} fill="var(--ash)">Sin datos</text>
        </svg>
    );

    return (
        <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size }}
            role="img" aria-label={ariaLabel}>
            <title>{ariaLabel}</title>
            {segments.map((seg) => (
                <circle
                    key={seg.label}
                    cx={cx} cy={cy} r={r}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth={thickness}
                    strokeDasharray={`${seg.dash} ${seg.gap}`}
                    strokeLinecap="butt"
                    transform={`rotate(${seg.rotate} ${cx} ${cy})`}
                    style={{ transition: 'stroke-dasharray 0.5s ease' }}
                />
            ))}
            <text x={cx} y={cy - 6}  textAnchor="middle" fontSize={22} fontWeight="600" fill="var(--jet)">{total}</text>
            <text x={cx} y={cy + 14} textAnchor="middle" fontSize={10} fill="var(--ash)">{label}</text>
        </svg>
    );
});

DonutChart.displayName = 'DonutChart';
export default DonutChart;
