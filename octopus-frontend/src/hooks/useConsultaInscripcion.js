import { useState, useCallback, useEffect } from 'react';
import { toast } from 'react-toastify';
import { parseApiError } from '../utils/apiError';
import { listarInscripciones, descargarComprobanteBlob } from '../api/inscripciones.service';

const PAGE_SIZE = 20;

export function useConsultaInscripcion() {
    const [inscripciones, setInscripciones] = useState([]);
    const [busqueda, setBusquedaRaw] = useState('');
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [reimprimiendoId, setReimprimiendoId] = useState(null);

    const setBusqueda = useCallback((v) => { setBusquedaRaw(v); setPage(1); }, []);

    const fetchData = useCallback(async (signal) => {
        setLoading(true);
        try {
            const res = await listarInscripciones({ buscar: busqueda, page, pageSize: PAGE_SIZE }, signal);
            setInscripciones(res?.data?.results ?? []);
            setTotal(res?.data?.count ?? 0);
        } catch (err) {
            if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
            if (err.response?.status === 404 && page > 1) { setPage(1); return; }
            toast.error(parseApiError(err));
        } finally {
            setLoading(false);
        }
    }, [busqueda, page]);

    useEffect(() => {
        const controller = new AbortController();
        const timer = setTimeout(() => fetchData(controller.signal), 500);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [fetchData]);

    const reimprimir = useCallback(async (inscripcionId) => {
        setReimprimiendoId(inscripcionId);
        try {
            const res = await descargarComprobanteBlob(inscripcionId);
            const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const newTab = window.open(url, '_blank', 'noopener,noreferrer');
            if (!newTab || newTab.closed || typeof newTab.closed === 'undefined') {
                const a = Object.assign(document.createElement('a'), {
                    href: url,
                    download: `comprobante_inscripcion_${inscripcionId}.pdf`,
                });
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
            setTimeout(() => URL.revokeObjectURL(url), 5000);
        } catch (err) {
            if (err.response?.status === 404) {
                toast.error('No se encontró la inscripción o el comprobante.');
            } else {
                toast.error(parseApiError(err) || 'No se pudo generar el comprobante.');
            }
        } finally {
            setReimprimiendoId(null);
        }
    }, []);

    return {
        inscripciones, busqueda, setBusqueda, loading,
        page, setPage, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)), pageSize: PAGE_SIZE,
        reimprimiendoId, reimprimir,
    };
}
