import { useEffect, useRef } from 'react';

const UMBRAL_EJE_PX = 8;          // movimiento mínimo antes de decidir horizontal/vertical
const UMBRAL_DISTANCIA = 0.28;    // fracción del ancho de la tarjeta para confirmar
const UMBRAL_VELOCIDAD = 0.6;     // px/ms: un gesto rápido confirma aunque sea corto
const RESISTENCIA = 0.25;         // amortiguación al arrastrar hacia donde no hay tarjeta
const RETORNO_ELASTICO = 'transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1)';

/**
 * Swipe horizontal de la tarjeta del pase de lista con Pointer Events.
 * Mueve la tarjeta escribiendo `transform` directo en el DOM (sin re-render
 * por cada movimiento). Al soltar: si supera el umbral llama a
 * onSiguiente/onAnterior con el desplazamiento final (para que la tarjeta
 * saliente continúe desde ahí); si no, vuelve con retorno elástico.
 *
 * La tarjeta debe tener `touch-action: pan-y` para que el scroll vertical
 * siga siendo del navegador.
 */
export function useSwipeTarjeta({ onSiguiente, onAnterior, hayAnterior }) {
  const ref = useRef(null);
  const gestoRef = useRef(null);
  const callbacksRef = useRef({ onSiguiente, onAnterior, hayAnterior });

  useEffect(() => {
    callbacksRef.current = { onSiguiente, onAnterior, hayAnterior };
  });

  const onPointerDown = (e) => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (e.target.closest('button, input, textarea, select, a')) return;
    gestoRef.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, dx: 0, eje: null };
  };

  const onPointerMove = (e) => {
    const g = gestoRef.current;
    const el = ref.current;
    if (!g || g.id !== e.pointerId || !el) return;

    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (!g.eje) {
      if (Math.hypot(dx, dy) < UMBRAL_EJE_PX) return;
      g.eje = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (g.eje === 'y') { gestoRef.current = null; return; }
      el.setPointerCapture?.(e.pointerId);
      // Corta la animación de entrada si aún corre: el dedo manda.
      el.style.animation = 'none';
      el.style.transition = 'none';
      el.style.willChange = 'transform';
    }

    const efectivo = dx > 0 && !callbacksRef.current.hayAnterior ? dx * RESISTENCIA : dx;
    g.dx = efectivo;
    el.style.transform = `translate3d(${efectivo}px, 0, 0) rotate(${efectivo / 24}deg)`;
  };

  const onPointerUp = (e) => {
    const g = gestoRef.current;
    const el = ref.current;
    gestoRef.current = null;
    if (!g || g.id !== e.pointerId || !el || g.eje !== 'x') return;

    el.style.willChange = '';
    const ancho = el.offsetWidth || 1;
    const velocidad = Math.abs(g.dx) / Math.max(1, e.timeStamp - g.t0);
    const confirma = Math.abs(g.dx) > ancho * UMBRAL_DISTANCIA
      || (velocidad > UMBRAL_VELOCIDAD && Math.abs(g.dx) > 40);
    const { onSiguiente: sig, onAnterior: ant, hayAnterior: hayAnt } = callbacksRef.current;

    if (confirma && g.dx < 0) { sig(g.dx); return; }
    if (confirma && g.dx > 0 && hayAnt) { ant(g.dx); return; }

    el.style.transition = RETORNO_ELASTICO;
    el.style.transform = '';
  };

  return {
    ref,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
