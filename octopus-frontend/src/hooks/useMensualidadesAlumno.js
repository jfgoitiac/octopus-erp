import { useState } from 'react';
import axiosInstance from '../api/apiClient';
import { toast } from 'react-toastify';

function parseApiError(err) {
    const data = err.response?.data;
    if (!data) return 'Error de conexión.';
    if (data.error) return data.error;
    if (data.detail) return data.detail;
    return 'Error inesperado.';
}

export function useMensualidadesAlumno() {
    const [showModal, setShowModal] = useState(false);
    const [mensualidades, setMensualidades] = useState([]);
    const [totalDeuda, setTotalDeuda] = useState(0);
    // C-5 fix: estado de carga para cuando se abre el modal
    const [loadingMensualidades, setLoadingMensualidades] = useState(false);
    const [savingMensualidades, setSavingMensualidades] = useState(false);

    const handleOpenModal = async (alumno) => {
        setShowModal(true);
        setLoadingMensualidades(true);
        try {
            const res = await axiosInstance.get(`cobranza/buscar/${alumno.cedula_escolar}/`);
            setMensualidades(res.data?.alumnos?.[0]?.mensualidades_pendientes || []);
            setTotalDeuda(res.data.monto_total_deuda || 0);
        } catch (err) {
            toast.error(parseApiError(err) || 'Error al cargar mensualidades.');
        } finally {
            setLoadingMensualidades(false);
        }
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setMensualidades([]);
        setTotalDeuda(0);
    };

    const handleUpdateMonto = (id, nuevoMonto) => {
        setMensualidades(prev => prev.map(m => m.id === id ? { ...m, monto_usd: nuevoMonto } : m));
    };

    // C-2 fix: usa parsedValor (float) en lugar de valor (string)
    const handleBulkUpdate = (valor) => {
        const parsedValor = parseFloat(valor);
        if (isNaN(parsedValor) || parsedValor < 0) {
            toast.error('Ingrese un monto válido mayor a 0.');
            return;
        }
        setMensualidades(prev => prev.map(m => ({ ...m, monto_usd: parsedValor })));
    };

    const handleSave = async () => {
        if (!mensualidades || mensualidades.length === 0) {
            toast.error('No hay mensualidades cargadas para actualizar.');
            return;
        }
        setSavingMensualidades(true);
        try {
            const payload = {
                mensualidades: mensualidades.map(m => ({ id: m.id, monto_usd: m.monto_usd })),
            };
            await axiosInstance.patch('cobranza/actualizar-mensualidades/', payload);
            handleCloseModal();
            toast.success('¡Mensualidades actualizadas correctamente!');
        } catch (err) {
            toast.error(parseApiError(err) || 'Error al guardar cambios.');
        } finally {
            setSavingMensualidades(false);
        }
    };

    const handleGenerarAnualidad = async (alumno) => {
        setSavingMensualidades(true);
        try {
            await axiosInstance.post('cobranza/generar-anualidad/', { alumno_id: alumno.id });
            const res = await axiosInstance.get(`cobranza/buscar/${alumno.cedula_escolar}/`);
            setMensualidades(res.data?.alumnos?.[0]?.mensualidades_pendientes || []);
            setTotalDeuda(res.data.monto_total_deuda || 0);
            toast.success('Año completo generado.');
        } catch (err) {
            toast.error(parseApiError(err) || 'Error al generar los meses del año.');
        } finally {
            setSavingMensualidades(false);
        }
    };

    return {
        showModal, setShowModal,
        mensualidades, totalDeuda,
        loadingMensualidades, savingMensualidades,
        handleOpenModal, handleCloseModal,
        handleUpdateMonto, handleBulkUpdate,
        handleSave, handleGenerarAnualidad,
    };
}
