import { memo, useRef } from 'react';

// Hover handled via direct DOM mutation — avoids 6 React re-render cycles per mouse event.
const KpiCard = memo(({
    icon: Icon, label, value, sub, accent, iconBg, iconColor, delay = 0,
    confidence = 100, provenance,
}) => {
    const cardRef = useRef(null);

    const handleMouseEnter = () => {
        const el = cardRef.current;
        if (!el) return;
        el.style.boxShadow = `0 8px 28px ${accent}28, 0 2px 8px ${accent}14`;
        el.style.transform = 'translateY(-2px)';
        el.style.borderColor = `${accent}55`;
    };

    const handleMouseLeave = () => {
        const el = cardRef.current;
        if (!el) return;
        el.style.boxShadow = '';
        el.style.transform = '';
        el.style.borderColor = 'var(--border-md)';
    };

    return (
        <div
            ref={cardRef}
            className="rounded-[var(--radius-card)] p-4 flex flex-col gap-2 anim-scale-in card-lift cursor-default"
            style={{
                background: 'var(--porcelain)',
                border: `0.5px solid var(--border-md)`,
                borderLeft: `3px solid ${accent}`,
                animationDelay: `${delay}ms`,
                transition: 'box-shadow 0.2s ease, transform 0.2s ease, border-color 0.2s ease',
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <div className="flex items-start justify-between">
                <span className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>{label}</span>
                <div className="p-1.5 rounded-lg" style={{ background: iconBg, color: iconColor }}>
                    <Icon size={15} />
                </div>
            </div>
            <p className="text-2xl font-semibold leading-none" style={{ color: 'var(--jet)' }}>{value}</p>
            {sub && <p className="text-[11px]" style={{ color: 'var(--ash)' }}>{sub}</p>}
            <div className="flex items-center justify-between gap-2 mt-0.5">
                <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ background: confidence >= 80 ? '#dcfce7' : '#fef3c7', color: confidence >= 80 ? '#166534' : '#92400e' }}
                    title={provenance ? `Confianza calculada: ${confidence}%. ${provenance}` : `Confianza calculada: ${confidence}%`}
                >
                    Confianza {confidence}%
                </span>
                {provenance && <span className="text-[10px] truncate" style={{ color: 'var(--ash)' }} title={provenance}>Ver origen</span>}
            </div>
        </div>
    );
});

KpiCard.displayName = 'KpiCard';
export default KpiCard;
