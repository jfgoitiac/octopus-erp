import { AlertTriangle } from 'lucide-react';
import { fmt } from '../../utils/format';

const CARDS = (count, totalUSD, totalVES, tasaDisponible) => [
    {
        label: 'Alumnos en mora',
        value: count,
        color: '#dc2626',
        bg: '#fef2f2',
        Icon: AlertTriangle,
    },
    {
        label: 'Deuda total (USD)',
        value: `$${fmt(totalUSD, 2)}`,
        color: '#d97706',
        bg: '#fffbeb',
        Icon: null,
    },
    {
        label: 'Deuda total (VES)',
        value: tasaDisponible ? `Bs. ${fmt(totalVES, 0)}` : '—',
        color: '#7c3aed',
        bg: '#f5f3ff',
        Icon: null,
    },
];

const SummaryCard = ({ label, value, color, bg, Icon, loading }) => (
    <div
        className="rounded-xl p-4 flex items-center gap-3"
        style={{
            background: 'var(--porcelain)',
            border: '0.5px solid var(--border-md)',
            borderLeft: `3px solid ${color}`,
        }}
    >
        {Icon && (
            <div className="p-2 rounded-lg flex-shrink-0" style={{ background: bg, color }}>
                <Icon size={16} />
            </div>
        )}
        <div>
            <p className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>
                {label}
            </p>
            {loading ? (
                <div
                    className="animate-pulse rounded mt-1"
                    style={{ height: 24, width: 72, background: 'var(--border-md)' }}
                />
            ) : (
                <p className="text-xl font-semibold" style={{ color }}>
                    {value}
                </p>
            )}
        </div>
    </div>
);

const MorososSummary = ({ count, totalDeudaUSD, tasa, loading }) => {
    const totalVES = totalDeudaUSD * tasa;
    const cards = CARDS(count, totalDeudaUSD, totalVES, tasa > 0);

    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {cards.map(card => (
                <SummaryCard key={card.label} {...card} loading={loading} />
            ))}
        </div>
    );
};

export default MorososSummary;
