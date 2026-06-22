import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from 'react-toastify';
import { getDashboardStats } from '../api/dashboardService';
import { fmt } from '../utils/format';

export function useDashboardStats() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const abortRef = useRef(null);

    const fetchStats = useCallback(async (signal) => {
        setError(false);
        setLoading(true);
        try {
            const data = await getDashboardStats(signal);
            setStats(data);
        } catch (err) {
            if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
                setError(true);
                toast.error('No se pudo cargar el resumen. Verifica tu conexión.');
            }
        } finally {
            setLoading(false);
        }
    }, []);

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
        const totalGender = (s.masculino ?? 0) + (s.femenino ?? 0);
        return {
            raw: s,
            financialData: [
                { label: 'Solventes', value: s.solventes ?? 0, color: '#16a34a' },
                { label: 'En mora',   value: s.morosos   ?? 0, color: '#dc2626' },
                { label: 'Becados',   value: s.becados   ?? 0, color: '#7c3aed' },
            ],
            genderData: [
                { label: 'Masculino', value: s.masculino ?? 0, color: '#2563eb' },
                { label: 'Femenino',  value: s.femenino  ?? 0, color: '#db2777' },
            ],
            gradeData: s.grados ?? [],
            totalGender,
            kpi: {
                totalActivos:  fmt(s.total_activos   ?? 0),
                inactivos:     fmt(s.inactivos       ?? 0),
                solventes:     fmt(s.solventes       ?? 0),
                morosos:       fmt(s.morosos         ?? 0),
                becados:       fmt(s.becados         ?? 0),
                cobradoHoyUsd: `$${fmt(s.cobrado_hoy_usd   ?? 0, 2)}`,
                cobradoHoyVes: `Bs. ${fmt(s.cobrado_hoy_ves ?? 0, 0)}`,
                pagosHoyCount: fmt(s.pagos_hoy_count ?? 0),
                tasaBcv:       s.tasa_bcv > 0 ? `Bs. ${fmt(s.tasa_bcv, 2)}` : '—',
            },
        };
    }, [stats]);

    return { ...derived, loading, error, retry };
}
