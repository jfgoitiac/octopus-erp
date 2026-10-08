import { useCallback, useState } from 'react';

const aTexto = (v) => {
    if (typeof v === 'string') return [v];
    if (Array.isArray(v)) return v.flatMap(aTexto);
    if (v && typeof v === 'object') return Object.values(v).flatMap(aTexto);
    return [];
};

/** Extrae {campo: 'mensaje'} de un error Axios 400 con `campos`. Devuelve null si no aplica. */
export function extraerCampos(err) {
    const campos = err?.response?.data?.campos;
    if (!campos || typeof campos !== 'object') return null;
    const salida = {};
    Object.entries(campos).forEach(([k, v]) => {
        const msg = aTexto(v).join(' ');
        if (msg) salida[k] = msg;
    });
    return Object.keys(salida).length ? salida : null;
}

/** Clases para marcar en rojo los input/select/textarea dentro de un label. */
export const campoErr = (errores, nombre) =>
    errores?.[nombre] ? '[&_input]:border-red-500 [&_select]:border-red-500 [&_textarea]:border-red-500' : '';

/**
 * Errores por campo que se limpian solos cuando el valor del campo cambia
 * respecto al que se envió. `datos` es el estado actual del formulario.
 */
export function useErroresCampos(datos = {}) {
    const [guardado, setGuardado] = useState(null);
    const marcar = useCallback((err) => {
        const campos = extraerCampos(err);
        setGuardado(campos ? { campos, snap: datos } : null);
        return Boolean(campos);
    }, [datos]);
    const limpiar = useCallback(() => setGuardado(null), []);
    const errores = {};
    if (guardado) {
        Object.entries(guardado.campos).forEach(([k, msg]) => {
            if (!(k in guardado.snap) || Object.is(datos[k], guardado.snap[k])) errores[k] = msg;
        });
    }
    return { errores, marcar, limpiar };
}
