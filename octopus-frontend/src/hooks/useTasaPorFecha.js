import { useState, useEffect, useRef } from 'react';
import axiosInstance from '../api/apiClient';

/**
 * Consulta `cobranza/tasa/por-fecha/?fecha=YYYY-MM-DD` para obtener la tasa
 * BCV vigente en una fecha pasada (pago retroactivo). A diferencia de
 * useTasaBCV (que trae la tasa de HOY y hace polling), este hook resuelve
 * una fecha puntual y se reconsulta cada vez que `fecha` cambia.
 *
 * Respuestas del backend:
 *  - 200 { valor, fecha, exacta: true }  → hay tasa registrada ese día exacto.
 *  - 200 { valor, fecha, exacta: false } → se usó la más reciente ANTERIOR;
 *    `fecha` en la respuesta es la fecha real de esa tasa.
 *  - 404 → no existe ninguna tasa anterior o igual a la fecha pedida. El
 *    caller debe dejar el campo vacío y exigir tasa manual, nunca rellenar
 *    con la tasa de hoy en silencio.
 *
 * `fecha` debe ser un string 'YYYY-MM-DD' o null/undefined para no consultar
 * (p. ej. mientras el modo retroactivo está apagado).
 */
export const useTasaPorFecha = (fecha) => {
    const [valor, setValor] = useState(null);
    const [exacta, setExacta] = useState(true);
    const [fechaReal, setFechaReal] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const abortRef = useRef(null);

    useEffect(() => {
        abortRef.current?.abort();

        if (!fecha) {
            setValor(null);
            setExacta(true);
            setFechaReal(null);
            setError(null);
            setLoading(false);
            return;
        }

        abortRef.current = new AbortController();
        setLoading(true);
        setError(null);

        axiosInstance
            .get('cobranza/tasa/por-fecha/', {
                params: { fecha },
                signal: abortRef.current.signal,
            })
            .then((res) => {
                setValor(res.data?.valor ?? null);
                setExacta(res.data?.exacta !== false);
                setFechaReal(res.data?.fecha ?? fecha);
            })
            .catch((err) => {
                if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
                // 404: no hay ninguna tasa registrada para esa fecha ni anterior.
                // Se deja el campo vacío — nunca se rellena con la de hoy en silencio.
                setValor(null);
                setExacta(true);
                setFechaReal(null);
                if (err.response?.status !== 404) {
                    setError('No se pudo consultar la tasa histórica.');
                }
            })
            .finally(() => setLoading(false));

        return () => abortRef.current?.abort();
    }, [fecha]);

    return { valor, exacta, fechaReal, loading, error };
};
