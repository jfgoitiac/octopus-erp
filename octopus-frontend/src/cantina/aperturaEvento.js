// Evento de ventana para avisar a CantinaLayout (chip "Caja: Cantina/Librería")
// que la apertura del cajero cambió: el POS al abrir caja y el cierre de caja
// al cerrarla. Evita subir el estado de la apertura a un contexto nuevo.
export const EVENTO_APERTURA_CAMBIADA = 'cantina:apertura-cambiada';

export const notificarAperturaCambiada = () => {
  window.dispatchEvent(new Event(EVENTO_APERTURA_CAMBIADA));
};

export const ETIQUETA_AREA = { cantina: 'Cantina', libreria: 'Librería' };
