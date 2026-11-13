export const EVENTO_TASA_CANTINA_CAMBIADA = 'octopus:cantina-tasa-cambiada';

export function notificarTasaCantinaCambiada(tasa) {
  window.dispatchEvent(new CustomEvent(EVENTO_TASA_CANTINA_CAMBIADA, { detail: tasa }));
}

export function suscribirTasaCantinaCambiada(listener) {
  const manejar = (evento) => listener(evento.detail);
  window.addEventListener(EVENTO_TASA_CANTINA_CAMBIADA, manejar);
  return () => window.removeEventListener(EVENTO_TASA_CANTINA_CAMBIADA, manejar);
}
