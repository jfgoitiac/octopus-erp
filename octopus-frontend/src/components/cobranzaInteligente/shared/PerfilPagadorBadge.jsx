// Colores por código del perfil de pagador (docs/CONTRATO_COBRANZA_V4_FASE_D.md §2).
const ESTILOS = {
    puntual: { fondo: 'var(--green-light, #e6f4ea)', color: 'var(--green)' },
    paga_tarde: { fondo: 'var(--yellow-light)', color: 'var(--jet)' },
    moroso_nuevo: { fondo: 'var(--ash-light)', color: 'var(--yellow)' },
    cronico: { fondo: 'var(--red-light, #fdeaea)', color: 'var(--red)' },
    sin_historial: { fondo: 'var(--ash-light)', color: 'var(--ash)' },
};

/** Insignia del perfil de pagador. `perfil` = { codigo, etiqueta }; sin dato muestra un guion. */
export function PerfilPagadorBadge({ perfil, cargando = false }) {
    if (!perfil?.codigo) {
        return <span className="text-xs" style={{ color: 'var(--ash)' }}>{cargando ? '…' : '—'}</span>;
    }
    const e = ESTILOS[perfil.codigo] || ESTILOS.sin_historial;
    return (
        <span data-testid="perfil-pagador" className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
            style={{ background: e.fondo, color: e.color }}>
            {perfil.etiqueta || perfil.codigo}
        </span>
    );
}

export default PerfilPagadorBadge;
