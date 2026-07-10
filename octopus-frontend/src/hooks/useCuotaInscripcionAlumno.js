import { useState } from 'react';
import axiosInstance from '../api/apiClient';
import { getCuotaInscripcionAlumno } from '../api/cobranza.service';
import { toast } from 'react-toastify';
import { parseApiError } from '../utils/apiError';

export function useCuotaInscripcionAlumno() {
    const [showModal, setShowModal] = useState(false);
    const [cuotas, setCuotas] = useState([]);
    const [loadingCuotas, setLoadingCuotas] = useState(false);
    const [savingCuotas, setSavingCuotas] = useState(false);

    const handleOpenModal = async (alumno) => {
        setShowModal(true);
        setLoadingCuotas(true);
        try {
            const res = await getCuotaInscripcionAlumno(alumno.id);
            setCuotas(res.data?.cuotas_inscripcion_pendientes || []);
        } catch (err) {
            toast.error(parseApiError(err) || 'Error al cargar la cuota de inscripción.');
        } finally {
            setLoadingCuotas(false);
        }
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setCuotas([]);
    };

    const handleUpdateMonto = (id, nuevoMonto) => {
        setCuotas(prev => prev.map(c => c.id === id ? { ...c, monto_usd: nuevoMonto } : c));
    };

    const handleSave = async () => {
        if (!cuotas || cuotas.length === 0) {
            toast.error('No hay cuota de inscripción cargada para actualizar.');
            return;
        }
        setSavingCuotas(true);
        try {
            const payload = {
                cuotas: cuotas.map(c => ({ id: c.id, monto_usd: c.monto_usd })),
            };
            await axiosInstance.patch('cobranza/actualizar-cuota-inscripcion/', payload);
            handleCloseModal();
            toast.success('¡Monto de inscripción actualizado correctamente!');
        } catch (err) {
            toast.error(parseApiError(err) || 'Error al guardar cambios.');
        } finally {
            setSavingCuotas(false);
        }
    };

    return {
        showModal, setShowModal,
        cuotas,
        loadingCuotas, savingCuotas,
        handleOpenModal, handleCloseModal,
        handleUpdateMonto,
        handleSave,
    };
}
