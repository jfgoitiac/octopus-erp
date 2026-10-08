import { useState } from 'react';

export const VISTA = Object.freeze({ TARJETAS: 'tarjetas', LISTA: 'lista', RESUMEN: 'resumen' });

// `permitidas` evita que un módulo sin vista Resumen (portal docente) herede
// un valor guardado que no puede mostrar.
function leer(clave, permitidas) {
  try {
    const guardada = localStorage.getItem(clave);
    return permitidas.includes(guardada) ? guardada : VISTA.TARJETAS;
  } catch {
    return VISTA.TARJETAS;
  }
}

/**
 * Vista preferida de la asistencia ("tarjetas" | "lista" | "resumen"),
 * recordada por navegador. Cada módulo usa su propia clave (portal docente,
 * panel). El resumen solo se acepta con `{ conResumen: true }`.
 */
export function useVistaAsistencia(clave, { conResumen = false } = {}) {
  const permitidas = conResumen
    ? [VISTA.TARJETAS, VISTA.LISTA, VISTA.RESUMEN]
    : [VISTA.TARJETAS, VISTA.LISTA];
  const [vista, setVista] = useState(() => leer(clave, permitidas));
  const cambiarVista = (nueva) => {
    setVista(nueva);
    try { localStorage.setItem(clave, nueva); } catch { /* storage bloqueado: solo no se recuerda */ }
  };
  return [vista, cambiarVista];
}
