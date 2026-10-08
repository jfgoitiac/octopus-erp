import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { useSede } from '../context/SedeContext';
import {
    getCobranzaInteligente,
    actualizarCobranzaInteligente,
} from '../api/cobranza.service';

export const ETAPAS_ENVIO = [
    { value: 'preventiva', label: 'Preventiva', detalle: 'Días −5, −1 y 0' },
    { value: 'temprana', label: 'Temprana', detalle: 'Días +3 y +7' },
    { value: 'prioritaria', label: 'Prioritaria y crítica', detalle: 'Días +15 y +30' },
];

const mensajeError = (err) =>
    err?.response?.data?.detail || 'No se pudo completar la acción. Intenta de nuevo.';

export function useCobranzaInteligente() {
    const { sedeActiva, sedes } = useSede();
    const sedeId = sedeActiva?.id ?? null;
    // Con varias sedes hay que elegir una; sin sedes, la configuración es global.
    const requiereSede = sedes.length > 0 && !sedeId;

    // Resultado de la última carga, atado a la sede que lo pidió: "cargando"
    // se deriva de que el resultado no corresponda a la sede actual.
    const [resultado, setResultado] = useState({ sedeId: undefined, data: null });
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        if (requiereSede) return undefined;
        const controller = new AbortController();
        getCobranzaInteligente(sedeId, controller.signal)
            .then(res => setResultado({ sedeId, data: res.data }))
            .catch(err => {
                if (err?.code === 'ERR_CANCELED') return;
                setResultado({ sedeId, data: null });
                toast.error(mensajeError(err));
            });
        return () => controller.abort();
    }, [sedeId, requiereSede]);

    const loading = !requiereSede && resultado.sedeId !== sedeId;
    const estado = requiereSede || loading ? null : resultado.data;

    const guardar = useCallback(async (cambios, mensajeOk) => {
        setGuardando(true);
        try {
            const res = await actualizarCobranzaInteligente(sedeId, cambios);
            setResultado({ sedeId, data: res.data });
            toast.success(mensajeOk);
            return true;
        } catch (err) {
            toast.error(mensajeError(err));
            return false;
        } finally {
            setGuardando(false);
        }
    }, [sedeId]);

    return { estado, loading, guardando, guardar, requiereSede, sedeActiva };
}
