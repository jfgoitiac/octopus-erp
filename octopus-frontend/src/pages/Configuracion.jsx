import { useState, useEffect, useCallback, useContext } from 'react';
import {
    Settings, Calendar, UserPlus, AlertTriangle, Save,
    RefreshCcw, CheckCircle, X, Info, Loader2, BarChart3, Clock,
    Building, Plus, Pencil, Trash2
} from 'lucide-react';

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

    // Bank management state
    const [bancos, setBancos] = useState([]);
    const [bancosLoading, setBancosLoading] = useState(false);
    const [showBancoModal, setShowBancoModal] = useState(false);
    const [bancoEditando, setBancoEditando] = useState(null);
    const [bancoForm, setBancoForm] = useState({ nombre: '', numero_cuenta: '', tipo: 'general', activo: true });
    const [bancoSaving, setBancoSaving] = useState(false);

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
            console.error("Error fetching config:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

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
        <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn pb-20">
            <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4"> {/* CORRECCIÓN 6: Header de página */}
                <div> 
                    <h2 className="text-lg font-medium" style={{ color: 'var(--jet)' }}>Configuración del Sistema</h2>
                    <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>Gestión de períodos escolares, inscripciones y parámetros de cobro.</p>
                </div>
                {/* CORRECCIÓN 4: Botón secundario */}
                <button onClick={fetchData} disabled={loading}
                    className="flex items-center justify-center gap-2 p-2 rounded-lg transition-all disabled:opacity-50"
                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                    <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            <form onSubmit={handleSaveConfig} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <div className="rounded-xl p-5 space-y-6" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}> {/* CORRECCIÓN 7: Card principal */}
                        <div className="flex items-center gap-3" style={{ color: 'var(--pb)' }}>
                            <Calendar size={20} />
                            <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>Panel Año Escolar</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="md:col-span-2">
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Período Activo</label> {/* CORRECCIÓN 2: Label estándar */}
                                <input type="text" name="periodo_escolar_activo" value={config?.periodo_escolar_activo || ''} onChange={handleConfigChange} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} /> {/* CORRECCIÓN 1: Input estándar */}
                            </div>
                            <div key="fecha_inicio_ano">
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Fecha Inicio Año</label> {/* CORRECCIÓN 2: Label estándar */}
                                <input type="date" name="fecha_inicio_ano_escolar" value={config?.fecha_inicio_ano_escolar || ''} onChange={handleConfigChange} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} /> {/* CORRECCIÓN 1: Input estándar */}
                            </div>
                            <div key="fecha_fin_ano">
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Fecha Fin Año</label> {/* CORRECCIÓN 2: Label estándar */}
                                <input type="date" name="fecha_fin_ano_escolar" value={config?.fecha_fin_ano_escolar || ''} onChange={handleConfigChange} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} /> {/* CORRECCIÓN 1: Input estándar */}
                            </div>
                        </div>
                        <div className="pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                            <button type="button" onClick={() => setShowPromoModal(true)}
                                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all" style={{ background: 'var(--jet)' }}>
                                <UserPlus size={16} /> Promover Alumnos {/* Acción especial */}
                            </button>
                        </div>
                    </div>

                    <div className="rounded-xl p-5 space-y-6" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}> {/* CORRECCIÓN 7: Card principal */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3" style={{ color: 'var(--pb)' }}>
                                <CheckCircle size={20} />
                                <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>Proceso de Inscripción</h3>
                            </div>
                            {/* Badge de estado de inscripciones */}
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider`} style={config?.inscripciones_abiertas ? { background: '#dcfce7', color: '#16a34a' } : { background: 'var(--red-light)', color: 'var(--red)' }}>
                                {config?.inscripciones_abiertas ? 'Abiertas' : 'Cerradas'}
                            </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div key="fecha_inicio_ins">
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Inicio Inscripciones</label> {/* CORRECCIÓN 2: Label estándar */}
                                <input type="date" name="fecha_inicio_inscripciones" value={config?.fecha_inicio_inscripciones || ''} onChange={handleConfigChange} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} /> {/* CORRECCIÓN 1: Input estándar */}
                            </div>
                            <div key="fecha_fin_ins">
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Cierre Inscripciones</label> {/* CORRECCIÓN 2: Label estándar */}
                                <input type="date" name="fecha_fin_inscripciones" value={config?.fecha_fin_inscripciones || ''} onChange={handleConfigChange} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} /> {/* CORRECCIÓN 1: Input estándar */}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl p-5 space-y-6" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}> {/* CORRECCIÓN 7: Card principal */}
                        <div className="flex items-center gap-3" style={{ color: 'var(--pb)' }}>
                            <BarChart3 size={20} />
                            <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>Control de Cupos</h3>
                        </div>
                        <table className="w-full text-left">
                            <thead>
                                <tr> {/* CORRECCIÓN 8: Headers de tabla */}
                                    {['Grado', 'Progreso', 'Límite'].map(h => (
                                        <th key={h} className={`px-4 py-3 text-[11px] uppercase tracking-widest ${h === 'Límite' ? 'text-right' : ''}`}
                                            style={{ color: 'var(--ash)', background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {grados?.map((g) => {
                                    const pct = Math.min(100, (g?.cupos_utilizados / (g?.cupos_maximos || 1)) * 100);
                                    return (
                                        <tr key={g.id} style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}> {/* CORRECCIÓN 9: Filas de tabla */}
                                            <td className="px-4 py-4 text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                                <div className="flex flex-col">
                                                    <span>{g?.grado_seccion?.split(' - ')[0]}</span>
                                                    <span className="text-[10px] text-slate-400 font-normal uppercase tracking-widest">Sección Única</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 w-1/3">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--ash-light)' }}>
                                                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct > 90 ? 'var(--red)' : 'var(--pb)' }} />
                                                    </div>
                                                    <span className="text-[10px] font-bold" style={{ color: 'var(--ash)' }}>{g?.cupos_utilizados}/{g?.cupos_maximos}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-right">
                                                <input type="number" defaultValue={g.cupos_maximos} onBlur={(e) => handleUpdateCupos(g.id, parseInt(e.target.value))} 
                                                    className="w-16 px-2 py-1 rounded-lg text-xs font-bold text-center outline-none" 
                                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} /> {/* CORRECCIÓN 1: Input estándar */}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="rounded-xl p-5 space-y-6 sticky top-8" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}> {/* CORRECCIÓN 7: Card principal */}
                        <div className="flex items-center gap-3" style={{ color: 'var(--pb)' }}>
                            <Clock size={20} />
                            <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>Panel Cobros</h3>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Día Límite de Pago</label> {/* CORRECCIÓN 2: Label estándar */}
                                <input type="number" name="dia_limite_pago" value={config?.dia_limite_pago || 5} onChange={handleConfigChange} className="w-full px-3 py-2 rounded-lg text-sm outline-none font-bold" style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} /> {/* CORRECCIÓN 1: Input estándar */}
                            </div>
                            <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--bg)', border: '0.5px solid var(--border)' }}>
                                <span className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>Notificaciones</span>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" name="notificaciones_activas" className="sr-only peer" checked={config?.notificaciones_activas || false} onChange={handleConfigChange} />
                                    <div className="w-11 h-6 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" style={{ background: config?.notificaciones_activas ? 'var(--pb)' : 'var(--ash-light)' }}></div>
                                </label>
                            </div>
                        </div>
                        <button type="submit" disabled={saving}
                            className="flex items-center justify-center gap-2 w-full py-3 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50" style={{ background: 'var(--pb)' }}>
                            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Guardar Configuración {/* CORRECCIÓN 3: Botón primario */}
                        </button>
                    </div>
                </div>
            </form>

            {/* ── Bancos y Medios de Pago ── */}
            <div className="rounded-xl p-5 space-y-4" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Building size={20} style={{ color: 'var(--pb)' }} />
                        <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>Bancos y Medios de Pago</h3>
                    </div>
                    <button type="button" onClick={openCreateModal}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-white"
                        style={{ background: 'var(--pb)' }}>
                        <Plus size={14} /> Agregar Banco
                    </button>
                </div>

                {bancosLoading ? (
                    <div className="flex justify-center py-6">
                        <Loader2 className="animate-spin" size={24} style={{ color: 'var(--pb)' }} />
                    </div>
                ) : bancos.length === 0 ? (
                    <p className="text-sm text-center py-4" style={{ color: 'var(--ash)' }}>No hay bancos registrados.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr>
                                    {['Banco', 'N° Cuenta', 'Tipo', 'Estado', 'Acciones'].map(h => (
                                        <th key={h} className="px-4 py-3 text-[11px] uppercase tracking-widest"
                                            style={{ color: 'var(--ash)', borderBottom: '0.5px solid var(--border-md)' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {bancos.map(banco => (
                                    <tr key={banco.id} style={{ borderBottom: '0.5px solid var(--border)' }}>
                                        <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--jet)' }}>{banco.nombre}</td>
                                        <td className="px-4 py-3 text-sm" style={{ color: 'var(--ash)' }}>{banco.numero_cuenta || '—'}</td>
                                        <td className="px-4 py-3">
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                                                style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}>
                                                {TIPO_LABELS[banco.tipo] || banco.tipo}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input type="checkbox" className="sr-only peer" checked={banco.activo}
                                                    onChange={() => handleToggleActivo(banco)} />
                                                <div className="w-11 h-6 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"
                                                    style={{ background: banco.activo ? 'var(--pb)' : 'var(--ash-light)' }}></div>
                                            </label>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <button type="button" onClick={() => openEditModal(banco)}
                                                    className="p-1.5 rounded-lg transition-all"
                                                    style={{ color: 'var(--pb)', border: '0.5px solid var(--border-md)' }}
                                                    title="Editar">
                                                    <Pencil size={14} />
                                                </button>
                                                <button type="button" onClick={() => handleDeleteBanco(banco.id)}
                                                    className="p-1.5 rounded-lg transition-all"
                                                    style={{ color: 'var(--red)', border: '0.5px solid var(--border-md)' }}
                                                    title="Eliminar">
                                                    <Trash2 size={14} />
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

            {showPromoModal && (
                <div className="fixed inset-0 flex items-center justify-center z-[100] p-4" style={{ background: 'rgba(43,48,58,0.55)' }}>
                    <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-fadeInUp" style={{ background: 'var(--porcelain)' }}>
                        <div className="p-8 flex flex-col items-center text-center" style={{ background: 'var(--red-light)', color: 'var(--red)' }}>
                            <AlertTriangle size={32} className="mb-4" />
                            <h3 className="text-lg font-bold tracking-tight">Confirmar Promoción</h3>
                            <p className="text-sm mt-2 opacity-80">Se moverán todos los alumnos al grado superior del período <b>{periodoDestino}</b>.</p>
                        </div>
                        <div className="p-8 space-y-6">
                            <input type="text" value={periodoDestino} onChange={(e) => setPeriodoDestino(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-octopus-blue outline-none font-bold text-center text-xl" />
                            <div className="flex gap-4">
                                <button onClick={() => setShowPromoModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-bold">Cancelar</button>
                                <button onClick={handlePromote} disabled={promoting} className="flex-[2] py-4 bg-rose-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2">
                                    {promoting ? <Loader2 className="animate-spin" /> : <UserPlus size={20} />} Iniciar Proceso
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