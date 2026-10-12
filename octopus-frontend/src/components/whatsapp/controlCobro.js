// Control de envíos de cobro (§1.8): interpreta la clave `control` del
// previsualizar y los errores 400/409 del cobro manual por WhatsApp.
// Con Cobranza Inteligente apagada el backend no manda `control` y todo
// esto devuelve vacío, dejando el flujo idéntico al anterior.

export const avisosModoA = (preview) => preview?.control?.modo_a?.avisos ?? [];

export const bloqueosModoA = (preview) => preview?.control?.modo_a?.bloqueos ?? [];

export const avisosModoB = (preview) => preview?.control?.modo_b?.avisos ?? [];

export const bloqueosModoB = (preview) => preview?.control?.modo_b?.bloqueos ?? [];

/**
 * Clasifica un error de Axios del cobro manual:
 *  - { tipo: 'bloqueado', mensaje, bloqueos }  (400 con `bloqueado`)
 *  - { tipo: 'confirmacion', mensaje, avisos } (409 con `requiere_confirmacion`)
 *  - { tipo: 'otro', mensaje }
 */
export function interpretarErrorCobro(error, mensajeDefecto = 'No se pudo completar el envío.') {
    const status = error?.response?.status;
    const data = error?.response?.data || {};
    const mensaje = data.error || mensajeDefecto;
    if (status === 400 && data.bloqueado) {
        return {
            tipo: 'bloqueado',
            mensaje,
            bloqueos: Array.isArray(data.bloqueos) ? data.bloqueos : [],
        };
    }
    if (status === 409 && data.requiere_confirmacion) {
        return {
            tipo: 'confirmacion',
            mensaje,
            avisos: Array.isArray(data.avisos) ? data.avisos : [],
        };
    }
    return { tipo: 'otro', mensaje };
}
