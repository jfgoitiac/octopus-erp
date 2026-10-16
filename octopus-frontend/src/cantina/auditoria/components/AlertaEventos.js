// Evento de ventana que se emite al atender una alerta, para que el contador
// del menú (CantinaLayout) se refresque sin esperar al próximo cambio de ruta.
// Mismo patrón que EVENTO_APERTURA_CAMBIADA de la cantina.
export const EVENTO_ALERTAS_CAMBIADAS = 'auditoria-cantina:alertas-cambiadas';

export const avisarAlertasCambiadas = () => window.dispatchEvent(new Event(EVENTO_ALERTAS_CAMBIADAS));
