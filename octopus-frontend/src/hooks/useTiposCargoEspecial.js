import { useState, useCallback, useEffect } from 'react';
import axiosInstance from '../api/apiClient';
import { toast } from 'react-toastify';
import { getSedes } from '../api/multisede.service';

const normalizeList = (data) =>
    Array.isArray(data) ? data : (data?.results ?? []);

const FORM_INICIAL = {
    nombre: '',
    monto_defecto_usd: '',
    periodicidad: 'unico',
    numero_cuotas: 1,
    fecha_primera_cuota: '',
    dia_cobro: '',
    bloquea_inscripcion: true,
    alcance: 'todos',
    grados: [],
    sedes: [],
    activo: true,
};

export function useTiposCargoEspecial() {
    const [tiposCargoEspecial, setTiposCargoEspecial] = useState([]);
    const [tiposCargoEspecialLoading, setTiposCargoEspecialLoading] = useState(false);
    const [gradosDisponibles, setGradosDisponibles] = useState([]);
    const [sedesDisponibles, setSedesDisponibles] = useState([]);
    const [showTipoCargoEspecialModal, setShowTipoCargoEspecialModal] = useState(false);
    const [tipoCargoEspecialEditando, setTipoCargoEspecialEditando] = useState(null);
    const [tipoCargoEspecialForm, setTipoCargoEspecialForm] = useState(FORM_INICIAL);
    const [tipoCargoEspecialSaving, setTipoCargoEspecialSaving] = useState(false);
    const [showDeleteTipoCargoEspecialModal, setShowDeleteTipoCargoEspecialModal] = useState(false);
    const [tipoCargoEspecialAEliminar, setTipoCargoEspecialAEliminar] = useState(null);

    const fetchTiposCargoEspecial = useCallback(async () => {
        setTiposCargoEspecialLoading(true);
        try {
            const res = await axiosInstance.get('cobranza/tipos-cargo-especial/');
            setTiposCargoEspecial(normalizeList(res.data));
        } catch {
            toast.error("No se pudieron cargar los cargos especiales.");
        } finally {
            setTiposCargoEspecialLoading(false);
        }
    }, []);

    const fetchOpcionesAlcance = useCallback(async () => {
        try {
            const [gradosRes, sedesData] = await Promise.all([
                axiosInstance.get('secretaria/configuracion-grados/'),
                getSedes(),
            ]);
            setGradosDisponibles(normalizeList(gradosRes.data));
            setSedesDisponibles(normalizeList(sedesData));
        } catch {
            // No bloquea el listado principal: solo faltarían las opciones
            // de alcance='grado'/'sede' al abrir el modal de creación.
        }
    }, []);

    useEffect(() => {
        fetchTiposCargoEspecial();
        fetchOpcionesAlcance();
    }, [fetchTiposCargoEspecial, fetchOpcionesAlcance]);

    const openCreateTipoCargoEspecial = () => {
        setTipoCargoEspecialEditando(null);
        setTipoCargoEspecialForm(FORM_INICIAL);
        setShowTipoCargoEspecialModal(true);
    };

    const openEditTipoCargoEspecial = (tipo) => {
        setTipoCargoEspecialEditando(tipo);
        setTipoCargoEspecialForm({
            nombre: tipo.nombre,
            monto_defecto_usd: tipo.monto_defecto_usd,
            periodicidad: tipo.periodicidad,
            numero_cuotas: tipo.numero_cuotas,
            fecha_primera_cuota: tipo.fecha_primera_cuota || '',
            dia_cobro: tipo.dia_cobro ?? '',
            bloquea_inscripcion: tipo.bloquea_inscripcion,
            alcance: tipo.alcance,
            grados: tipo.grados || [],
            sedes: tipo.sedes || [],
            activo: tipo.activo,
        });
        setShowTipoCargoEspecialModal(true);
    };

    const handleSaveTipoCargoEspecial = async () => {
        if (!tipoCargoEspecialForm.nombre.trim()) {
            toast.error("El nombre del cargo especial es requerido.");
            return;
        }
        setTipoCargoEspecialSaving(true);
        try {
            const payload = {
                ...tipoCargoEspecialForm,
                dia_cobro: tipoCargoEspecialForm.dia_cobro === '' ? null : tipoCargoEspecialForm.dia_cobro,
                fecha_primera_cuota: tipoCargoEspecialForm.fecha_primera_cuota || null,
            };
            if (tipoCargoEspecialEditando) {
                await axiosInstance.patch(`cobranza/tipos-cargo-especial/${tipoCargoEspecialEditando.id}/`, payload);
                toast.success("Cargo especial actualizado.");
            } else {
                await axiosInstance.post('cobranza/tipos-cargo-especial/', payload);
                toast.success("Cargo especial agregado.");
            }
            setShowTipoCargoEspecialModal(false);
            fetchTiposCargoEspecial();
        } catch (err) {
            const data = err.response?.data;
            const primerCampo = data && typeof data === 'object' ? Object.values(data)[0] : null;
            const msg = (Array.isArray(primerCampo) ? primerCampo[0] : primerCampo) || data?.detail || "Error al guardar el cargo especial.";
            toast.error(msg);
        } finally {
            setTipoCargoEspecialSaving(false);
        }
    };

    const confirmarEliminarTipoCargoEspecial = (tipo) => {
        setTipoCargoEspecialAEliminar(tipo);
        setShowDeleteTipoCargoEspecialModal(true);
    };

    const handleDeleteTipoCargoEspecial = async () => {
        if (!tipoCargoEspecialAEliminar) return;
        try {
            await axiosInstance.delete(`cobranza/tipos-cargo-especial/${tipoCargoEspecialAEliminar.id}/`);
            toast.success("Cargo especial eliminado.");
            setShowDeleteTipoCargoEspecialModal(false);
            setTipoCargoEspecialAEliminar(null);
            fetchTiposCargoEspecial();
        } catch (err) {
            const msg = err.response?.data?.detail || "No se pudo eliminar: ya tiene cuotas generadas (algunos representantes ya tienen este cargo).";
            toast.error(msg);
        }
    };

    return {
        tiposCargoEspecial, tiposCargoEspecialLoading,
        gradosDisponibles, sedesDisponibles,
        showTipoCargoEspecialModal, setShowTipoCargoEspecialModal, tipoCargoEspecialEditando,
        tipoCargoEspecialForm, setTipoCargoEspecialForm, tipoCargoEspecialSaving,
        showDeleteTipoCargoEspecialModal, setShowDeleteTipoCargoEspecialModal,
        tipoCargoEspecialAEliminar, setTipoCargoEspecialAEliminar,
        fetchTiposCargoEspecial, openCreateTipoCargoEspecial, openEditTipoCargoEspecial,
        handleSaveTipoCargoEspecial, confirmarEliminarTipoCargoEspecial, handleDeleteTipoCargoEspecial,
    };
}
