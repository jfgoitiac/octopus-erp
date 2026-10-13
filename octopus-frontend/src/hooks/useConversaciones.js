import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { useSede } from '../context/useSede';
import { usePolling } from './usePolling';
import { getConversacionesInteligente } from '../api/cobranza.service';
import {
    coincideFiltro, fusionarPorId, mensajeError, ordenarConversaciones,
} from '../components/cobranzaInteligente/conversaciones/conversacionesUtils';

/**
 * Bandeja de conversaciones (GET conversaciones/): carga completa al cambiar filtro,
 * búsqueda o sede, y consultas incrementales `?desde=<ahora del servidor>` con usePolling.
 * Las filas se fusionan por `id`. `apagada` = 409 (módulo apagado).
 */
export function useConversaciones({ filtro = 'todas', q = '' } = {}) {
    const { sedeActiva } = useSede();
    const sedeId = sedeActiva?.id ?? null;
    const clave = `${sedeId}|${filtro}|${q}`;
    const [estado, setEstado] = useState({ clave: undefined, filas: [], apagada: false });
    const claveRef = useRef(clave);
    const ahoraRef = useRef(null);
    const filtroRef = useRef(filtro);

    useEffect(() => {
        claveRef.current = clave;
        filtroRef.current = filtro;
    }, [clave, filtro]);

    const parametros = useCallback((desde) => {
        const p = {};
        if (sedeId) p.sede = sedeId;
        if (filtro !== 'todas') p.filtro = filtro;
        if (q) p.q = q;
        if (desde) p.desde = desde;
        return p;
    }, [sedeId, filtro, q]);

    useEffect(() => {
        const controller = new AbortController();
        ahoraRef.current = null;
        getConversacionesInteligente(parametros(), controller.signal)
            .then(res => {
                ahoraRef.current = res.data?.ahora || null;
                setEstado({ clave, filas: ordenarConversaciones(res.data?.results || []), apagada: false });
            })
            .catch(err => {
                if (err?.code === 'ERR_CANCELED') return;
                const apagada = err?.response?.status === 409;
                setEstado({ clave, filas: [], apagada });
                if (!apagada) toast.error(mensajeError(err, 'No se pudieron cargar las conversaciones.'));
            });
        return () => controller.abort();
    }, [clave, parametros]);

    // Consulta incremental: si falla, usePolling aplica backoff y avisa una sola vez.
    const refrescar = useCallback(async () => {
        const claveConsulta = claveRef.current;
        const res = await getConversacionesInteligente(parametros(ahoraRef.current));
        if (claveRef.current !== claveConsulta) return;
        if (res.data?.ahora) ahoraRef.current = res.data.ahora;
        const nuevas = res.data?.results || [];
        if (nuevas.length === 0) return;
        setEstado(prev => {
            if (prev.clave !== claveConsulta) return prev;
            const fusion = fusionarPorId(prev.filas, nuevas).filter(c => coincideFiltro(c, filtroRef.current));
            return { ...prev, filas: ordenarConversaciones(fusion) };
        });
    }, [parametros]);

    /** Aplica una conversación ya actualizada (tomar, devolver, leída, vincular, envío) sin esperar al poll. */
    const actualizarLocal = useCallback((conv) => {
        if (!conv?.id) return;
        setEstado(prev => {
            if (!prev.filas.some(c => c.id === conv.id)) return prev;
            const fusion = fusionarPorId(prev.filas, [conv]).filter(c => coincideFiltro(c, filtroRef.current));
            return { ...prev, filas: ordenarConversaciones(fusion) };
        });
    }, []);

    const loading = estado.clave !== clave;
    usePolling(refrescar, { activo: !loading && !estado.apagada });

    return {
        conversaciones: loading ? [] : estado.filas,
        apagada: !loading && estado.apagada,
        loading,
        actualizarLocal,
    };
}

export default useConversaciones;
