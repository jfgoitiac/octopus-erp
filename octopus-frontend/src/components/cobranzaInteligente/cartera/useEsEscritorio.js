import { useEffect, useState } from 'react';

const CONSULTA_ESCRITORIO = '(min-width: 768px)';

/** true desde `md` (768px). Sin matchMedia (tests) se asume móvil. */
export function useEsEscritorio() {
    const leer = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(CONSULTA_ESCRITORIO).matches : false);
    const [escritorio, setEscritorio] = useState(leer);
    useEffect(() => {
        if (!window.matchMedia) return undefined;
        const mq = window.matchMedia(CONSULTA_ESCRITORIO);
        const alCambiar = () => setEscritorio(mq.matches);
        mq.addEventListener('change', alCambiar);
        return () => mq.removeEventListener('change', alCambiar);
    }, []);
    return escritorio;
}

export default useEsEscritorio;
