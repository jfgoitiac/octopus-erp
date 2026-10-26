import { useSyncExternalStore } from 'react';

// Suscribe el componente a un media query de JS (p. ej. '(min-width: 1024px)').
// Solo para decidir QUÉ renderizar; el estilo sigue yendo con breakpoints Tailwind.
export function useMediaQuery(query) {
  const suscribir = (aviso) => {
    const mql = window.matchMedia(query);
    mql.addEventListener('change', aviso);
    return () => mql.removeEventListener('change', aviso);
  };
  return useSyncExternalStore(
    suscribir,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
