import { useState } from 'react';
import axiosInstance from '../api/apiClient';
import { getMensualidadesAlumno } from '../api/cobranza.service';
import { toast } from 'react-toastify';
import { parseApiError } from '../utils/apiError';

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
            const res = await getMensualidadesAlumno(alumno.id);
            setMensualidades(res.data?.mensualidades_pendientes || []);
            setTotalDeuda(res.data?.monto_total_deuda || 0);
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

    return {
        showModal, setShowModal,
        mensualidades, totalDeuda,
        loadingMensualidades, savingMensualidades,
        handleOpenModal, handleCloseModal,
        handleUpdateMonto, handleBulkUpdate,
        handleSave,
    };
}
