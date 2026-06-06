import { useEffect } from 'react';

const FOCUSABLE_SELECTORS =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Atrapa el foco dentro del elemento referenciado mientras el modal está activo.
 * Al montar, mueve el foco al primer elemento interactivo.
 * Tab y Shift+Tab ciclan dentro del contenedor.
 */
export function useFocusTrap(ref, isActive = true) {
  useEffect(() => {
    if (!isActive || !ref.current) return;

    const container = ref.current;
    const getFocusable = () => [...container.querySelectorAll(FOCUSABLE_SELECTORS)];

    // Mover foco al primer elemento interactivo del modal
    const focusable = getFocusable();
    if (focusable.length) focusable[0].focus();

    const handleKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      const nodes = getFocusable();
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [ref, isActive]);
}
