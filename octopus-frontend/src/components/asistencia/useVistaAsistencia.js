import { useState } from 'react';

export const VISTA = Object.freeze({ TARJETAS: 'tarjetas', LISTA: 'lista' });

function leer(clave) {
  try {
    return localStorage.getItem(clave) === VISTA.LISTA ? VISTA.LISTA : VISTA.TARJETAS;
  } catch {
    return VISTA.TARJETAS;
  }
}

/**
 * Vista preferida de la asistencia ("tarjetas" | "lista"), recordada por
 * navegador. Cada módulo usa su propia clave (portal docente, panel).
 */
export function useVistaAsistencia(clave) {
  const [vista, setVista] = useState(() => leer(clave));
  const cambiarVista = (nueva) => {
    setVista(nueva);
    try { localStorage.setItem(clave, nueva); } catch { /* storage bloqueado: solo no se recuerda */ }
  };
  return [vista, cambiarVista];
}
