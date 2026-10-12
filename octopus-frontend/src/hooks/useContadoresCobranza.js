/**
 * Contadores del badge de la entrada "Cobranza Inteligente" del sidebar
 * (no leídos + tarjetas urgentes).
 *
 * TODO(Fase A, backend): conectar con `getContadoresInteligente` (GET cobranza/inteligente/contadores/)
 * usando `usePolling` cuando el endpoint exista. Mientras tanto devuelve 0 y el badge no se muestra.
 */
export function useContadoresCobranza() {
    return { total: 0 };
}

export default useContadoresCobranza;
