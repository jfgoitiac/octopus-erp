import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from 'react-toastify';
import { getInscripcionesStats } from '../api/inscripcionesService';
import { fmt } from '../utils/format';

export function useInscripcionesStats(periodo) {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const abortRef = useRef(null);

    const fetchStats = useCallback(async (signal) => {
        setError(false);
        setLoading(true);
        try {
            const data = await getInscripcionesStats(signal, periodo);
            setStats(data);
        } catch (err) {
            if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
                setError(true);
                toast.error('No se pudo cargar el resumen de inscripciones. Verifica tu conexión.');
            }
        } finally {
            setLoading(false);
        }
    }, [periodo]);

    useEffect(() => {
        const controller = new AbortController();
        abortRef.current = controller;
        fetchStats(controller.signal);
        return () => controller.abort();
    }, [fetchStats]);

    // Cancel any inflight request before firing a new one
    const retry = useCallback(() => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        fetchStats(controller.signal);
    }, [fetchStats]);

    // Derived data only recomputes when the API response changes,
    // keeping child component props referentially stable between renders.
    const derived = useMemo(() => {
        const s = stats ?? {};
        const porTipo = s.por_tipo_ingreso ?? {};
        const nuevoIngreso = porTipo.nuevo_ingreso ?? 0;
        const regular = porTipo.regular ?? 0;
        const totalTipo = nuevoIngreso + regular;
        const mesActual = s.mes_actual ?? {};
        const ocupacion = s.ocupacion ?? {};
        const gradoData = ocupacion.por_grado ?? [];

        // variacion_pct puede venir null cuando el mes anterior tuvo 0 inscripciones
        const variacionPct = mesActual.variacion_pct;
        const tendencia = variacionPct == null
            ? 'neutral'
            : variacionPct >= 0 ? 'up' : 'down';

        return {
            raw: s,
            // Fallback true: si el backend aún no envía el campo, no ocultamos el bloque por defecto.
            visible: s.visible ?? true,
            periodoEscolar: s.periodo_escolar ?? '—',
            kpi: {
                totalInscritos: fmt(s.total_inscritos ?? 0),
                nuevoIngreso: fmt(nuevoIngreso),
                nuevoIngresoPct: totalTipo > 0 ? Math.round((nuevoIngreso / totalTipo) * 100) : 0,
                regular: fmt(regular),
                regularPct: totalTipo > 0 ? Math.round((regular / totalTipo) * 100) : 0,
                documentosPendientes: fmt(s.documentos_pendientes ?? 0),
            },
            mesActual: {
                mes: mesActual.mes ?? null,
                cantidad: fmt(mesActual.cantidad ?? 0),
                variacionPct,
                tendencia,
            },
            ocupacionGlobalPct: ocupacion.global_pct ?? 0,
            gradoData: gradoData.map(g => ({
                ...g,
                sinCupos: !!g.sin_cupos,
            })),
        };
    }, [stats]);

    return { ...derived, loading, error, retry };
}
