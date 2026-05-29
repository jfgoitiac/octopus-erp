import { useState, useEffect, useCallback, useContext } from 'react';
import {
    Settings, Calendar, UserPlus, AlertTriangle, Save,
    RefreshCcw, CheckCircle, X, Info, Loader2, BarChart3, Clock,
    Building, Plus, Pencil, Trash2, Briefcase, School, Phone, Mail, MapPin, Landmark,
    Image, Upload, Trash
} from 'lucide-react';
import DatePickerES from '../components/DatePickerES';

const TIPO_LABELS = {
    general:        'General',
    transferencia:  'Transferencia',
    pago_movil:     'Pago Móvil',
    punto_de_venta: 'Punto de Venta',
    zelle:          'Zelle',
};
import axiosInstance from '../api/apiClient';
import { toast } from 'react-toastify';
import { AuthContext } from '../context/AuthContext';

const Configuracion = () => {
    const { user } = useContext(AuthContext);

    // Estados locales
    const [config, setConfig] = useState({
        nombre_colegio: '',
        rif: '',
        direccion_colegio: '',
        telefono_colegio: '',
        correo_colegio: '',
        municipio: '',
        estado_colegio: '',
        fecha_inicio_inscripciones: '',
        fecha_fin_inscripciones: '',
        fecha_inicio_ano_escolar: '',
        fecha_fin_ano_escolar: '',
        periodo_escolar_activo: '',
        dia_limite_pago: 5,
        notificaciones_activas: true,
        inscripciones_abiertas: false
    });
    const [grados, setGrados] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showPromoModal, setShowPromoModal] = useState(false);
    const [periodoDestino, setPeriodoDestino] = useState('');
    const [promoting, setPromoting] = useState(false);

    // Grados CRUD state
    const [showGradoModal, setShowGradoModal] = useState(false);
    const [gradoEditando, setGradoEditando] = useState(null);
    const [gradoForm, setGradoForm] = useState({ grado_seccion: '', cupos_maximos: 30 });
    const [gradoSaving, setGradoSaving] = useState(false);
    const [showDeleteGradoModal, setShowDeleteGradoModal] = useState(false);
    const [gradoAEliminar, setGradoAEliminar] = useState(null);

    // Tipos de cargo state
    const [tiposCargo, setTiposCargo] = useState([]);
    const [tiposCargoLoading, setTiposCargoLoading] = useState(false);
    const [showTipoCargoModal, setShowTipoCargoModal] = useState(false);
    const [tipoCargoEditando, setTipoCargoEditando] = useState(null);
    const [tipoCargoForm, setTipoCargoForm] = useState({ nombre: '', descripcion: '', activo: true });
    const [tipoCargoSaving, setTipoCargoSaving] = useState(false);
    const [showDeleteTipoModal, setShowDeleteTipoModal] = useState(false);
    const [tipoCargoAEliminar, setTipoCargoAEliminar] = useState(null);

    // Bank management state
    const [bancos, setBancos] = useState([]);
    const [bancosLoading, setBancosLoading] = useState(false);
    const [showBancoModal, setShowBancoModal] = useState(false);
    const [bancoEditando, setBancoEditando] = useState(null);
    const [bancoForm, setBancoForm] = useState({ nombre: '', numero_cuenta: '', tipo: 'general', activo: true });
    const [bancoSaving, setBancoSaving] = useState(false);

    // Logos del recibo state
    const [logosRecibo, setLogosRecibo] = useState({ logoColegio: null, logoAvec: null });
    const [showLogosModal, setShowLogosModal] = useState(false);
    const [logosForm, setLogosForm] = useState({ logoColegio: null, logoAvec: null });

    // Bancos de Nómina state
    const [bancosNomina, setBancosNomina] = useState([]);
    const [bancosNominaLoading, setBancosNominaLoading] = useState(false);
    const [showBancoNominaModal, setShowBancoNominaModal] = useState(false);
    const [bancoNominaEditando, setBancoNominaEditando] = useState(null);
    const [bancoNominaForm, setBancoNominaForm] = useState({ nombre: '', activo: true });
    const [bancoNominaSaving, setBancoNominaSaving] = useState(false);
    const [showDeleteBancoNominaModal, setShowDeleteBancoNominaModal] = useState(false);
    const [bancoNominaAEliminar, setBancoNominaAEliminar] = useState(null);

    // Carga de datos inicial
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [resConfig, resGrados] = await Promise.all([
                axiosInstance.get('secretaria/configuracion/'),
                axiosInstance.get('secretaria/configuracion-grados/')
            ]);
            setConfig(resConfig?.data || {});
            setGrados(resGrados?.data || []);
            
            // Sugerir próximo período escolar
            if (resConfig?.data?.periodo_escolar_activo) {
                const parts = resConfig.data.periodo_escolar_activo.split('-');
                if (parts.length === 2) {
                    const start = parseInt(parts[0]) + 1;
                    const end = parseInt(parts[1]) + 1;
                    setPeriodoDestino(`${start}-${end}`);
                }
            }
        } catch (err) {
            const msg = err.response?.data?.error || err.response?.data?.detail || "Error al cargar la configuración maestra.";
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        try {
            const stored = localStorage.getItem('octopus_logos_recibo');
            if (stored) setLogosRecibo(JSON.parse(stored));
        } catch {}
    }, []);

    const compressImage = (dataUrl, maxSize = 180) => new Promise(resolve => {
        const img = new window.Image();
        img.onload = () => {
            const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/png'));
        };
        img.src = dataUrl;
    });

    const handleLogosUpload = (field, e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async ev => {
            const compressed = await compressImage(ev.target.result);
            setLogosForm(p => ({ ...p, [field]: compressed }));
        };
        reader.readAsDataURL(file);
    };

    const openLogosModal = () => {
        setLogosForm({ ...logosRecibo });
        setShowLogosModal(true);
    };

    const handleSaveLogos = () => {
        try {
            localStorage.setItem('octopus_logos_recibo', JSON.stringify(logosForm));
            setLogosRecibo({ ...logosForm });
            setShowLogosModal(false);
            toast.success("Logos del recibo actualizados.");
        } catch {
            toast.error("No se pudieron guardar los logos. Intente con imágenes de menor resolución.");
        }
    };

    const handleRemoveLogo = (field) => {
        setLogosForm(p => ({ ...p, [field]: null }));
    };

    const handleConfigChange = (e) => {
        const { name, value, type, checked } = e.target;
        setConfig(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSaveConfig = async (e) => {
        if (e) e.preventDefault();
        setSaving(true);
        try {
            await axiosInstance.post('secretaria/configuracion/', config);
            toast.success("Configuración global actualizada con éxito.");
            fetchData();
        } catch (err) {
            const msg = err.response?.data?.error || err.response?.data?.detail || "No se pudo guardar la configuración.";
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    const handleUpdateCupos = async (id, cupos_maximos) => {
        const val = parseInt(cupos_maximos);
        if (isNaN(val)) return;

        try {
            await axiosInstance.patch(`secretaria/configuracion-grados/${id}/`, { cupos_maximos: val });
            toast.success("Capacidad de grado actualizada.");
            setGrados(prev => prev.map(g => g.id === id ? { ...g, cupos_maximos: val } : g));
        } catch (err) {
            const msg = err.response?.data?.error || err.response?.data?.detail || "Error al actualizar cupos.";
            toast.error(msg);
        }
    };

    const openCreateGrado = () => {
        setGradoEditando(null);
        setGradoForm({ grado_seccion: '', cupos_maximos: 30 });
        setShowGradoModal(true);
    };

    const openEditGrado = (grado) => {
        setGradoEditando(grado);
        setGradoForm({ grado_seccion: grado.grado_seccion, cupos_maximos: grado.cupos_maximos });
        setShowGradoModal(true);
    };

    const handleSaveGrado = async () => {
        if (!gradoForm.grado_seccion.trim()) { toast.error("El nombre del grado es requerido."); return; }
        setGradoSaving(true);
        try {
            if (gradoEditando) {
                await axiosInstance.patch(`secretaria/configuracion-grados/${gradoEditando.id}/`, gradoForm);
                toast.success("Grado actualizado.");
            } else {
                await axiosInstance.post('secretaria/configuracion-grados/', gradoForm);
                toast.success("Grado agregado.");
            }
            setShowGradoModal(false);
            fetchData();
        } catch (err) {
            const msg = err.response?.data?.grado_seccion?.[0] || err.response?.data?.detail || "Error al guardar el grado.";
            toast.error(msg);
        } finally {
            setGradoSaving(false);
        }
    };

    const confirmarEliminarGrado = (grado) => {
        setGradoAEliminar(grado);
        setShowDeleteGradoModal(true);
    };

    const handleDeleteGrado = async () => {
        if (!gradoAEliminar) return;
        try {
            await axiosInstance.delete(`secretaria/configuracion-grados/${gradoAEliminar.id}/`);
            toast.success("Grado eliminado.");
            setShowDeleteGradoModal(false);
            setGradoAEliminar(null);
            fetchData();
        } catch (err) {
            const msg = err.response?.data?.detail || "No se pudo eliminar el grado.";
            toast.error(msg);
        }
    };

    const handlePromote = async () => {
        setPromoting(true);
        try {
            const res = await axiosInstance.post('secretaria/promover-alumnos/', {
                periodo_destino: periodoDestino 
            });
            toast.success(res?.data?.mensaje || "Proceso de promoción completado.");
            setShowPromoModal(false);
            fetchData();
        } catch (err) {
            const msg = err.response?.data?.error || err.response?.data?.detail || "Error crítico durante la promoción masiva.";
            toast.error(msg);
        } finally {
            setPromoting(false);
        }
    };

    const fetchTiposCargo = useCallback(async () => {
        setTiposCargoLoading(true);
        try {
            const res = await axiosInstance.get('rrhh/tipos-cargo/');
            setTiposCargo(res.data || []);
        } catch {
            toast.error("No se pudieron cargar los tipos de cargo.");
        } finally {
            setTiposCargoLoading(false);
        }
    }, []);

    useEffect(() => { fetchTiposCargo(); }, [fetchTiposCargo]);

    const openCreateTipoCargo = () => {
        setTipoCargoEditando(null);
        setTipoCargoForm({ nombre: '', descripcion: '', activo: true });
        setShowTipoCargoModal(true);
    };

    const openEditTipoCargo = (tipo) => {
        setTipoCargoEditando(tipo);
        setTipoCargoForm({ nombre: tipo.nombre, descripcion: tipo.descripcion || '', activo: tipo.activo });
        setShowTipoCargoModal(true);
    };

    const handleSaveTipoCargo = async () => {
        if (!tipoCargoForm.nombre.trim()) { toast.error("El nombre del cargo es requerido."); return; }
        setTipoCargoSaving(true);
        try {
            if (tipoCargoEditando) {
                await axiosInstance.patch(`rrhh/tipos-cargo/${tipoCargoEditando.id}/`, tipoCargoForm);
                toast.success("Tipo de cargo actualizado.");
            } else {
                await axiosInstance.post('rrhh/tipos-cargo/', tipoCargoForm);
                toast.success("Tipo de cargo agregado.");
            }
            setShowTipoCargoModal(false);
            fetchTiposCargo();
        } catch (err) {
            const msg = err.response?.data?.nombre?.[0] || err.response?.data?.detail || "Error al guardar el tipo de cargo.";
            toast.error(msg);
        } finally {
            setTipoCargoSaving(false);
        }
    };

    const confirmarEliminarTipo = (tipo) => {
        setTipoCargoAEliminar(tipo);
        setShowDeleteTipoModal(true);
    };

    const handleDeleteTipoCargo = async () => {
        if (!tipoCargoAEliminar) return;
        try {
            await axiosInstance.delete(`rrhh/tipos-cargo/${tipoCargoAEliminar.id}/`);
            toast.success("Tipo de cargo eliminado.");
            setShowDeleteTipoModal(false);
            setTipoCargoAEliminar(null);
            fetchTiposCargo();
        } catch (err) {
            const msg = err.response?.data?.detail || "No se pudo eliminar el tipo de cargo.";
            toast.error(msg);
        }
    };

    const fetchBancosNomina = useCallback(async () => {
        setBancosNominaLoading(true);
        try {
            const res = await axiosInstance.get('rrhh/bancos-nomina/');
            setBancosNomina(res.data || []);
        } catch {
            toast.error("No se pudieron cargar los bancos de nómina.");
        } finally {
            setBancosNominaLoading(false);
        }
    }, []);

    useEffect(() => { fetchBancosNomina(); }, [fetchBancosNomina]);

    const openCreateBancoNomina = () => {
        setBancoNominaEditando(null);
        setBancoNominaForm({ nombre: '', activo: true });
        setShowBancoNominaModal(true);
    };

    const openEditBancoNomina = (banco) => {
        setBancoNominaEditando(banco);
        setBancoNominaForm({ nombre: banco.nombre, activo: banco.activo });
        setShowBancoNominaModal(true);
    };

    const handleSaveBancoNomina = async () => {
        if (!bancoNominaForm.nombre.trim()) { toast.error("El nombre del banco es requerido."); return; }
        setBancoNominaSaving(true);
        try {
            if (bancoNominaEditando) {
                await axiosInstance.patch(`rrhh/bancos-nomina/${bancoNominaEditando.id}/`, bancoNominaForm);
                toast.success("Banco de nómina actualizado.");
            } else {
                await axiosInstance.post('rrhh/bancos-nomina/', bancoNominaForm);
                toast.success("Banco de nómina agregado.");
            }
            setShowBancoNominaModal(false);
            fetchBancosNomina();
        } catch (err) {
            const msg = err.response?.data?.nombre?.[0] || err.response?.data?.detail || "Error al guardar el banco.";
            toast.error(msg);
        } finally {
            setBancoNominaSaving(false);
        }
    };

    const confirmarEliminarBancoNomina = (banco) => {
        setBancoNominaAEliminar(banco);
        setShowDeleteBancoNominaModal(true);
    };

    const handleDeleteBancoNomina = async () => {
        if (!bancoNominaAEliminar) return;
        try {
            await axiosInstance.delete(`rrhh/bancos-nomina/${bancoNominaAEliminar.id}/`);
            toast.success("Banco de nómina eliminado.");
            setShowDeleteBancoNominaModal(false);
            setBancoNominaAEliminar(null);
            fetchBancosNomina();
        } catch (err) {
            const msg = err.response?.data?.detail || "No se pudo eliminar el banco.";
            toast.error(msg);
        }
    };

    const fetchBancos = useCallback(async () => {
        setBancosLoading(true);
        try {
            const res = await axiosInstance.get('cobranza/bancos/admin/');
            setBancos(res.data || []);
        } catch {
            toast.error("No se pudieron cargar los bancos.");
        } finally {
            setBancosLoading(false);
        }
    }, []);

    useEffect(() => { fetchBancos(); }, [fetchBancos]);

    const openCreateModal = () => {
        setBancoEditando(null);
        setBancoForm({ nombre: '', numero_cuenta: '', tipo: 'general', activo: true });
        setShowBancoModal(true);
    };

    const openEditModal = (banco) => {
        setBancoEditando(banco);
        setBancoForm({ nombre: banco.nombre, numero_cuenta: banco.numero_cuenta || '', tipo: banco.tipo, activo: banco.activo });
        setShowBancoModal(true);
    };

    const handleSaveBanco = async () => {
        if (!bancoForm.nombre.trim()) { toast.error("El nombre del banco es requerido."); return; }
        setBancoSaving(true);
        try {
            if (bancoEditando) {
                await axiosInstance.patch(`cobranza/bancos/admin/${bancoEditando.id}/`, bancoForm);
                toast.success("Banco actualizado.");
            } else {
                await axiosInstance.post('cobranza/bancos/admin/', bancoForm);
                toast.success("Banco agregado.");
            }
            setShowBancoModal(false);
            fetchBancos();
        } catch (err) {
            const msg = err.response?.data?.nombre?.[0] || err.response?.data?.detail || "Error al guardar el banco.";
            toast.error(msg);
        } finally {
            setBancoSaving(false);
        }
    };

    const handleToggleActivo = async (banco) => {
        try {
            await axiosInstance.patch(`cobranza/bancos/admin/${banco.id}/`, { activo: !banco.activo });
            setBancos(prev => prev.map(b => b.id === banco.id ? { ...b, activo: !b.activo } : b));
        } catch {
            toast.error("No se pudo actualizar el estado del banco.");
        }
    };

    const handleDeleteBanco = async (id) => {
        try {
            const res = await axiosInstance.delete(`cobranza/bancos/admin/${id}/`);
            if (res.status === 204) {
                toast.success("Banco eliminado permanentemente.");
            } else {
                toast.warning("Banco desactivado. Tiene pagos asociados y no puede eliminarse.");
            }
            fetchBancos();
        } catch {
            toast.error("No se pudo eliminar el banco.");
        }
    };

    // Verificación de autorización en el cliente
    const isAuthorized = user && ['director', 'sistemas', 'administrador'].includes(user.rol);

    if (!isAuthorized && !loading) return (
        <div className="flex flex-col items-center justify-center p-20 text-center">
            <AlertTriangle size={48} className="mb-4 text-red-500" />
            <h2 className="text-xl font-bold" style={{ color: 'var(--jet)' }}>Acceso Restringido</h2>
            <p className="text-sm mt-2" style={{ color: 'var(--ash)' }}>
                Su perfil no tiene permisos para modificar los parámetros maestros del sistema.
            </p>
        </div>
    );

    if (loading) return (
        <div className="flex flex-col items-center justify-center p-20">
            <Loader2 className="animate-spin mb-4" size={40} style={{ color: 'var(--pb)' }} />
            <p className="font-medium text-sm" style={{ color: 'var(--ash)' }}>Sincronizando parámetros Octopus...</p>
        </div>
    );

    return (
        <div className="max-w-6xl mx-auto space-y-6 animate-fadeIn pb-20">

            {/* Page Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-2.5 rounded-xl" style={{ background: 'var(--pb-light)' }}>
                        <Settings size={20} style={{ color: 'var(--pb)' }} />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold" style={{ color: 'var(--jet)' }}>Configuración del Sistema</h2>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>Períodos escolares, inscripciones y parámetros de cobro</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {config?.periodo_escolar_activo && (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
                            style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}>
                            {config.periodo_escolar_activo}
                        </span>
                    )}
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
                        style={config?.inscripciones_abiertas
                            ? { background: '#dcfce7', color: '#16a34a' }
                            : { background: 'var(--red-light)', color: 'var(--red)' }}>
                        {config?.inscripciones_abiertas ? 'Inscripciones abiertas' : 'Inscripciones cerradas'}
                    </span>
                    <button onClick={fetchData} disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)', background: 'var(--porcelain)' }}>
                        <RefreshCcw size={13} className={loading ? 'animate-spin' : ''} />
                        Actualizar
                    </button>
                </div>
            </div>

            {/* Main Form Grid */}
            <form onSubmit={handleSaveConfig} className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left Column */}
                <div className="lg:col-span-2 space-y-5">

                    {/* Datos del Colegio */}
                    <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                        <div className="px-5 py-3.5 flex items-center gap-3" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                            <div className="p-1.5 rounded-lg" style={{ background: 'var(--pb-light)' }}>
                                <School size={15} style={{ color: 'var(--pb)' }} />
                            </div>
                            <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Datos del Colegio</h3>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Nombre del Colegio</label>
                                    <input type="text" name="nombre_colegio" value={config?.nombre_colegio || ''} onChange={handleConfigChange}
                                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                        placeholder="Ej. U.E. Mi Colegio" />
                                </div>
                                <div>
                                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>RIF</label>
                                    <input type="text" name="rif" value={config?.rif || ''} onChange={handleConfigChange}
                                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                        placeholder="Ej. J-12345678-9" />
                                </div>
                                <div>
                                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Teléfono</label>
                                    <div className="relative">
                                        <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
                                        <input type="text" name="telefono_colegio" value={config?.telefono_colegio || ''} onChange={handleConfigChange}
                                            className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none"
                                            style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                            placeholder="Ej. 0212-1234567" />
                                    </div>
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Correo Electrónico</label>
                                    <div className="relative">
                                        <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
                                        <input type="email" name="correo_colegio" value={config?.correo_colegio || ''} onChange={handleConfigChange}
                                            className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none"
                                            style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                            placeholder="Ej. info@colegio.edu.ve" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Municipio</label>
                                    <input type="text" name="municipio" value={config?.municipio || ''} onChange={handleConfigChange}
                                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                        placeholder="Ej. Sucre" />
                                </div>
                                <div>
                                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Estado</label>
                                    <input type="text" name="estado_colegio" value={config?.estado_colegio || ''} onChange={handleConfigChange}
                                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                        placeholder="Ej. Miranda" />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Dirección</label>
                                    <div className="relative">
                                        <MapPin size={13} className="absolute left-3 top-3" style={{ color: 'var(--ash)' }} />
                                        <textarea name="direccion_colegio" value={config?.direccion_colegio || ''} onChange={handleConfigChange}
                                            rows={2}
                                            className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none resize-none"
                                            style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                            placeholder="Dirección completa del colegio" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Año Escolar */}
                    <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                        <div className="px-5 py-3.5 flex items-center gap-3" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                            <div className="p-1.5 rounded-lg" style={{ background: 'var(--pb-light)' }}>
                                <Calendar size={15} style={{ color: 'var(--pb)' }} />
                            </div>
                            <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Año Escolar</h3>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Período Activo</label>
                                <input type="text" name="periodo_escolar_activo" value={config?.periodo_escolar_activo || ''} onChange={handleConfigChange}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none font-medium"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Inicio del Año</label>
                                    <DatePickerES name="fecha_inicio_ano_escolar" value={config?.fecha_inicio_ano_escolar || ''} onChange={handleConfigChange}
                                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} />
                                </div>
                                <div>
                                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Fin del Año</label>
                                    <DatePickerES name="fecha_fin_ano_escolar" value={config?.fecha_fin_ano_escolar || ''} onChange={handleConfigChange}
                                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Inscripciones */}
                    <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                        <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded-lg" style={{ background: '#dcfce7' }}>
                                    <CheckCircle size={15} style={{ color: '#16a34a' }} />
                                </div>
                                <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Proceso de Inscripción</h3>
                            </div>
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                                style={config?.inscripciones_abiertas
                                    ? { background: '#dcfce7', color: '#16a34a' }
                                    : { background: 'var(--red-light)', color: 'var(--red)' }}>
                                {config?.inscripciones_abiertas ? 'Abiertas' : 'Cerradas'}
                            </span>
                        </div>
                        <div className="p-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Inicio Inscripciones</label>
                                    <DatePickerES name="fecha_inicio_inscripciones" value={config?.fecha_inicio_inscripciones || ''} onChange={handleConfigChange}
                                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} />
                                </div>
                                <div>
                                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Cierre Inscripciones</label>
                                    <DatePickerES name="fecha_fin_inscripciones" value={config?.fecha_fin_inscripciones || ''} onChange={handleConfigChange}
                                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Control de Cupos */}
                    <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                        <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded-lg" style={{ background: 'var(--pb-light)' }}>
                                    <BarChart3 size={15} style={{ color: 'var(--pb)' }} />
                                </div>
                                <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Control de Cupos</h3>
                            </div>
                            <button type="button" onClick={openCreateGrado}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                                style={{ background: 'var(--pb)' }}>
                                <Plus size={13} /> Agregar Grado
                            </button>
                        </div>
                        {grados.length === 0 ? (
                            <div className="flex flex-col items-center py-10" style={{ color: 'var(--ash)' }}>
                                <BarChart3 size={30} className="mb-2 opacity-20" />
                                <p className="text-sm">No hay grados configurados.</p>
                            </div>
                        ) : (
                            <table className="w-full text-left">
                                <thead>
                                    <tr style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                                        {['Grado', 'Ocupación', 'Límite', 'Acciones'].map(h => (
                                            <th key={h} className="px-5 py-3 text-[11px] uppercase tracking-widest"
                                                style={{ color: 'var(--ash)', background: 'var(--bg)' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {grados?.map((g) => {
                                        const pct = Math.min(100, (g?.cupos_utilizados / (g?.cupos_maximos || 1)) * 100);
                                        const isOver = pct > 90;
                                        return (
                                            <tr key={g.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                                                <td className="px-5 py-3.5 text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                                    {g?.grado_seccion}
                                                </td>
                                                <td className="px-5 py-3.5 w-1/3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--ash-light)' }}>
                                                            <div className="h-full rounded-full transition-all"
                                                                style={{ width: `${pct}%`, background: isOver ? 'var(--red)' : 'var(--pb)' }} />
                                                        </div>
                                                        <span className="text-[11px] font-semibold w-12 text-right"
                                                            style={{ color: isOver ? 'var(--red)' : 'var(--ash)' }}>
                                                            {g?.cupos_utilizados}/{g?.cupos_maximos}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <input type="number" defaultValue={g.cupos_maximos}
                                                        onBlur={(e) => handleUpdateCupos(g.id, parseInt(e.target.value))}
                                                        className="w-16 px-2 py-1.5 rounded-lg text-xs font-bold text-center outline-none"
                                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} />
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <div className="flex items-center gap-1.5">
                                                        <button type="button" onClick={() => openEditGrado(g)}
                                                            className="p-1.5 rounded-lg"
                                                            style={{ color: 'var(--pb)', background: 'var(--pb-light)' }}
                                                            title="Editar">
                                                            <Pencil size={13} />
                                                        </button>
                                                        <button type="button" onClick={() => confirmarEliminarGrado(g)}
                                                            className="p-1.5 rounded-lg"
                                                            style={{ color: 'var(--red)', background: 'var(--red-light)' }}
                                                            title="Eliminar">
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* Right Sidebar */}
                <div className="space-y-5 self-start sticky" style={{ top: '66px' }}>

                    {/* Panel Cobros */}
                    <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                        <div className="px-5 py-3.5 flex items-center gap-3" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                            <div className="p-1.5 rounded-lg" style={{ background: '#fef9c3' }}>
                                <Clock size={15} style={{ color: '#ca8a04' }} />
                            </div>
                            <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Panel de Cobros</h3>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Día Límite de Pago</label>
                                <input type="number" name="dia_limite_pago" value={config?.dia_limite_pago || 5} onChange={handleConfigChange}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none font-bold"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} />
                            </div>
                            <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--bg)', border: '0.5px solid var(--border)' }}>
                                <span className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Notificaciones</span>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" name="notificaciones_activas" className="sr-only peer"
                                        checked={config?.notificaciones_activas || false} onChange={handleConfigChange} />
                                    <div className="w-11 h-6 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"
                                        style={{ background: config?.notificaciones_activas ? 'var(--pb)' : 'var(--ash-light)' }}></div>
                                </label>
                            </div>
                            <button type="submit" disabled={saving}
                                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
                                style={{ background: 'var(--pb)' }}>
                                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                                Guardar Configuración
                            </button>
                        </div>
                    </div>

                    {/* Zona Crítica: Promover Alumnos */}
                    <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                        <div className="px-5 py-3 flex items-center gap-2" style={{ background: 'var(--red-light)', borderBottom: '0.5px solid var(--border-md)' }}>
                            <AlertTriangle size={13} style={{ color: 'var(--red)' }} />
                            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--red)' }}>Zona Crítica</span>
                        </div>
                        <div className="p-5 space-y-3">
                            <p className="text-xs leading-relaxed" style={{ color: 'var(--ash)' }}>
                                Mueve todos los alumnos activos al grado siguiente para iniciar el nuevo período escolar.
                            </p>
                            <button type="button" onClick={() => setShowPromoModal(true)}
                                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-semibold text-white"
                                style={{ background: 'var(--jet)' }}>
                                <UserPlus size={15} /> Promover Alumnos
                            </button>
                        </div>
                    </div>
                </div>
            </form>

            {/* Logos del Recibo */}
            <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg" style={{ background: 'var(--pb-light)' }}>
                            <Image size={15} style={{ color: 'var(--pb)' }} />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Logos del Recibo de Pago</h3>
                            <p className="text-[11px]" style={{ color: 'var(--ash)' }}>Se mostrarán automáticamente en el encabezado del recibo</p>
                        </div>
                    </div>
                    <button type="button" onClick={openLogosModal}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                        style={{ background: 'var(--pb)' }}>
                        <Pencil size={13} /> Configurar
                    </button>
                </div>
                <div className="p-5">
                    <div className="grid grid-cols-2 gap-6">
                        <div className="flex flex-col items-center gap-3">
                            <p className="text-[11px] uppercase tracking-widest self-start" style={{ color: 'var(--ash)' }}>Logo Colegio</p>
                            {logosRecibo.logoColegio
                                ? <img src={logosRecibo.logoColegio} alt="Logo Colegio" className="w-20 h-20 object-contain rounded-lg" style={{ border: '0.5px solid var(--border-md)' }} />
                                : <div className="w-20 h-20 rounded-lg flex flex-col items-center justify-center gap-1"
                                    style={{ border: '1.5px dashed var(--border-md)', color: 'var(--ash)' }}>
                                    <Image size={20} className="opacity-30" />
                                    <span className="text-[10px]">Sin logo</span>
                                </div>
                            }
                        </div>
                        <div className="flex flex-col items-center gap-3">
                            <p className="text-[11px] uppercase tracking-widest self-start" style={{ color: 'var(--ash)' }}>Logo AVEC</p>
                            {logosRecibo.logoAvec
                                ? <img src={logosRecibo.logoAvec} alt="Logo AVEC" className="w-20 h-20 object-contain rounded-lg" style={{ border: '0.5px solid var(--border-md)' }} />
                                : <div className="w-20 h-20 rounded-lg flex flex-col items-center justify-center gap-1"
                                    style={{ border: '1.5px dashed var(--border-md)', color: 'var(--ash)' }}>
                                    <Image size={20} className="opacity-30" />
                                    <span className="text-[10px]">Sin logo</span>
                                </div>
                            }
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Sections: three columns on large screens */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Bancos y Medios de Pago */}
                <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                    <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                        <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded-lg" style={{ background: 'var(--pb-light)' }}>
                                <Building size={15} style={{ color: 'var(--pb)' }} />
                            </div>
                            <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Bancos y Medios de Pago</h3>
                        </div>
                        <button type="button" onClick={openCreateModal}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                            style={{ background: 'var(--pb)' }}>
                            <Plus size={13} /> Agregar
                        </button>
                    </div>
                    {bancosLoading ? (
                        <div className="flex justify-center py-10">
                            <Loader2 className="animate-spin" size={22} style={{ color: 'var(--pb)' }} />
                        </div>
                    ) : bancos.length === 0 ? (
                        <div className="flex flex-col items-center py-10" style={{ color: 'var(--ash)' }}>
                            <Building size={30} className="mb-2 opacity-20" />
                            <p className="text-sm">No hay bancos registrados.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                                        {['Banco / Tipo', 'Estado', ''].map((h, i) => (
                                            <th key={i} className="px-5 py-3 text-[11px] uppercase tracking-widest"
                                                style={{ color: 'var(--ash)', background: 'var(--bg)' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {bancos.map(banco => (
                                        <tr key={banco.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                                            <td className="px-5 py-3.5">
                                                <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{banco.nombre}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px]" style={{ color: 'var(--ash)' }}>{banco.numero_cuenta || '—'}</span>
                                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                                                        style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}>
                                                        {TIPO_LABELS[banco.tipo] || banco.tipo}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input type="checkbox" className="sr-only peer" checked={banco.activo}
                                                        onChange={() => handleToggleActivo(banco)} />
                                                    <div className="w-10 h-5 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"
                                                        style={{ background: banco.activo ? 'var(--pb)' : 'var(--ash-light)' }}></div>
                                                </label>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-1.5 justify-end">
                                                    <button type="button" onClick={() => openEditModal(banco)}
                                                        className="p-1.5 rounded-lg"
                                                        style={{ color: 'var(--pb)', background: 'var(--pb-light)' }}
                                                        title="Editar">
                                                        <Pencil size={13} />
                                                    </button>
                                                    <button type="button" onClick={() => handleDeleteBanco(banco.id)}
                                                        className="p-1.5 rounded-lg"
                                                        style={{ color: 'var(--red)', background: 'var(--red-light)' }}
                                                        title="Eliminar">
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Bancos de Nómina */}
                <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                    <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                        <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded-lg" style={{ background: 'var(--pb-light)' }}>
                                <Landmark size={15} style={{ color: 'var(--pb)' }} />
                            </div>
                            <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Bancos de Nómina</h3>
                        </div>
                        <button type="button" onClick={openCreateBancoNomina}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                            style={{ background: 'var(--pb)' }}>
                            <Plus size={13} /> Agregar
                        </button>
                    </div>
                    {bancosNominaLoading ? (
                        <div className="flex justify-center py-10">
                            <Loader2 className="animate-spin" size={22} style={{ color: 'var(--pb)' }} />
                        </div>
                    ) : bancosNomina.length === 0 ? (
                        <div className="flex flex-col items-center py-10" style={{ color: 'var(--ash)' }}>
                            <Landmark size={30} className="mb-2 opacity-20" />
                            <p className="text-sm">No hay bancos de nómina registrados.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                                        {['Banco', 'Estado', ''].map((h, i) => (
                                            <th key={i} className="px-5 py-3 text-[11px] uppercase tracking-widest"
                                                style={{ color: 'var(--ash)', background: 'var(--bg)' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {bancosNomina.map(banco => (
                                        <tr key={banco.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                                            <td className="px-5 py-3.5">
                                                <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{banco.nombre}</p>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                                                    style={banco.activo
                                                        ? { background: '#dcfce7', color: '#16a34a' }
                                                        : { background: 'var(--red-light)', color: 'var(--red)' }}>
                                                    {banco.activo ? 'Activo' : 'Inactivo'}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-1.5 justify-end">
                                                    <button type="button" onClick={() => openEditBancoNomina(banco)}
                                                        className="p-1.5 rounded-lg"
                                                        style={{ color: 'var(--pb)', background: 'var(--pb-light)' }}
                                                        title="Editar">
                                                        <Pencil size={13} />
                                                    </button>
                                                    <button type="button" onClick={() => confirmarEliminarBancoNomina(banco)}
                                                        className="p-1.5 rounded-lg"
                                                        style={{ color: 'var(--red)', background: 'var(--red-light)' }}
                                                        title="Eliminar">
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Tipos de Cargo */}
                <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                    <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                        <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded-lg" style={{ background: 'var(--pb-light)' }}>
                                <Briefcase size={15} style={{ color: 'var(--pb)' }} />
                            </div>
                            <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Tipos de Cargo</h3>
                        </div>
                        <button type="button" onClick={openCreateTipoCargo}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                            style={{ background: 'var(--pb)' }}>
                            <Plus size={13} /> Agregar
                        </button>
                    </div>
                    {tiposCargoLoading ? (
                        <div className="flex justify-center py-10">
                            <Loader2 className="animate-spin" size={22} style={{ color: 'var(--pb)' }} />
                        </div>
                    ) : tiposCargo.length === 0 ? (
                        <div className="flex flex-col items-center py-10" style={{ color: 'var(--ash)' }}>
                            <Briefcase size={30} className="mb-2 opacity-20" />
                            <p className="text-sm">No hay tipos de cargo registrados.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                                        {['Cargo', 'Estado', ''].map((h, i) => (
                                            <th key={i} className="px-5 py-3 text-[11px] uppercase tracking-widest"
                                                style={{ color: 'var(--ash)', background: 'var(--bg)' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {tiposCargo.map(tipo => (
                                        <tr key={tipo.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                                            <td className="px-5 py-3.5">
                                                <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>{tipo.nombre}</p>
                                                {tipo.descripcion && (
                                                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--ash)' }}>{tipo.descripcion}</p>
                                                )}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                                                    style={tipo.activo
                                                        ? { background: '#dcfce7', color: '#16a34a' }
                                                        : { background: 'var(--red-light)', color: 'var(--red)' }}>
                                                    {tipo.activo ? 'Activo' : 'Inactivo'}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-1.5 justify-end">
                                                    <button type="button" onClick={() => openEditTipoCargo(tipo)}
                                                        className="p-1.5 rounded-lg"
                                                        style={{ color: 'var(--pb)', background: 'var(--pb-light)' }}
                                                        title="Editar">
                                                        <Pencil size={13} />
                                                    </button>
                                                    <button type="button" onClick={() => confirmarEliminarTipo(tipo)}
                                                        className="p-1.5 rounded-lg"
                                                        style={{ color: 'var(--red)', background: 'var(--red-light)' }}
                                                        title="Eliminar">
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {showLogosModal && (
                <div className="fixed inset-0 flex items-center justify-center z-[100] p-4" style={{ background: 'rgba(43,48,58,0.55)' }}>
                    <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl animate-fadeInUp" style={{ background: 'var(--porcelain)' }}>
                        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                            <div className="flex items-center gap-2">
                                <Image size={18} style={{ color: 'var(--pb)' }} />
                                <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Configurar Logos del Recibo</h3>
                            </div>
                            <button type="button" onClick={() => setShowLogosModal(false)}>
                                <X size={18} style={{ color: 'var(--ash)' }} />
                            </button>
                        </div>
                        <div className="p-6 grid grid-cols-2 gap-6">
                            {[
                                { field: 'logoColegio', label: 'Logo Colegio' },
                                { field: 'logoAvec', label: 'Logo AVEC' },
                            ].map(({ field, label }) => (
                                <div key={field} className="flex flex-col items-center gap-3">
                                    <p className="text-[11px] uppercase tracking-widest font-semibold self-start" style={{ color: 'var(--ash)' }}>{label}</p>
                                    <div className="w-full flex flex-col items-center gap-3 p-4 rounded-xl" style={{ border: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                                        {logosForm[field]
                                            ? <img src={logosForm[field]} alt={label} className="w-24 h-24 object-contain rounded-lg" style={{ border: '0.5px solid var(--border-md)' }} />
                                            : <div className="w-24 h-24 rounded-lg flex flex-col items-center justify-center gap-2"
                                                style={{ border: '1.5px dashed var(--border-md)', color: 'var(--ash)' }}>
                                                <Image size={28} className="opacity-25" />
                                                <span className="text-[10px]">Sin imagen</span>
                                            </div>
                                        }
                                        <label className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg cursor-pointer w-full justify-center font-medium"
                                            style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)', border: '0.5px dashed var(--pb)' }}>
                                            <Upload size={13} />
                                            {logosForm[field] ? 'Cambiar imagen' : 'Subir imagen'}
                                            <input type="file" accept="image/*" className="hidden" onChange={e => handleLogosUpload(field, e)} />
                                        </label>
                                        {logosForm[field] && (
                                            <button type="button" onClick={() => handleRemoveLogo(field)}
                                                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg w-full justify-center font-medium"
                                                style={{ color: 'var(--red)', background: 'var(--red-light)' }}>
                                                <Trash size={13} /> Eliminar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="px-6 pb-6">
                            <p className="text-[11px] mb-4 px-3 py-2 rounded-lg" style={{ color: 'var(--ash)', background: 'var(--bg)', border: '0.5px solid var(--border)' }}>
                                Los logos se guardan localmente en este navegador y se cargan automáticamente al generar recibos de pago.
                            </p>
                            <div className="flex gap-3">
                                <button type="button" onClick={() => setShowLogosModal(false)}
                                    className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                                    style={{ background: 'var(--bg)', color: 'var(--ash)', border: '0.5px solid var(--border-md)' }}>
                                    Cancelar
                                </button>
                                <button type="button" onClick={handleSaveLogos}
                                    className="flex-[2] py-2.5 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2"
                                    style={{ background: 'var(--pb)' }}>
                                    <Save size={16} /> Guardar logos
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showGradoModal && (
                <div className="fixed inset-0 flex items-center justify-center z-[100] p-4" style={{ background: 'rgba(43,48,58,0.55)' }}>
                    <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-fadeInUp" style={{ background: 'var(--porcelain)' }}>
                        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                            <div className="flex items-center gap-2" style={{ color: 'var(--pb)' }}>
                                <BarChart3 size={18} />
                                <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>
                                    {gradoEditando ? 'Editar Grado' : 'Agregar Grado'}
                                </h3>
                            </div>
                            <button type="button" onClick={() => setShowGradoModal(false)}>
                                <X size={18} style={{ color: 'var(--ash)' }} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Nombre del Grado *</label>
                                <input type="text" value={gradoForm.grado_seccion}
                                    onChange={e => setGradoForm(p => ({ ...p, grado_seccion: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                    placeholder="Ej. Sala de 4, Kinder primera etapa, 1er Grado" />
                            </div>
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Cupos Máximos</label>
                                <input type="number" value={gradoForm.cupos_maximos} min={1}
                                    onChange={e => setGradoForm(p => ({ ...p, cupos_maximos: parseInt(e.target.value) || 1 }))}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none font-bold"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} />
                            </div>
                        </div>
                        <div className="flex gap-3 px-6 pb-6">
                            <button type="button" onClick={() => setShowGradoModal(false)}
                                className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                                style={{ background: 'var(--bg)', color: 'var(--ash)', border: '0.5px solid var(--border-md)' }}>
                                Cancelar
                            </button>
                            <button type="button" onClick={handleSaveGrado} disabled={gradoSaving}
                                className="flex-[2] py-2.5 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
                                style={{ background: 'var(--pb)' }}>
                                {gradoSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showDeleteGradoModal && (
                <div className="fixed inset-0 flex items-center justify-center z-[100] p-4" style={{ background: 'rgba(43,48,58,0.55)' }}>
                    <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl animate-fadeInUp" style={{ background: 'var(--porcelain)' }}>
                        <div className="p-6 flex flex-col items-center text-center" style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                            <AlertTriangle size={28} className="mb-3" />
                            <h3 className="text-base font-bold">Eliminar Grado</h3>
                            <p className="text-sm mt-1 opacity-80">¿Eliminar <b>{gradoAEliminar?.grado_seccion}</b>? Esta acción no se puede deshacer.</p>
                        </div>
                        <div className="flex gap-3 p-6">
                            <button type="button" onClick={() => { setShowDeleteGradoModal(false); setGradoAEliminar(null); }}
                                className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                                style={{ background: 'var(--bg)', color: 'var(--ash)', border: '0.5px solid var(--border-md)' }}>
                                Cancelar
                            </button>
                            <button type="button" onClick={handleDeleteGrado}
                                className="flex-[2] py-2.5 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2"
                                style={{ background: 'var(--red)' }}>
                                <Trash2 size={16} /> Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showTipoCargoModal && (
                <div className="fixed inset-0 flex items-center justify-center z-[100] p-4" style={{ background: 'rgba(43,48,58,0.55)' }}>
                    <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-fadeInUp" style={{ background: 'var(--porcelain)' }}>
                        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                            <div className="flex items-center gap-2" style={{ color: 'var(--pb)' }}>
                                <Briefcase size={18} />
                                <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>
                                    {tipoCargoEditando ? 'Editar Tipo de Cargo' : 'Agregar Tipo de Cargo'}
                                </h3>
                            </div>
                            <button type="button" onClick={() => setShowTipoCargoModal(false)}>
                                <X size={18} style={{ color: 'var(--ash)' }} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Nombre del Cargo *</label>
                                <input type="text" value={tipoCargoForm.nombre}
                                    onChange={e => setTipoCargoForm(p => ({ ...p, nombre: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                    placeholder="Ej. Profesor, Administrativo" />
                            </div>
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Descripción</label>
                                <input type="text" value={tipoCargoForm.descripcion}
                                    onChange={e => setTipoCargoForm(p => ({ ...p, descripcion: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                    placeholder="Opcional" />
                            </div>
                            {tipoCargoEditando && (
                                <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--bg)', border: '0.5px solid var(--border)' }}>
                                    <span className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Activo</span>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" className="sr-only peer" checked={tipoCargoForm.activo}
                                            onChange={e => setTipoCargoForm(p => ({ ...p, activo: e.target.checked }))} />
                                        <div className="w-11 h-6 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"
                                            style={{ background: tipoCargoForm.activo ? 'var(--pb)' : 'var(--ash-light)' }}></div>
                                    </label>
                                </div>
                            )}
                        </div>
                        <div className="flex gap-3 px-6 pb-6">
                            <button type="button" onClick={() => setShowTipoCargoModal(false)}
                                className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                                style={{ background: 'var(--bg)', color: 'var(--ash)', border: '0.5px solid var(--border-md)' }}>
                                Cancelar
                            </button>
                            <button type="button" onClick={handleSaveTipoCargo} disabled={tipoCargoSaving}
                                className="flex-[2] py-2.5 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
                                style={{ background: 'var(--pb)' }}>
                                {tipoCargoSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showDeleteTipoModal && (
                <div className="fixed inset-0 flex items-center justify-center z-[100] p-4" style={{ background: 'rgba(43,48,58,0.55)' }}>
                    <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl animate-fadeInUp" style={{ background: 'var(--porcelain)' }}>
                        <div className="p-6 flex flex-col items-center text-center" style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                            <AlertTriangle size={28} className="mb-3" />
                            <h3 className="text-base font-bold">Eliminar Tipo de Cargo</h3>
                            <p className="text-sm mt-1 opacity-80">¿Eliminar <b>{tipoCargoAEliminar?.nombre}</b>? Esta acción no se puede deshacer.</p>
                        </div>
                        <div className="flex gap-3 p-6">
                            <button type="button" onClick={() => { setShowDeleteTipoModal(false); setTipoCargoAEliminar(null); }}
                                className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                                style={{ background: 'var(--bg)', color: 'var(--ash)', border: '0.5px solid var(--border-md)' }}>
                                Cancelar
                            </button>
                            <button type="button" onClick={handleDeleteTipoCargo}
                                className="flex-[2] py-2.5 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2"
                                style={{ background: 'var(--red)' }}>
                                <Trash2 size={16} /> Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showBancoModal && (
                <div className="fixed inset-0 flex items-center justify-center z-[100] p-4" style={{ background: 'rgba(43,48,58,0.55)' }}>
                    <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-fadeInUp" style={{ background: 'var(--porcelain)' }}>
                        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                            <div className="flex items-center gap-2" style={{ color: 'var(--pb)' }}>
                                <Building size={18} />
                                <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>
                                    {bancoEditando ? 'Editar Banco' : 'Agregar Banco'}
                                </h3>
                            </div>
                            <button type="button" onClick={() => setShowBancoModal(false)}>
                                <X size={18} style={{ color: 'var(--ash)' }} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Nombre del Banco *</label>
                                <input type="text" value={bancoForm.nombre} onChange={e => setBancoForm(p => ({ ...p, nombre: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                    placeholder="Ej. Banesco" />
                            </div>
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Número de Cuenta</label>
                                <input type="text" value={bancoForm.numero_cuenta} onChange={e => setBancoForm(p => ({ ...p, numero_cuenta: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                    placeholder="Opcional" />
                            </div>
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Tipo de Banco</label>
                                <select value={bancoForm.tipo} onChange={e => setBancoForm(p => ({ ...p, tipo: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}>
                                    {Object.entries(TIPO_LABELS).map(([val, label]) => (
                                        <option key={val} value={val}>{label}</option>
                                    ))}
                                </select>
                            </div>
                            {bancoEditando && (
                                <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--bg)', border: '0.5px solid var(--border)' }}>
                                    <span className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Activo</span>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" className="sr-only peer" checked={bancoForm.activo}
                                            onChange={e => setBancoForm(p => ({ ...p, activo: e.target.checked }))} />
                                        <div className="w-11 h-6 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"
                                            style={{ background: bancoForm.activo ? 'var(--pb)' : 'var(--ash-light)' }}></div>
                                    </label>
                                </div>
                            )}
                        </div>
                        <div className="flex gap-3 px-6 pb-6">
                            <button type="button" onClick={() => setShowBancoModal(false)}
                                className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                                style={{ background: 'var(--bg)', color: 'var(--ash)', border: '0.5px solid var(--border-md)' }}>
                                Cancelar
                            </button>
                            <button type="button" onClick={handleSaveBanco} disabled={bancoSaving}
                                className="flex-[2] py-2.5 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
                                style={{ background: 'var(--pb)' }}>
                                {bancoSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showBancoNominaModal && (
                <div className="fixed inset-0 flex items-center justify-center z-[100] p-4" style={{ background: 'rgba(43,48,58,0.55)' }}>
                    <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-fadeInUp" style={{ background: 'var(--porcelain)' }}>
                        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                            <div className="flex items-center gap-2" style={{ color: 'var(--pb)' }}>
                                <Landmark size={18} />
                                <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>
                                    {bancoNominaEditando ? 'Editar Banco de Nómina' : 'Agregar Banco de Nómina'}
                                </h3>
                            </div>
                            <button type="button" onClick={() => setShowBancoNominaModal(false)}>
                                <X size={18} style={{ color: 'var(--ash)' }} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Nombre del Banco *</label>
                                <input type="text" value={bancoNominaForm.nombre}
                                    onChange={e => setBancoNominaForm(p => ({ ...p, nombre: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                    placeholder="Ej. Banesco, Mercantil, BNC" />
                            </div>
                            {bancoNominaEditando && (
                                <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--bg)', border: '0.5px solid var(--border)' }}>
                                    <span className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Activo</span>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" className="sr-only peer" checked={bancoNominaForm.activo}
                                            onChange={e => setBancoNominaForm(p => ({ ...p, activo: e.target.checked }))} />
                                        <div className="w-11 h-6 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"
                                            style={{ background: bancoNominaForm.activo ? 'var(--pb)' : 'var(--ash-light)' }}></div>
                                    </label>
                                </div>
                            )}
                        </div>
                        <div className="flex gap-3 px-6 pb-6">
                            <button type="button" onClick={() => setShowBancoNominaModal(false)}
                                className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                                style={{ background: 'var(--bg)', color: 'var(--ash)', border: '0.5px solid var(--border-md)' }}>
                                Cancelar
                            </button>
                            <button type="button" onClick={handleSaveBancoNomina} disabled={bancoNominaSaving}
                                className="flex-[2] py-2.5 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
                                style={{ background: 'var(--pb)' }}>
                                {bancoNominaSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showDeleteBancoNominaModal && (
                <div className="fixed inset-0 flex items-center justify-center z-[100] p-4" style={{ background: 'rgba(43,48,58,0.55)' }}>
                    <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl animate-fadeInUp" style={{ background: 'var(--porcelain)' }}>
                        <div className="p-6 flex flex-col items-center text-center" style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                            <AlertTriangle size={28} className="mb-3" />
                            <h3 className="text-base font-bold">Eliminar Banco de Nómina</h3>
                            <p className="text-sm mt-1 opacity-80">¿Eliminar <b>{bancoNominaAEliminar?.nombre}</b>? Esta acción no se puede deshacer.</p>
                        </div>
                        <div className="flex gap-3 p-6">
                            <button type="button" onClick={() => { setShowDeleteBancoNominaModal(false); setBancoNominaAEliminar(null); }}
                                className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                                style={{ background: 'var(--bg)', color: 'var(--ash)', border: '0.5px solid var(--border-md)' }}>
                                Cancelar
                            </button>
                            <button type="button" onClick={handleDeleteBancoNomina}
                                className="flex-[2] py-2.5 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2"
                                style={{ background: 'var(--red)' }}>
                                <Trash2 size={16} /> Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showPromoModal && (
                <div className="fixed inset-0 flex items-center justify-center z-[100] p-4" style={{ background: 'rgba(43,48,58,0.55)' }}>
                    <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-fadeInUp" style={{ background: 'var(--porcelain)' }}>
                        <div className="px-6 py-5 flex flex-col items-center text-center" style={{ background: 'var(--red-light)', borderBottom: '0.5px solid var(--border-md)' }}>
                            <div className="p-3 rounded-full mb-3" style={{ background: 'rgba(220,38,38,0.12)' }}>
                                <AlertTriangle size={24} style={{ color: 'var(--red)' }} />
                            </div>
                            <h3 className="text-base font-bold" style={{ color: 'var(--jet)' }}>Confirmar Promoción Masiva</h3>
                            <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--ash)' }}>
                                Se moverán todos los alumnos activos al grado superior para el período <b style={{ color: 'var(--jet)' }}>{periodoDestino}</b>. Esta acción no se puede deshacer.
                            </p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Período Destino</label>
                                <input type="text" value={periodoDestino} onChange={(e) => setPeriodoDestino(e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-lg outline-none font-bold text-center text-base"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} />
                            </div>
                            <div className="flex gap-3">
                                <button type="button" onClick={() => setShowPromoModal(false)}
                                    className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                                    style={{ background: 'var(--bg)', color: 'var(--ash)', border: '0.5px solid var(--border-md)' }}>
                                    Cancelar
                                </button>
                                <button type="button" onClick={handlePromote} disabled={promoting}
                                    className="flex-[2] py-2.5 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                                    style={{ background: 'var(--red)' }}>
                                    {promoting ? <Loader2 className="animate-spin" size={16} /> : <UserPlus size={16} />}
                                    Iniciar Proceso
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Configuracion;