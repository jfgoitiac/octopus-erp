import { useEffect, useContext } from 'react';
import {
    Settings, Calendar, UserPlus, AlertTriangle, Save,
    RefreshCcw, CheckCircle, X, Loader2, BarChart3, Clock,
    Building, Plus, Pencil, Trash2, Briefcase, School, Phone, Mail, MapPin, Landmark,
    Image, Upload, Trash, MessageCircle, Bell, CheckCircle2, XCircle, ExternalLink, Check,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AuthContext } from '../context/AuthContext';
import DatePickerES from '../components/DatePickerES';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { useConfiguracion } from '../hooks/useConfiguracion';
import { useGrados } from '../hooks/useGrados';
import { useBancosCobranza } from '../hooks/useBancosCobranza';
import { useBancosNomina } from '../hooks/useBancosNomina';
import { useTiposCargo } from '../hooks/useTiposCargo';
import { useNotificaciones, PAGE_SIZE_LOGS } from '../hooks/useNotificaciones';
import { useLogosRecibo } from '../hooks/useLogosRecibo';

const TIPO_LABELS = {
    general:        'General',
    transferencia:  'Transferencia',
    pago_movil:     'Pago Móvil',
    punto_de_venta: 'Punto de Venta',
    zelle:          'Zelle',
};

const Configuracion = () => {
    const { user } = useContext(AuthContext);

    const {
        config, loading, saving, periodoDestino, setPeriodoDestino,
        showPromoModal, setShowPromoModal, promoting,
        fetchConfig, handleConfigChange, handleSaveConfig, handlePromote,
    } = useConfiguracion();

    const {
        grados, gradosLoading,
        showGradoModal, setShowGradoModal, gradoEditando, gradoForm, setGradoForm,
        gradoSaving, showDeleteGradoModal, setShowDeleteGradoModal, gradoAEliminar, setGradoAEliminar,
        fetchGrados, handleUpdateCupos, openCreateGrado, openEditGrado, handleSaveGrado,
        confirmarEliminarGrado, handleDeleteGrado,
    } = useGrados();

    const {
        bancos, bancosLoading,
        showBancoModal, setShowBancoModal, bancoEditando, bancoForm, setBancoForm, bancoSaving,
        showDeleteBancoModal, setShowDeleteBancoModal, bancoAEliminar, setBancoAEliminar,
        fetchBancos, openCreateModal, openEditModal, handleSaveBanco,
        handleToggleActivo, confirmarEliminarBanco, handleDeleteBanco,
    } = useBancosCobranza();

    const {
        bancosNomina, bancosNominaLoading,
        showBancoNominaModal, setShowBancoNominaModal, bancoNominaEditando,
        bancoNominaForm, setBancoNominaForm, bancoNominaSaving,
        showDeleteBancoNominaModal, setShowDeleteBancoNominaModal,
        bancoNominaAEliminar, setBancoNominaAEliminar,
        fetchBancosNomina, openCreateBancoNomina, openEditBancoNomina,
        handleSaveBancoNomina, confirmarEliminarBancoNomina, handleDeleteBancoNomina,
    } = useBancosNomina();

    const {
        tiposCargo, tiposCargoLoading,
        showTipoCargoModal, setShowTipoCargoModal, tipoCargoEditando,
        tipoCargoForm, setTipoCargoForm, tipoCargoSaving,
        showDeleteTipoModal, setShowDeleteTipoModal, tipoCargoAEliminar, setTipoCargoAEliminar,
        fetchTiposCargo, openCreateTipoCargo, openEditTipoCargo, handleSaveTipoCargo,
        confirmarEliminarTipo, handleDeleteTipoCargo,
    } = useTiposCargo();

    const {
        configNotif, logsNotif, pruebaForm, setPruebaForm,
        pruebaCargando, pruebaResultado, logsFiltro, setLogsFiltro,
        logsLoading, cargarConfigNotificaciones, handleEnviarPrueba,
        aplicarFiltrosLogs, cambiarPaginaLogs,
    } = useNotificaciones();

    const {
        logosRecibo, showLogosModal, setShowLogosModal, logosForm,
        openLogosModal, handleLogosUpload, handleRemoveLogo, handleSaveLogos,
    } = useLogosRecibo();

    const handleRefreshAll = () => {
        fetchConfig();
        fetchGrados();
        fetchBancos();
        fetchBancosNomina();
        fetchTiposCargo();
        cargarConfigNotificaciones();
    };

    // Cerrar cualquier modal al presionar Escape
    useEffect(() => {
        const handler = (e) => {
            if (e.key !== 'Escape') return;
            setShowLogosModal(false);
            setShowGradoModal(false);
            setShowBancoModal(false);
            setShowBancoNominaModal(false);
            setShowTipoCargoModal(false);
            setShowPromoModal(false);
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
                    <button onClick={handleRefreshAll} disabled={loading}
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
                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
                                        placeholder="Ej. U.E. Mi Colegio" />
                                </div>
                                <div>
                                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>RIF</label>
                                    <input type="text" name="rif" value={config?.rif || ''} onChange={handleConfigChange}
                                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
                                        placeholder="Ej. J-12345678-9" />
                                </div>
                                <div>
                                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Teléfono</label>
                                    <div className="relative">
                                        <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
                                        <input type="tel" name="telefono_colegio" value={config?.telefono_colegio || ''} onChange={handleConfigChange}
                                            className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none"
                                            style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
                                            placeholder="Ej. 0212-1234567" />
                                    </div>
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Correo Electrónico</label>
                                    <div className="relative">
                                        <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ash)' }} />
                                        <input type="email" name="correo_colegio" value={config?.correo_colegio || ''} onChange={handleConfigChange}
                                            className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none"
                                            style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
                                            placeholder="Ej. info@colegio.edu.ve" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Municipio</label>
                                    <input type="text" name="municipio" value={config?.municipio || ''} onChange={handleConfigChange}
                                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
                                        placeholder="Ej. Sucre" />
                                </div>
                                <div>
                                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Estado</label>
                                    <input type="text" name="estado_colegio" value={config?.estado_colegio || ''} onChange={handleConfigChange}
                                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
                                        placeholder="Ej. Miranda" />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Dirección</label>
                                    <div className="relative">
                                        <MapPin size={13} className="absolute left-3 top-3" style={{ color: 'var(--ash)' }} />
                                        <textarea name="direccion_colegio" value={config?.direccion_colegio || ''} onChange={handleConfigChange}
                                            rows={2}
                                            className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none resize-none"
                                            style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
                                            placeholder="Dirección completa del colegio" />
                                    </div>
                                </div>

                                {/* Personalización visual del portal */}
                                <div className="col-span-2 pt-2" style={{ borderTop: '0.5px solid var(--border-md)' }}>
                                    <p className="text-[11px] uppercase tracking-widest mb-3 font-medium" style={{ color: 'var(--pb)' }}>Personalización visual del portal</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Color Primario</label>
                                            <div className="flex items-center gap-2">
                                                <input type="color" name="color_primario" value={config?.color_primario || '#0fa3b1'} onChange={handleConfigChange}
                                                    className="h-9 w-10 rounded cursor-pointer border-0 p-0.5"
                                                    style={{ border: '0.5px solid var(--border-md)' }} />
                                                <input type="text" name="color_primario" value={config?.color_primario || '#0fa3b1'} onChange={handleConfigChange}
                                                    maxLength={7}
                                                    className="flex-1 px-3 py-2 rounded-lg text-sm outline-none font-mono"
                                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
                                                    placeholder="#0fa3b1" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Color Secundario</label>
                                            <div className="flex items-center gap-2">
                                                <input type="color" name="color_secundario" value={config?.color_secundario || '#1f3864'} onChange={handleConfigChange}
                                                    className="h-9 w-10 rounded cursor-pointer border-0 p-0.5"
                                                    style={{ border: '0.5px solid var(--border-md)' }} />
                                                <input type="text" name="color_secundario" value={config?.color_secundario || '#1f3864'} onChange={handleConfigChange}
                                                    maxLength={7}
                                                    className="flex-1 px-3 py-2 rounded-lg text-sm outline-none font-mono"
                                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
                                                    placeholder="#1f3864" />
                                            </div>
                                        </div>
                                        <div className="sm:col-span-2">
                                            <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>URL del Logo</label>
                                            <input type="url" name="logo_url" value={config?.logo_url || ''} onChange={handleConfigChange}
                                                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                                style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
                                                placeholder="https://ejemplo.com/logo.png" />
                                            {config?.logo_url && (
                                                <div className="mt-2 flex items-center gap-3">
                                                    <img src={config.logo_url} alt="Preview logo"
                                                        className="h-10 w-auto object-contain rounded border"
                                                        style={{ border: '0.5px solid var(--border-md)' }}
                                                        onError={e => { e.target.style.display = 'none'; }} />
                                                    <span className="text-xs" style={{ color: 'var(--ash)' }}>Vista previa del logo</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="sm:col-span-2">
                                            <button type="button"
                                                onClick={() => window.open('/portal', '_blank')}
                                                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                                                style={{ background: 'var(--pb-light)', color: 'var(--pb)' }}>
                                                <ExternalLink size={14} />
                                                Vista previa del portal
                                            </button>
                                        </div>
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
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Inicio del Año</label>
                                    <DatePickerES name="fecha_inicio_ano_escolar" value={config?.fecha_inicio_ano_escolar || ''} onChange={handleConfigChange}
                                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }} />
                                </div>
                                <div>
                                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Fin del Año</label>
                                    <DatePickerES name="fecha_fin_ano_escolar" value={config?.fecha_fin_ano_escolar || ''} onChange={handleConfigChange}
                                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }} />
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
                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }} />
                                </div>
                                <div>
                                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Cierre Inscripciones</label>
                                    <DatePickerES name="fecha_fin_inscripciones" value={config?.fecha_fin_inscripciones || ''} onChange={handleConfigChange}
                                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }} />
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
                        {gradosLoading ? (
                            <div className="flex justify-center py-10">
                                <Loader2 className="animate-spin" size={22} style={{ color: 'var(--pb)' }} />
                            </div>
                        ) : grados.length === 0 ? (
                            <div className="flex flex-col items-center py-10" style={{ color: 'var(--ash)' }}>
                                <BarChart3 size={30} className="mb-2 opacity-20" />
                                <p className="text-sm">No hay grados configurados.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left min-w-[480px]">
                                    <thead>
                                        <tr style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                                            {['Grado', 'Ocupación', 'Límite', 'Acciones'].map(h => (
                                                <th key={h} className="px-5 py-3 text-[11px] uppercase tracking-widest"
                                                    style={{ color: 'var(--ash)', background: 'var(--bg)' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {grados.map((g) => {
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
                                                            style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }} />
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
                            </div>
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
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }} />
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
                                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50 min-h-[44px]"
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
                        {[
                            { key: 'logoColegio', label: 'Logo Colegio' },
                            { key: 'logoAvec', label: 'Logo AVEC' },
                        ].map(({ key, label }) => (
                            <div key={key} className="flex flex-col items-center gap-3">
                                <p className="text-[11px] uppercase tracking-widest self-start" style={{ color: 'var(--ash)' }}>{label}</p>
                                {logosRecibo[key]
                                    ? <img src={logosRecibo[key]} alt={label} className="w-20 h-20 object-contain rounded-lg" style={{ border: '0.5px solid var(--border-md)' }} />
                                    : <div className="w-20 h-20 rounded-lg flex flex-col items-center justify-center gap-1"
                                        style={{ border: '1.5px dashed var(--border-md)', color: 'var(--ash)' }}>
                                        <Image size={20} className="opacity-30" />
                                        <span className="text-[10px]">Sin logo</span>
                                    </div>
                                }
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Bottom Sections: three columns */}
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
                                                    <button type="button" onClick={() => confirmarEliminarBanco(banco)}
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

            {/* Panel de Notificaciones */}
            <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                <div className="px-5 py-3.5 flex items-center gap-3" style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                    <div className="p-1.5 rounded-lg" style={{ background: 'var(--pb-light)' }}>
                        <Bell size={15} style={{ color: 'var(--pb)' }} />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold" style={{ color: 'var(--jet)' }}>Notificaciones</h3>
                        <p className="text-[11px]" style={{ color: 'var(--ash)' }}>Estado de canales, pruebas de envío e historial</p>
                    </div>
                </div>

                <div className="p-5 space-y-6">

                    {/* Estado de canales */}
                    {configNotif && (
                        <div>
                            <p className="text-[11px] uppercase tracking-widest mb-3 font-medium" style={{ color: 'var(--pb)' }}>Estado de canales</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="rounded-xl p-4" style={{ border: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                                    <div className="flex items-center gap-2 mb-3">
                                        <Mail size={18} className="text-[#0fa3b1]" />
                                        <span className="font-semibold text-sm" style={{ color: 'var(--jet)' }}>Email</span>
                                        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
                                            configNotif.email?.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                        }`}>
                                            {configNotif.email?.activo ? 'Activo' : 'Solo consola'}
                                        </span>
                                    </div>
                                    <div className="space-y-1 text-xs" style={{ color: 'var(--ash)' }}>
                                        <p>Backend: <span style={{ color: 'var(--jet)' }}>{configNotif.email?.backend || '—'}</span></p>
                                        <p>Host: <span style={{ color: 'var(--jet)' }}>{configNotif.email?.host || '—'}</span></p>
                                        <p>Desde: <span style={{ color: 'var(--jet)' }}>{configNotif.email?.from || '—'}</span></p>
                                    </div>
                                </div>
                                <div className="rounded-xl p-4" style={{ border: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                                    <div className="flex items-center gap-2 mb-3">
                                        <MessageCircle size={18} className="text-green-600" />
                                        <span className="font-semibold text-sm" style={{ color: 'var(--jet)' }}>WhatsApp</span>
                                        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
                                            configNotif.whatsapp?.activo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                                        }`}>
                                            {configNotif.whatsapp?.activo ? configNotif.whatsapp?.proveedor : 'No configurado'}
                                        </span>
                                    </div>
                                    <div className="space-y-1 text-xs" style={{ color: 'var(--ash)' }}>
                                        <p>Twilio: <span className={configNotif.whatsapp?.twilio_configurado ? 'text-green-600 inline-flex items-center gap-1' : 'text-gray-400 inline-flex items-center gap-1'}>
                                            {configNotif.whatsapp?.twilio_configurado
                                                ? <><Check size={11} />Configurado</>
                                                : <><X size={11} />Sin configurar</>}
                                        </span></p>
                                        <p>Meta Business: <span className={configNotif.whatsapp?.meta_configurado ? 'text-green-600 inline-flex items-center gap-1' : 'text-gray-400 inline-flex items-center gap-1'}>
                                            {configNotif.whatsapp?.meta_configurado
                                                ? <><Check size={11} />Configurado</>
                                                : <><X size={11} />Sin configurar</>}
                                        </span></p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Enviar mensaje de prueba */}
                    <div style={{ borderTop: '0.5px solid var(--border-md)', paddingTop: '1.25rem' }}>
                        <p className="text-[11px] uppercase tracking-widest mb-3 font-medium" style={{ color: 'var(--pb)' }}>Enviar mensaje de prueba</p>
                        <form onSubmit={handleEnviarPrueba} className="space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Canal</label>
                                    <select
                                        value={pruebaForm.canal}
                                        onChange={e => setPruebaForm(p => ({ ...p, canal: e.target.value }))}
                                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}>
                                        <option value="email">Email</option>
                                        <option value="whatsapp">WhatsApp</option>
                                        <option value="ambos">Ambos</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                        {pruebaForm.canal === 'whatsapp' ? 'Número de teléfono' : 'Correo electrónico'}
                                    </label>
                                    <input
                                        type={pruebaForm.canal === 'whatsapp' ? 'tel' : 'email'}
                                        value={pruebaForm.destino}
                                        onChange={e => setPruebaForm(p => ({ ...p, destino: e.target.value }))}
                                        placeholder={pruebaForm.canal === 'whatsapp' ? '+58 4XX XXXXXXX' : 'correo@ejemplo.com'}
                                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
                                        required />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Mensaje (opcional — usa el predeterminado si se omite)</label>
                                <textarea
                                    value={pruebaForm.mensaje}
                                    onChange={e => setPruebaForm(p => ({ ...p, mensaje: e.target.value }))}
                                    rows={2}
                                    placeholder="Mensaje de prueba desde el sistema Octopus..."
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }} />
                            </div>
                            <div className="flex items-center gap-3 flex-wrap">
                                <button type="submit" disabled={pruebaCargando}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-all"
                                    style={{ background: 'var(--pb)' }}>
                                    {pruebaCargando ? <Loader2 size={15} className="animate-spin" /> : <Bell size={15} />}
                                    Enviar prueba
                                </button>
                                {pruebaResultado && (
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {pruebaResultado.ok ? (
                                            Object.entries(pruebaResultado.data || {}).map(([canal, estado]) => (
                                                <span key={canal} className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${
                                                    estado === 'enviado' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                }`}>
                                                    {estado === 'enviado' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                                                    {canal}: {estado}
                                                </span>
                                            ))
                                        ) : (
                                            <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium bg-red-100 text-red-700">
                                                <XCircle size={12} /> {pruebaResultado.error}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </form>
                    </div>

                    {/* Historial de notificaciones */}
                    <div style={{ borderTop: '0.5px solid var(--border-md)', paddingTop: '1.25rem' }}>
                        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                            <p className="text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--pb)' }}>Historial de notificaciones</p>
                            <div className="flex items-center gap-2 flex-wrap">
                                <select
                                    value={logsFiltro.canal}
                                    onChange={e => setLogsFiltro(p => ({ ...p, canal: e.target.value }))}
                                    className="px-2.5 py-1.5 rounded-lg text-xs outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}>
                                    <option value="">Todos los canales</option>
                                    <option value="email">Email</option>
                                    <option value="whatsapp">WhatsApp</option>
                                </select>
                                <select
                                    value={logsFiltro.estado}
                                    onChange={e => setLogsFiltro(p => ({ ...p, estado: e.target.value }))}
                                    className="px-2.5 py-1.5 rounded-lg text-xs outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}>
                                    <option value="">Todos los estados</option>
                                    <option value="enviado">Enviado</option>
                                    <option value="fallido">Fallido</option>
                                    <option value="pendiente">Pendiente</option>
                                </select>
                                <button type="button" onClick={aplicarFiltrosLogs}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                                    style={{ background: 'var(--pb)' }}>
                                    Aplicar
                                </button>
                            </div>
                        </div>

                        {logsLoading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="animate-spin" size={22} style={{ color: 'var(--pb)' }} />
                            </div>
                        ) : (logsNotif.results || []).length === 0 ? (
                            <div className="flex flex-col items-center py-10" style={{ color: 'var(--ash)' }}>
                                <Bell size={30} className="mb-2 opacity-20" />
                                <p className="text-sm">No hay notificaciones registradas.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-xl" style={{ border: '0.5px solid var(--border-md)' }}>
                                <table className="w-full text-left">
                                    <thead>
                                        <tr style={{ borderBottom: '0.5px solid var(--border-md)' }}>
                                            {['Fecha', 'Canal', 'Tipo', 'Destinatario', 'Estado', 'Proveedor'].map(h => (
                                                <th key={h} className="px-4 py-3 text-[11px] uppercase tracking-widest whitespace-nowrap"
                                                    style={{ color: 'var(--ash)', background: 'var(--bg)' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(logsNotif.results || []).map((log, idx) => (
                                            <tr key={log.id ?? idx} style={{ borderBottom: '0.5px solid var(--border)' }}>
                                                <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--ash)' }}>
                                                    {log.fecha
                                                        ? format(new Date(log.fecha), 'dd/MM/yy HH:mm', { locale: es })
                                                        : '—'}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                                        log.canal === 'email' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                                                    }`}>
                                                        {log.canal === 'email' ? 'Email' : 'WhatsApp'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-xs" style={{ color: 'var(--jet)' }}>{log.tipo || '—'}</td>
                                                <td className="px-4 py-3 text-xs" style={{ color: 'var(--jet)' }}>{log.destinatario || '—'}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`flex items-center gap-1 w-fit text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                                        log.estado === 'enviado'
                                                            ? 'bg-green-100 text-green-700'
                                                            : log.estado === 'fallido'
                                                                ? 'bg-red-100 text-red-700'
                                                                : 'bg-yellow-100 text-yellow-700'
                                                    }`}>
                                                        {log.estado === 'enviado' && <CheckCircle2 size={10} />}
                                                        {log.estado === 'fallido' && <XCircle size={10} />}
                                                        {log.estado === 'pendiente' && <Clock size={10} />}
                                                        {log.estado || '—'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-xs" style={{ color: 'var(--ash)' }}>{log.proveedor || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {logsNotif.total > PAGE_SIZE_LOGS && (
                            <div className="flex items-center justify-between mt-3">
                                <span className="text-xs" style={{ color: 'var(--ash)' }}>
                                    {logsNotif.total} registros — página {logsFiltro.page} de {Math.ceil(logsNotif.total / PAGE_SIZE_LOGS)}
                                </span>
                                <div className="flex items-center gap-2">
                                    <button type="button"
                                        disabled={logsFiltro.page <= 1}
                                        onClick={() => cambiarPaginaLogs(logsFiltro.page - 1)}
                                        className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40"
                                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)', background: 'var(--bg)' }}>
                                        Anterior
                                    </button>
                                    <button type="button"
                                        disabled={logsFiltro.page >= Math.ceil(logsNotif.total / PAGE_SIZE_LOGS)}
                                        onClick={() => cambiarPaginaLogs(logsFiltro.page + 1)}
                                        className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40"
                                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)', background: 'var(--bg)' }}>
                                        Siguiente
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Modales ── */}

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
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
                                    placeholder="Ej. Sala de 4, Kinder primera etapa, 1er Grado" />
                            </div>
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Cupos Máximos</label>
                                <input type="number" value={gradoForm.cupos_maximos} min={1}
                                    onChange={e => setGradoForm(p => ({ ...p, cupos_maximos: parseInt(e.target.value) || 1 }))}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none font-bold"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }} />
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
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
                                    placeholder="Ej. Profesor, Administrativo" />
                            </div>
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Descripción</label>
                                <input type="text" value={tipoCargoForm.descripcion}
                                    onChange={e => setTipoCargoForm(p => ({ ...p, descripcion: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
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
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
                                    placeholder="Ej. Banesco" />
                            </div>
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Número de Cuenta</label>
                                <input type="text" value={bancoForm.numero_cuenta} onChange={e => setBancoForm(p => ({ ...p, numero_cuenta: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
                                    placeholder="Opcional" />
                            </div>
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>Tipo de Banco</label>
                                <select value={bancoForm.tipo} onChange={e => setBancoForm(p => ({ ...p, tipo: e.target.value }))}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}>
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
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
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
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--ash)' }}>
                                    Período Destino <span className="normal-case opacity-60">(formato YYYY-YYYY)</span>
                                </label>
                                <input type="text" value={periodoDestino} onChange={(e) => setPeriodoDestino(e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-lg outline-none font-bold text-center text-base"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', fontSize: '16px' }}
                                    placeholder="2026-2027" />
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

            {/* Modales de confirmación de eliminación */}
            {showDeleteGradoModal && (
                <ConfirmDeleteModal
                    titulo="Eliminar Grado"
                    nombre={gradoAEliminar?.grado_seccion}
                    onConfirm={handleDeleteGrado}
                    onCancel={() => { setShowDeleteGradoModal(false); setGradoAEliminar(null); }}
                />
            )}
            {showDeleteTipoModal && (
                <ConfirmDeleteModal
                    titulo="Eliminar Tipo de Cargo"
                    nombre={tipoCargoAEliminar?.nombre}
                    onConfirm={handleDeleteTipoCargo}
                    onCancel={() => { setShowDeleteTipoModal(false); setTipoCargoAEliminar(null); }}
                />
            )}
            {showDeleteBancoModal && (
                <ConfirmDeleteModal
                    titulo="Eliminar Banco"
                    nombre={bancoAEliminar?.nombre}
                    onConfirm={handleDeleteBanco}
                    onCancel={() => { setShowDeleteBancoModal(false); setBancoAEliminar(null); }}
                />
            )}
            {showDeleteBancoNominaModal && (
                <ConfirmDeleteModal
                    titulo="Eliminar Banco de Nómina"
                    nombre={bancoNominaAEliminar?.nombre}
                    onConfirm={handleDeleteBancoNomina}
                    onCancel={() => { setShowDeleteBancoNominaModal(false); setBancoNominaAEliminar(null); }}
                />
            )}
        </div>
    );
};

export default Configuracion;
