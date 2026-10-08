// Etapa de Cobranza Inteligente con semáforo. Color + texto (nunca solo color).
const ETAPAS = {
    preventiva: { label: 'Preventiva', fondo: 'var(--green-light)', color: 'var(--green)' },
    vencida: { label: 'Vencida', fondo: 'var(--yellow-light)', color: 'var(--yellow)' },
    seguimiento: { label: 'Seguimiento', fondo: 'var(--yellow-light)', color: 'var(--yellow)' },
    prioritaria: { label: 'Prioritaria', fondo: 'var(--red-light)', color: 'var(--red)' },
    critica: { label: 'Crítica', fondo: 'var(--red-light)', color: 'var(--red)' },
    pausada: { label: 'Pausada', fondo: 'var(--ash-light)', color: 'var(--ash)' },
    cerrada: { label: 'Cerrada', fondo: 'var(--ash-light)', color: 'var(--ash)' },
};

const EtapaCobranza = ({ etapa }) => {
    const info = ETAPAS[etapa];
    if (!info) {
        return <span className="text-xs" style={{ color: 'var(--ash)' }}>—</span>;
    }
    return (
        <span
            className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
            style={{ background: info.fondo, color: info.color }}
        >
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: info.color }} />
            {info.label}
        </span>
    );
};

export default EtapaCobranza;
