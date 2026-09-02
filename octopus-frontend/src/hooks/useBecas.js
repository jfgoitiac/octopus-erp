import { useState, useCallback, useEffect, useRef } from 'react';
import axiosInstance from '../api/apiClient';
import { toast } from 'react-toastify';

const normalizeList = (data) =>
    Array.isArray(data) ? data : (data?.results ?? []);

const FORM_INICIAL = {
    alumno: null,
    periodo_escolar: '',
    tipo: 'academica',
    porcentaje: '',
    fecha_desde: '',
    fecha_hasta: '',
    motivo: '',
    documento_adjunto: null,
};

export function useBecas() {
    const [becas, setBecas] = useState([]);
    const [becasLoading, setBecasLoading] = useState(false);
    const [filtroEstado, setFiltroEstado] = useState('activa');
    const [filtroBuscar, setFiltroBuscar] = useState('');

    const [showBecaModal, setShowBecaModal] = useState(false);
    const [becaEditando, setBecaEditando] = useState(null);
    const [becaForm, setBecaForm] = useState(FORM_INICIAL);
    const [becaSaving, setBecaSaving] = useState(false);

    const [showRevocarModal, setShowRevocarModal] = useState(false);
    const [becaARevocar, setBecaARevocar] = useState(null);
    const [motivoRevocacion, setMotivoRevocacion] = useState('');
    const [revocando, setRevocando] = useState(false);

    // Búsqueda de alumnos para el selector del modal (debounced).
    const [busquedaAlumno, setBusquedaAlumno] = useState('');
    const [resultadosAlumnos, setResultadosAlumnos] = useState([]);
    const [buscandoAlumnos, setBuscandoAlumnos] = useState(false);
    const debounceRef = useRef(null);

    const fetchBecas = useCallback(async () => {
        setBecasLoading(true);
        try {
            const params = {};
            if (filtroEstado) params.estado = filtroEstado;
            if (filtroBuscar.trim()) params.buscar = filtroBuscar.trim();
            const res = await axiosInstance.get('secretaria/becas/', { params });
            setBecas(normalizeList(res.data));
        } catch {
            toast.error('No se pudieron cargar las becas.');
        } finally {
            setBecasLoading(false);
        }
    }, [filtroEstado, filtroBuscar]);

    useEffect(() => { fetchBecas(); }, [fetchBecas]);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (!busquedaAlumno.trim()) {
            setResultadosAlumnos([]);
            return;
        }
        setBuscandoAlumnos(true);
        debounceRef.current = setTimeout(async () => {
            try {
                const res = await axiosInstance.get('secretaria/alumnos/', {
                    params: { buscar: busquedaAlumno.trim(), page_size: 10 },
                });
                setResultadosAlumnos(normalizeList(res.data));
            } catch {
                setResultadosAlumnos([]);
            } finally {
                setBuscandoAlumnos(false);
            }
        }, 350);
        return () => clearTimeout(debounceRef.current);
    }, [busquedaAlumno]);

    const openCreateBeca = () => {
        setBecaEditando(null);
        setBecaForm(FORM_INICIAL);
        setBusquedaAlumno('');
        setResultadosAlumnos([]);
        setShowBecaModal(true);
    };

    const openEditBeca = (beca) => {
        setBecaEditando(beca);
        setBecaForm({
            alumno: { id: beca.alumno, nombre: beca.alumno_nombre },
            periodo_escolar: beca.periodo_escolar,
            tipo: beca.tipo,
            porcentaje: beca.porcentaje,
            fecha_desde: beca.fecha_desde,
            fecha_hasta: beca.fecha_hasta,
            motivo: beca.motivo || '',
            documento_adjunto: null,
        });
        setBusquedaAlumno('');
        setResultadosAlumnos([]);
        setShowBecaModal(true);
    };

    const handleSaveBeca = async () => {
        if (!becaForm.alumno) {
            toast.error('Seleccione un alumno.');
            return;
        }
        if (!becaForm.periodo_escolar.trim()) {
            toast.error('El período escolar es requerido.');
            return;
        }
        const porcentaje = Number(becaForm.porcentaje);
        if (!porcentaje || porcentaje < 1 || porcentaje > 100) {
            toast.error('El porcentaje debe estar entre 1 y 100.');
            return;
        }
        if (!becaForm.fecha_desde || !becaForm.fecha_hasta) {
            toast.error('Indique la vigencia de la beca.');
            return;
        }

        setBecaSaving(true);
        try {
            const formData = new FormData();
            formData.append('alumno', becaForm.alumno.id);
            formData.append('periodo_escolar', becaForm.periodo_escolar.trim());
            formData.append('tipo', becaForm.tipo);
            formData.append('porcentaje', porcentaje);
            formData.append('fecha_desde', becaForm.fecha_desde);
            formData.append('fecha_hasta', becaForm.fecha_hasta);
            formData.append('motivo', becaForm.motivo || '');
            if (becaForm.documento_adjunto) {
                formData.append('documento_adjunto', becaForm.documento_adjunto);
            }

            if (becaEditando) {
                await axiosInstance.patch(`secretaria/becas/${becaEditando.id}/`, formData);
                toast.success('Beca actualizada.');
            } else {
                await axiosInstance.post('secretaria/becas/', formData);
                toast.success('Beca otorgada.');
            }
            setShowBecaModal(false);
            fetchBecas();
        } catch (err) {
            const data = err.response?.data;
            const primerCampo = data && typeof data === 'object' && !Array.isArray(data)
                ? Object.values(data)[0] : data;
            const msg = (Array.isArray(primerCampo) ? primerCampo[0] : primerCampo) || 'Error al guardar la beca.';
            toast.error(msg);
        } finally {
            setBecaSaving(false);
        }
    };

    const confirmarRevocarBeca = (beca) => {
        setBecaARevocar(beca);
        setMotivoRevocacion('');
        setShowRevocarModal(true);
    };

    const handleRevocarBeca = async () => {
        if (!becaARevocar) return;
        setRevocando(true);
        try {
            await axiosInstance.post(`secretaria/becas/${becaARevocar.id}/revocar/`, {
                motivo: motivoRevocacion,
            });
            toast.success('Beca revocada.');
            setShowRevocarModal(false);
            setBecaARevocar(null);
            fetchBecas();
        } catch (err) {
            toast.error(err.response?.data?.error || 'No se pudo revocar la beca.');
        } finally {
            setRevocando(false);
        }
    };

    return {
        becas, becasLoading, filtroEstado, setFiltroEstado, filtroBuscar, setFiltroBuscar,
        showBecaModal, setShowBecaModal, becaEditando, becaForm, setBecaForm, becaSaving,
        busquedaAlumno, setBusquedaAlumno, resultadosAlumnos, buscandoAlumnos,
        showRevocarModal, setShowRevocarModal, becaARevocar, motivoRevocacion, setMotivoRevocacion, revocando,
        fetchBecas, openCreateBeca, openEditBeca, handleSaveBeca,
        confirmarRevocarBeca, handleRevocarBeca,
    };
}
