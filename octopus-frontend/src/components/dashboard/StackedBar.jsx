import { memo } from 'react';

const StackedBar = memo(({ used, max, height = 10 }) => {
    const pct   = max > 0 ? Math.min(100, (used / max) * 100) : 0;
    const color = pct >= 90 ? '#dc2626' : pct >= 70 ? '#d97706' : '#4f6ef7';

    return (
        <div className="w-full rounded-full overflow-hidden" style={{ height, background: 'var(--border-md)' }}>
            <div style={{
                width: `${pct}%`,
                height: '100%',
                background: color,
                borderRadius: 999,
                transition: 'width 0.6s ease',
            }} />
        </div>
    );
});

StackedBar.displayName = 'StackedBar';
export default StackedBar;
