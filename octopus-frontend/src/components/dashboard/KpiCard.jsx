import { useState, useRef } from 'react';

const KpiCard = ({ icon: Icon, label, value, sub, accent, iconBg, iconColor, delay = 0 }) => {
    const [hovered, setHovered] = useState(false);
    const touchTimer = useRef(null);

    const activate   = () => setHovered(true);
    const deactivate = () => setHovered(false);
    const onTouchEnd = () => {
        touchTimer.current = setTimeout(deactivate, 200);
    };
    const onTouchStart = () => {
        clearTimeout(touchTimer.current);
        activate();
    };

    return (
        <div
            className="rounded-xl p-4 flex flex-col gap-2 anim-scale-in card-lift cursor-default"
            style={{
                background: 'var(--porcelain)',
                border: `0.5px solid ${hovered ? `${accent}55` : 'var(--border-md)'}`,
                borderLeft: `3px solid ${accent}`,
                animationDelay: `${delay}ms`,
                boxShadow: hovered ? `0 8px 28px ${accent}28, 0 2px 8px ${accent}14` : undefined,
                transform: hovered ? 'translateY(-2px)' : undefined,
                transition: 'box-shadow 0.2s ease, transform 0.2s ease, border-color 0.2s ease',
            }}
            onMouseEnter={activate}
            onMouseLeave={deactivate}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
        >
            <div className="flex items-start justify-between">
                <span className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>{label}</span>
                <div className="p-1.5 rounded-lg" style={{ background: iconBg, color: iconColor }}>
                    <Icon size={15} />
                </div>
            </div>
            <p className="text-2xl font-semibold leading-none" style={{ color: 'var(--jet)' }}>{value}</p>
            {sub && <p className="text-[11px]" style={{ color: 'var(--ash)' }}>{sub}</p>}
        </div>
    );
};

export default KpiCard;
