/** Pantalla que se muestra cuando Cobranza Inteligente está apagada en la sede (HTTP 409). */
export function ModuloApagado({ children = 'Cobranza Inteligente está apagada en esta sede.' }) {
    return (
        <p className="text-sm text-center py-8" style={{ color: 'var(--ash)' }}>{children}</p>
    );
}

export default ModuloApagado;
