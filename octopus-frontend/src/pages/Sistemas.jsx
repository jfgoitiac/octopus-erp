import { useState, useEffect, useContext } from 'react';
import { Navigate } from 'react-router-dom';
import {
    ShieldAlert, UserPlus, Key, Trash2, Settings,
    User, Mail, Lock, X, Eye, EyeOff, Loader2, RefreshCcw, UserCog,
    Bell, MessageSquare, Send, ChevronDown, ChevronUp, CheckCircle2,
    XCircle, Clock, Filter
} from 'lucide-react';
import axiosInstance from '../api/apiClient';
import { AuthContext } from '../context/AuthContext';
import { toast } from 'react-toastify';

const Sistemas = () => {
    const { user } = useContext(AuthContext);
    const [usuarios, setUsuarios]         = useState([]);
    const [showModal, setShowModal]       = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showResetModal, setShowResetModal]   = useState(false);
    const [userToReset, setUserToReset]         = useState(null);
    const [newPassword, setNewPassword]         = useState('');
    const [userToDelete, setUserToDelete] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
    const [showEditRolModal, setShowEditRolModal] = useState(false);
    const [userToEditRol, setUserToEditRol]       = useState(null);
    const [newRol, setNewRol]                     = useState('cajero');
    const [loading, setLoading]           = useState(false);
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [formData, setFormData]         = useState({
        username: '', email: '', password: '', rol: 'cajero'
    });

    const fetchUsers = async () => {
        setLoadingUsers(true);
        try {
            const res = await axiosInstance.get('authentication/users/');
            setUsuarios(res.data);
        } catch (err) {
            const errorMsg = err.response?.data?.error || err.response?.data?.detail || "Error al cargar usuarios";
            toast.error(errorMsg);
        } finally {
            setLoadingUsers(false);
        }
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setFormData({ username: '', email: '', password: '', rol: 'cajero' });
        setShowPassword(false);
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();

        // Procesamiento de texto para eliminar espacios accidentales
        const payload = {
            ...formData,
            username: formData.username.trim(),
            email: formData.email.trim()
        };

        // Validación estricta de correo electrónico mediante Regex
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(payload.email)) {
            return toast.error("Por favor, ingresa un correo electrónico válido (ejemplo@dominio.com).");
        }

        // Validación de longitud mínima de contraseña (UX: coincide con el placeholder del input)
        if (payload.password.length < 8) {
            return toast.error("Seguridad insuficiente: La contraseña debe tener al menos 8 caracteres.");
        }

        setLoading(true);
        try {
            await axiosInstance.post('authentication/users/', payload);
            handleCloseModal();
            fetchUsers();
            toast.success("Usuario creado exitosamente");
        } catch (err) {
            const errorMsg = err.response?.data?.error || err.response?.data?.detail || "Error al crear el usuario";
            toast.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenEditRolModal = (u) => {
        setUserToEditRol(u);
        setNewRol(u.perfil?.rol || 'cajero');
        setShowEditRolModal(true);
    };

    const handleConfirmEditRol = async (e) => {
        e.preventDefault();
        if (!userToEditRol) return;
        setLoading(true);
        try {
            await axiosInstance.patch(`authentication/users/${userToEditRol.id}/`, { rol: newRol });
            toast.success("Rol actualizado correctamente");
            setShowEditRolModal(false);
            fetchUsers();
        } catch (err) {
            const errorMsg = err.response?.data?.error || err.response?.data?.detail || "Error al actualizar el rol";
            toast.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenResetModal = (user) => {
        setUserToReset(user);
        setNewPassword('');
        setShowResetPasswordModal(false);
        setShowResetModal(true);
    };

    const handleConfirmResetPassword = async (e) => {
        e.preventDefault();
        if (!userToReset || !newPassword) return;
        setLoading(true);
        try {
            await axiosInstance.post(`authentication/users/${userToReset.id}/reset_password/`, {
                new_password: newPassword
            });
            toast.success("Contraseña restablecida con éxito");
            setShowResetModal(false);
        } catch (err) {
            const errorMsg = err.response?.data?.error || err.response?.data?.detail || "Error al resetear contraseña";
            toast.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const confirmDeleteUser = (userId) => {
        setUserToDelete(userId);
        setShowDeleteModal(true);
    };

    const handleDeleteUser = async () => {
        if (!userToDelete) return;
        setLoading(true);
        try {
            await axiosInstance.delete(`authentication/users/${userToDelete}/`);
            toast.success("Usuario eliminado correctamente");
            setUsuarios(prev => prev.filter(u => u.id !== userToDelete));
            setShowDeleteModal(false);
            setUserToDelete(null);
        } catch (err) {
            const errorMsg = err.response?.data?.error || err.response?.data?.detail || "No puedes eliminar tu propia cuenta.";
            toast.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleBackup = async () => {
        setLoading(true);
        try {
            const res = await axiosInstance.post('authentication/users/backup/', {}, {
                responseType: 'blob'
            });

            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            const fecha = new Date().toISOString().split('T')[0];
            link.setAttribute('download', `backup_octopus_${fecha}.sql`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            const errorMsg = err.response?.data?.error || err.response?.data?.detail || "Error al generar el respaldo";
            toast.error(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleSyncBCV = async () => {
        setLoading(true);
        try {
            await toast.promise(
                axiosInstance.post('cobranza/sincronizar-tasa/', {}),
                {
                    pending: 'Sincronizando tasa BCV...',
                    success: { render: ({ data }) => `Tasa actualizada a Bs. ${data.data.valor}` },
                    error:   { render: ({ data }) => data?.response?.data?.error || data?.response?.data?.detail || 'No se pudo sincronizar la tasa cambiaria' },
                }
            );
        } finally {
            setLoading(false);
        }
    };

    // ── Notificaciones ──────────────────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState('usuarios');
    const [notifCfg, setNotifCfg] = useState(null);
    const [notifLoading, setNotifLoading] = useState(false);
    const [notifSaving, setNotifSaving] = useState(false);
    const [showEmailPass, setShowEmailPass] = useState(false);
    const [showTwilioToken, setShowTwilioToken] = useState(false);
    const [showMetaToken, setShowMetaToken] = useState(false);
    const [testCanal, setTestCanal] = useState('email');
    const [testDestino, setTestDestino] = useState('');
    const [testLoading, setTestLoading] = useState(false);
    const [logs, setLogs] = useState([]);
    const [logsTotal, setLogsTotal] = useState(0);
    const [logsPage, setLogsPage] = useState(1);
    const [logsLoading, setLogsLoading] = useState(false);
    const [logFiltro, setLogFiltro] = useState({ canal: '', estado: '', tipo: '' });

    const fetchNotifCfg = async () => {
        setNotifLoading(true);
        try {
            const res = await axiosInstance.get('notificaciones/configuracion/');
            setNotifCfg(res.data);
        } catch {
            toast.error('Error al cargar configuración de notificaciones');
        } finally {
            setNotifLoading(false);
        }
    };

    const handleSaveNotifCfg = async (e) => {
        e.preventDefault();
        setNotifSaving(true);
        try {
            const res = await axiosInstance.patch('notificaciones/configuracion/', notifCfg);
            setNotifCfg(res.data);
            toast.success('Configuración guardada correctamente');
        } catch {
            toast.error('Error al guardar configuración');
        } finally {
            setNotifSaving(false);
        }
    };

    const handleTestNotif = async () => {
        if (!testDestino.trim()) return toast.error('Ingresa un destino para la prueba');
        setTestLoading(true);
        try {
            const res = await axiosInstance.post('notificaciones/probar/', {
                canal: testCanal,
                destino: testDestino.trim(),
            });
            const r = res.data.resultados;
            Object.entries(r).forEach(([canal, estado]) => {
                if (estado === 'enviado') toast.success(`${canal}: ${estado}`);
                else toast.error(`${canal}: ${estado}`);
            });
        } catch (err) {
            toast.error(err.response?.data?.error || 'Error al enviar prueba');
        } finally {
            setTestLoading(false);
        }
    };

    const fetchLogs = async (page = 1) => {
        setLogsLoading(true);
        try {
            const params = { page, page_size: 20, ...logFiltro };
            Object.keys(params).forEach(k => !params[k] && delete params[k]);
            const res = await axiosInstance.get('notificaciones/logs/', { params });
            setLogs(res.data.results);
            setLogsTotal(res.data.total);
            setLogsPage(page);
        } catch {
            toast.error('Error al cargar logs');
        } finally {
            setLogsLoading(false);
        }
    };

    const setNotifField = (campo, valor) =>
        setNotifCfg(prev => ({ ...prev, [campo]: valor }));

    useEffect(() => { fetchUsers(); }, []);
    useEffect(() => {
        if (activeTab === 'notificaciones') fetchNotifCfg();
        if (activeTab === 'logs') fetchLogs(1);
    }, [activeTab]);

    // Validación de seguridad: Redirección inmediata para roles no autorizados
    if (user && !['director', 'administrador', 'sistemas'].includes(user.rol)) {
        return <Navigate to="/dashboard" replace />;
    }

    const rolStyle = (rol) => {
        const map = {
            director:      'bg-purple-100 text-purple-700', // Mantener por ahora, no hay variable para purple
            sistemas:      'bg-orange-100 text-orange-700', // Mantener por ahora, no hay variable para orange
            administrador: 'bg-green-100 text-green-700', // Mantener por ahora, no hay variable para green
            cajero:        'bg-blue-100 text-blue-700', // Mantener por ahora, no hay variable para blue
            secretaria:    'bg-pink-100 text-pink-700', // Mantener por ahora, no hay variable para pink
        };
        return map[rol] || 'bg-slate-100 text-slate-600';
    };

    const TABS = [
        { id: 'usuarios',       label: 'Usuarios',         icon: User },
        { id: 'notificaciones', label: 'Notificaciones',   icon: Bell },
        { id: 'logs',           label: 'Log de envíos',    icon: MessageSquare },
    ];

    const estadoLog = (estado) => {
        if (estado === 'enviado')  return <span className="flex items-center gap-1 text-green-600"><CheckCircle2 size={13}/> Enviado</span>;
        if (estado === 'fallido')  return <span className="flex items-center gap-1 text-red-500"><XCircle size={13}/> Fallido</span>;
        return <span className="flex items-center gap-1" style={{ color: 'var(--ash)' }}><Clock size={13}/> Pendiente</span>;
    };

    return (
        <div>
            <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-lg font-medium" style={{ color: 'var(--jet)' }}>
                        Panel de Sistemas
                    </h2>
                    <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>
                        Gestión de identidades, permisos y configuración del sistema.
                    </p>
                </div>

                <div className="flex gap-2">
                    <button onClick={() => activeTab === 'usuarios' ? fetchUsers() : activeTab === 'logs' ? fetchLogs(1) : fetchNotifCfg()}
                        className="p-2 rounded-lg border transition-all"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                        title="Refrescar">
                        <RefreshCcw size={15} />
                    </button>
                    {activeTab === 'usuarios' && (
                        <button onClick={() => setShowModal(true)}
                            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all"
                            style={{ background: 'var(--pb)' }}>
                            <UserPlus size={15} /> Nuevo usuario
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-5 p-1 rounded-xl w-fit"
                style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                {TABS.map(t => {
                    const Icon = t.icon;
                    const active = activeTab === t.id;
                    return (
                        <button key={t.id} onClick={() => setActiveTab(t.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                            style={active
                                ? { background: 'var(--pb)', color: '#fff' }
                                : { color: 'var(--ash)' }}>
                            <Icon size={13} /> {t.label}
                        </button>
                    );
                })}
            </div>

            {/* ── TAB USUARIOS ─────────────────────────────────────────── */}
            {activeTab === 'usuarios' && (<>
            <div className="rounded-xl overflow-hidden mb-6"
                style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                <table className="w-full text-left">
                    <thead>
                        <tr>
                            {['Usuario', 'Rol', 'Último acceso', 'Acciones'].map(h => (
                                <th key={h} className="px-4 py-3 text-[11px] uppercase tracking-widest"
                                    style={{ color: 'var(--ash)', background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loadingUsers ? (
                            <tr>
                                <td colSpan="4" className="px-4 py-12 text-center">
                                    <Loader2 className="animate-spin inline-block" size={20}
                                        style={{ color: 'var(--pb)' }} />
                                </td>
                            </tr>
                        ) : usuarios.length > 0 ? usuarios.map(u => (
                            <tr key={u.id} style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                                <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--jet)' }}> {/* Texto de contenido */}
                                    {u.username}
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase ${rolStyle(u.perfil?.rol)}`}>
                                        {u.perfil?.rol || 'Sin rol'}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-xs" style={{ color: 'var(--ash)' }}>
                                    {u.last_login
                                        ? new Date(u.last_login).toLocaleDateString('es-VE') // Texto secundario
                                        : 'Nunca'}
                                </td>
                                <td className="px-4 py-3"> {/* Botones de acción */}
                                    <div className="flex gap-3">
                                        <button onClick={() => handleOpenEditRolModal(u)}
                                            title="Editar rol" className="transition-colors"
                                            style={{ color: 'var(--ash)' }}
                                            onMouseEnter={e => e.currentTarget.style.color = 'var(--pb)'}
                                            onMouseLeave={e => e.currentTarget.style.color = 'var(--ash)'}>
                                            <UserCog size={16} />
                                        </button>
                                        <button onClick={() => handleOpenResetModal(u)}
                                            title="Resetear clave" className="transition-colors"
                                            style={{ color: 'var(--ash)' }}
                                            onMouseEnter={e => e.currentTarget.style.color = 'var(--pb)'}
                                            onMouseLeave={e => e.currentTarget.style.color = 'var(--ash)'}>
                                            <Key size={16} />
                                        </button>
                                        <button onClick={() => confirmDeleteUser(u.id)}
                                            title="Eliminar usuario" className="transition-colors"
                                            style={{ color: 'var(--ash)' }}
                                            onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
                                            onMouseLeave={e => e.currentTarget.style.color = 'var(--ash)'}>
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan="4" className="px-4 py-12 text-center text-sm"
                                    style={{ color: 'var(--ash)', background: 'var(--porcelain)' }}>
                                    No hay usuarios registrados.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-xl" style={{ background: 'var(--jet)' }}> 
                    <h3 className="text-sm font-medium text-white flex items-center gap-2 mb-4">
                        <Settings size={16} style={{ color: 'var(--pb)' }} /> {/* Icono con color primario */}
                        <span style={{ color: '#fff' }}>Consola de mantenimiento</span> {/* Texto blanco sobre jet */}
                    </h3>
                    <div className="space-y-2">
                        <button onClick={handleSyncBCV} disabled={loading}
                            className="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all disabled:opacity-50"
                            style={{ background: 'rgba(255,255,255,0.07)', color: '#e2e8f0' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}>
                            {loading ? '⏳ Sincronizando...' : '🔄 Sincronizar tasa BCV'}
                        </button>
                        <button onClick={handleBackup} disabled={loading}
                            className="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all disabled:opacity-50"
                            style={{ background: 'rgba(255,255,255,0.07)', color: '#e2e8f0' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}>
                            {loading ? '⏳ Generando respaldo...' : '💾 Respaldar base de datos'}
                        </button>
                    </div>
                </div>
                <div className="p-5 rounded-xl flex flex-col justify-center items-center text-center" 
                    style={{ border: '1.5px dashed var(--border-md)', background: 'var(--porcelain)' }}>
                    <ShieldAlert size={32} style={{ color: 'var(--border-md)' }} className="mb-2" />
                    <p className="text-sm" style={{ color: 'var(--ash)' }}> {/* Texto secundario */}
                        Cualquier cambio en permisos queda registrado en el Log de Auditoría.
                    </p>
                </div>
            </div>

            {showModal && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
                    style={{ background: 'rgba(43,48,58,0.55)' }}> {/* Overlay estándar */}
                    <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" style={{ background: 'var(--porcelain)' }}> {/* Fondo de modal estándar */}
                        <div className="flex justify-between items-center px-5 py-4"
                            style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--bg)' }}>
                            <div>
                                <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                    Nuevo operador
                                </h3>
                                <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>
                                    Registre personal administrativo al sistema
                                </p>
                            </div>
                            <button onClick={handleCloseModal} style={{ color: 'var(--ash)' }}> {/* Botón de cerrar modal */}
                                <X size={17} />
                            </button>
                        </div>

                        <form onSubmit={handleCreateUser} className="p-5 space-y-4">
                            {[
                                { label: 'Usuario', name: 'username', type: 'text', icon: User, placeholder: 'jperez' },
                                { label: 'Correo',  name: 'email',    type: 'email', icon: Mail, placeholder: 'usuario@colegio.com' },
                            ].map(field => (
                                <div key={field.name}>
                                    <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                                        style={{ color: 'var(--ash)' }}>{field.label}</label>
                                    <div className="relative">
                                        <field.icon size={15} className="absolute left-3 top-2.5"
                                            style={{ color: 'var(--ash)' }} />
                                        <input type={field.type} placeholder={field.placeholder}
                                            value={formData[field.name]}
                                            onChange={e => setFormData({ ...formData, [field.name]: e.target.value })}
                                            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
                                            style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                            required />
                                    </div>
                                </div>
                            ))}

                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                                    style={{ color: 'var(--ash)' }}>Contraseña</label>
                                <div className="relative">
                                    <Lock size={15} className="absolute left-3 top-2.5"
                                        style={{ color: 'var(--ash)' }} />
                                    <input type={showPassword ? 'text' : 'password'}
                                        placeholder="Mínimo 8 caracteres"
                                        value={formData.password}
                                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                                        className="w-full pl-9 pr-9 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                        required />
                                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-2.5" style={{ color: 'var(--ash)' }}>
                                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                                    style={{ color: 'var(--ash)' }}>Rol</label>
                                <select value={formData.rol}
                                    onChange={e => setFormData({ ...formData, rol: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none appearance-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}>
                                    <option value="cajero">Cajero — Cobranzas y Arqueos</option>
                                    <option value="secretaria">Secretaria — Alumnos e Inscripciones</option>
                                    <option value="sistemas">Sistemas — Gestión de IT</option>
                                    <option value="director">Director — Control Total</option>
                                    <option value="administrador">Administrador — Acceso completo</option>
                                </select>
                            </div>

                            <div className="flex gap-2 pt-1">
                                {/* CORRECCIÓN 4: Botón secundario */}
                                <button type="button" onClick={handleCloseModal} disabled={loading}
                                    className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                                    Cancelar
                                </button>
                                {/* CORRECCIÓN 3: Botón primario */}
                                <button type="submit" disabled={loading}
                                    className="flex-1 py-2 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
                                    style={{ background: 'var(--pb)' }}>
                                    {loading ? <Loader2 className="animate-spin" size={15} /> : <UserPlus size={15} />}
                                    {loading ? 'Creando...' : 'Crear usuario'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Restablecer Contraseña */}
            {showResetModal && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
                    style={{ background: 'rgba(43,48,58,0.55)' }}>
                    <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" style={{ background: 'var(--porcelain)' }}>
                        <div className="flex justify-between items-center px-5 py-4"
                            style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--bg)' }}>
                            <div>
                                <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                    Restablecer contraseña
                                </h3>
                                <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>
                                    Usuario: <span className="font-bold">{userToReset?.username}</span>
                                </p>
                            </div>
                            <button onClick={() => setShowResetModal(false)} style={{ color: 'var(--ash)' }}>
                                <X size={17} />
                            </button>
                        </div>

                        <form onSubmit={handleConfirmResetPassword} className="p-5 space-y-4">
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                                    style={{ color: 'var(--ash)' }}>Nueva Contraseña</label>
                                <div className="relative">
                                    <Lock size={15} className="absolute left-3 top-2.5"
                                        style={{ color: 'var(--ash)' }} />
                                    <input type={showResetPasswordModal ? 'text' : 'password'}
                                        placeholder="Mínimo 8 caracteres"
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        className="w-full pl-9 pr-9 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}
                                        required />
                                    <button type="button" onClick={() => setShowResetPasswordModal(!showResetPasswordModal)}
                                        className="absolute right-3 top-2.5" style={{ color: 'var(--ash)' }}>
                                        {showResetPasswordModal ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>
                            </div>

                            <div className="flex gap-2 pt-1">
                                <button type="button" onClick={() => setShowResetModal(false)}
                                    className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                                    Cancelar
                                </button>
                                <button type="submit" disabled={loading}
                                    className="flex-1 py-2 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
                                    style={{ background: 'var(--pb)' }}>
                                    {loading ? <Loader2 className="animate-spin" size={15} /> : <Key size={15} />}
                                    {loading ? 'Procesando...' : 'Cambiar clave'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Edición de Rol */}
            {showEditRolModal && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
                    style={{ background: 'rgba(43,48,58,0.55)' }}>
                    <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" style={{ background: 'var(--porcelain)' }}>
                        <div className="flex justify-between items-center px-5 py-4"
                            style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--bg)' }}>
                            <div>
                                <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                    Editar rol
                                </h3>
                                <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>
                                    Usuario: <span className="font-bold">{userToEditRol?.username}</span>
                                </p>
                            </div>
                            <button onClick={() => setShowEditRolModal(false)} style={{ color: 'var(--ash)' }}>
                                <X size={17} />
                            </button>
                        </div>

                        <form onSubmit={handleConfirmEditRol} className="p-5 space-y-4">
                            <div>
                                <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                                    style={{ color: 'var(--ash)' }}>Nuevo Rol</label>
                                <select value={newRol}
                                    onChange={e => setNewRol(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none appearance-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}>
                                    <option value="cajero">Cajero — Cobranzas y Arqueos</option>
                                    <option value="secretaria">Secretaria — Alumnos e Inscripciones</option>
                                    <option value="sistemas">Sistemas — Gestión de IT</option>
                                    <option value="director">Director — Control Total</option>
                                    <option value="administrador">Administrador — Acceso completo</option>
                                </select>
                            </div>

                            <div className="flex gap-2 pt-1">
                                <button type="button" onClick={() => setShowEditRolModal(false)} disabled={loading}
                                    className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                                    Cancelar
                                </button>
                                <button type="submit" disabled={loading}
                                    className="flex-1 py-2 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
                                    style={{ background: 'var(--pb)' }}>
                                    {loading ? <Loader2 className="animate-spin" size={15} /> : <UserCog size={15} />}
                                    {loading ? 'Guardando...' : 'Guardar cambio'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Confirmación de Eliminación */}
            {showDeleteModal && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
                    style={{ background: 'rgba(43,48,58,0.55)' }}>
                    <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl animate-fadeInUp" 
                        style={{ background: 'var(--porcelain)' }}>
                        
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                                style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--red)' }}>
                                <Trash2 size={32} />
                            </div>
                            
                            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--jet)' }}>
                                ¿Confirmar eliminación?
                            </h3>
                            <p className="text-sm px-4" style={{ color: 'var(--ash)' }}>
                                Esta acción es irreversible. El usuario perderá acceso inmediato al sistema.
                            </p>
                        </div>

                        <div className="flex gap-3 p-6 pt-0">
                            <button 
                                onClick={() => { setShowDeleteModal(false); setUserToDelete(null); }}
                                className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                                style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)', background: '#fff' }}>
                                Cancelar
                            </button>
                            <button 
                                onClick={handleDeleteUser}
                                disabled={loading}
                                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                                style={{ background: 'var(--red)' }}>
                                {loading ? (
                                    <Loader2 className="animate-spin" size={16} />
                                ) : (
                                    'Eliminar ahora'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            </>)}

            {/* ── TAB NOTIFICACIONES ───────────────────────────────────── */}
            {activeTab === 'notificaciones' && (
                <div className="space-y-5">
                    {notifLoading ? (
                        <div className="flex justify-center py-16">
                            <Loader2 className="animate-spin" size={24} style={{ color: 'var(--pb)' }} />
                        </div>
                    ) : notifCfg ? (
                        <form onSubmit={handleSaveNotifCfg} className="space-y-5">

                            {/* Email */}
                            <div className="rounded-xl overflow-hidden"
                                style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                                <div className="flex items-center justify-between px-5 py-3"
                                    style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                                    <div className="flex items-center gap-2">
                                        <Mail size={15} style={{ color: 'var(--pb)' }} />
                                        <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                            Correo electrónico (SMTP)
                                        </span>
                                    </div>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <span className="text-xs" style={{ color: 'var(--ash)' }}>
                                            {notifCfg.email_activo ? 'Activo' : 'Inactivo'}
                                        </span>
                                        <div className="relative">
                                            <input type="checkbox" className="sr-only"
                                                checked={!!notifCfg.email_activo}
                                                onChange={e => setNotifField('email_activo', e.target.checked)} />
                                            <div className="w-9 h-5 rounded-full transition-colors"
                                                style={{ background: notifCfg.email_activo ? 'var(--pb)' : 'var(--border-md)' }}>
                                                <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                                                    style={{ transform: notifCfg.email_activo ? 'translateX(16px)' : 'translateX(0)' }} />
                                            </div>
                                        </div>
                                    </label>
                                </div>
                                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {[
                                        { label: 'Servidor SMTP', campo: 'email_host', placeholder: 'smtp.gmail.com' },
                                        { label: 'Puerto', campo: 'email_port', placeholder: '587', type: 'number' },
                                        { label: 'Usuario / correo', campo: 'email_host_user', placeholder: 'noreply@colegio.edu.ve' },
                                        { label: 'Remitente visible', campo: 'email_from', placeholder: 'Colegio <noreply@colegio.edu.ve>' },
                                        { label: 'Email del director', campo: 'director_email', placeholder: 'director@colegio.edu.ve' },
                                    ].map(f => (
                                        <div key={f.campo}>
                                            <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                                                style={{ color: 'var(--ash)' }}>{f.label}</label>
                                            <input
                                                type={f.type || 'text'}
                                                placeholder={f.placeholder}
                                                value={notifCfg[f.campo] ?? ''}
                                                onChange={e => setNotifField(f.campo, e.target.value)}
                                                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                                style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} />
                                        </div>
                                    ))}
                                    <div>
                                        <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                                            style={{ color: 'var(--ash)' }}>Contraseña / App Password</label>
                                        <div className="relative">
                                            <input
                                                type={showEmailPass ? 'text' : 'password'}
                                                placeholder="••••••••••••"
                                                value={notifCfg.email_host_password ?? ''}
                                                onChange={e => setNotifField('email_host_password', e.target.value)}
                                                className="w-full pl-3 pr-9 py-2 rounded-lg text-sm outline-none"
                                                style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} />
                                            <button type="button" onClick={() => setShowEmailPass(v => !v)}
                                                className="absolute right-3 top-2.5" style={{ color: 'var(--ash)' }}>
                                                {showEmailPass ? <EyeOff size={14} /> : <Eye size={14} />}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input type="checkbox" id="tls"
                                            checked={!!notifCfg.email_use_tls}
                                            onChange={e => setNotifField('email_use_tls', e.target.checked)}
                                            className="rounded" />
                                        <label htmlFor="tls" className="text-sm" style={{ color: 'var(--jet)' }}>
                                            Usar TLS (recomendado)
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* WhatsApp */}
                            <div className="rounded-xl overflow-hidden"
                                style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                                <div className="flex items-center justify-between px-5 py-3"
                                    style={{ borderBottom: '0.5px solid var(--border-md)', background: 'var(--bg)' }}>
                                    <div className="flex items-center gap-2">
                                        <MessageSquare size={15} style={{ color: 'var(--pb)' }} />
                                        <span className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                            WhatsApp
                                        </span>
                                    </div>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <span className="text-xs" style={{ color: 'var(--ash)' }}>
                                            {notifCfg.whatsapp_activo ? 'Activo' : 'Inactivo'}
                                        </span>
                                        <div className="relative">
                                            <input type="checkbox" className="sr-only"
                                                checked={!!notifCfg.whatsapp_activo}
                                                onChange={e => setNotifField('whatsapp_activo', e.target.checked)} />
                                            <div className="w-9 h-5 rounded-full transition-colors"
                                                style={{ background: notifCfg.whatsapp_activo ? 'var(--pb)' : 'var(--border-md)' }}>
                                                <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                                                    style={{ transform: notifCfg.whatsapp_activo ? 'translateX(16px)' : 'translateX(0)' }} />
                                            </div>
                                        </div>
                                    </label>
                                </div>
                                <div className="p-5 space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                                                style={{ color: 'var(--ash)' }}>Proveedor</label>
                                            <select value={notifCfg.whatsapp_proveedor ?? ''}
                                                onChange={e => setNotifField('whatsapp_proveedor', e.target.value)}
                                                className="w-full px-3 py-2 rounded-lg text-sm outline-none appearance-none"
                                                style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}>
                                                <option value="">No configurado</option>
                                                <option value="twilio">Twilio</option>
                                                <option value="meta">Meta Business API</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                                                style={{ color: 'var(--ash)' }}>WhatsApp del director (alertas día 15)</label>
                                            <input type="text" placeholder="+584120000000"
                                                value={notifCfg.director_whatsapp ?? ''}
                                                onChange={e => setNotifField('director_whatsapp', e.target.value)}
                                                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                                style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} />
                                        </div>
                                    </div>

                                    {notifCfg.whatsapp_proveedor === 'twilio' && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg"
                                            style={{ background: 'rgba(0,0,0,0.03)', border: '0.5px solid var(--border)' }}>
                                            <p className="col-span-full text-xs font-semibold" style={{ color: 'var(--ash)' }}>
                                                Credenciales Twilio
                                            </p>
                                            <div>
                                                <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                                                    style={{ color: 'var(--ash)' }}>Account SID</label>
                                                <input type="text" placeholder="ACxxxxxxxxxxxxxxxx"
                                                    value={notifCfg.twilio_account_sid ?? ''}
                                                    onChange={e => setNotifField('twilio_account_sid', e.target.value)}
                                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} />
                                            </div>
                                            <div>
                                                <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                                                    style={{ color: 'var(--ash)' }}>Auth Token</label>
                                                <div className="relative">
                                                    <input type={showTwilioToken ? 'text' : 'password'}
                                                        placeholder="••••••••••••"
                                                        value={notifCfg.twilio_auth_token ?? ''}
                                                        onChange={e => setNotifField('twilio_auth_token', e.target.value)}
                                                        className="w-full pl-3 pr-9 py-2 rounded-lg text-sm outline-none"
                                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} />
                                                    <button type="button" onClick={() => setShowTwilioToken(v => !v)}
                                                        className="absolute right-3 top-2.5" style={{ color: 'var(--ash)' }}>
                                                        {showTwilioToken ? <EyeOff size={14} /> : <Eye size={14} />}
                                                    </button>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                                                    style={{ color: 'var(--ash)' }}>Número de origen</label>
                                                <input type="text" placeholder="+14155238886"
                                                    value={notifCfg.twilio_whatsapp_from ?? ''}
                                                    onChange={e => setNotifField('twilio_whatsapp_from', e.target.value)}
                                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} />
                                            </div>
                                        </div>
                                    )}

                                    {notifCfg.whatsapp_proveedor === 'meta' && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg"
                                            style={{ background: 'rgba(0,0,0,0.03)', border: '0.5px solid var(--border)' }}>
                                            <p className="col-span-full text-xs font-semibold" style={{ color: 'var(--ash)' }}>
                                                Credenciales Meta Business API
                                            </p>
                                            <div>
                                                <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                                                    style={{ color: 'var(--ash)' }}>Phone Number ID</label>
                                                <input type="text" placeholder="1234567890"
                                                    value={notifCfg.meta_whatsapp_phone_id ?? ''}
                                                    onChange={e => setNotifField('meta_whatsapp_phone_id', e.target.value)}
                                                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                                                    style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} />
                                            </div>
                                            <div>
                                                <label className="block text-[11px] uppercase tracking-widest mb-1.5"
                                                    style={{ color: 'var(--ash)' }}>Access Token</label>
                                                <div className="relative">
                                                    <input type={showMetaToken ? 'text' : 'password'}
                                                        placeholder="••••••••••••"
                                                        value={notifCfg.meta_whatsapp_token ?? ''}
                                                        onChange={e => setNotifField('meta_whatsapp_token', e.target.value)}
                                                        className="w-full pl-3 pr-9 py-2 rounded-lg text-sm outline-none"
                                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} />
                                                    <button type="button" onClick={() => setShowMetaToken(v => !v)}
                                                        className="absolute right-3 top-2.5" style={{ color: 'var(--ash)' }}>
                                                        {showMetaToken ? <EyeOff size={14} /> : <Eye size={14} />}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Prueba de envío */}
                            <div className="rounded-xl p-5"
                                style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                                <p className="text-sm font-medium mb-3" style={{ color: 'var(--jet)' }}>
                                    Enviar mensaje de prueba
                                </p>
                                <div className="flex flex-col md:flex-row gap-3">
                                    <select value={testCanal} onChange={e => setTestCanal(e.target.value)}
                                        className="px-3 py-2 rounded-lg text-sm outline-none appearance-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)', minWidth: 140 }}>
                                        <option value="email">Email</option>
                                        <option value="whatsapp">WhatsApp</option>
                                        <option value="ambos">Ambos</option>
                                    </select>
                                    <input type="text"
                                        placeholder={testCanal === 'email' ? 'correo@ejemplo.com' : '+584120000000'}
                                        value={testDestino}
                                        onChange={e => setTestDestino(e.target.value)}
                                        className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }} />
                                    <button type="button" onClick={handleTestNotif} disabled={testLoading}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                                        style={{ background: 'var(--pb)' }}>
                                        {testLoading ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
                                        Enviar prueba
                                    </button>
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <button type="submit" disabled={notifSaving}
                                    className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                                    style={{ background: 'var(--pb)' }}>
                                    {notifSaving ? <Loader2 className="animate-spin" size={14} /> : <Settings size={14} />}
                                    {notifSaving ? 'Guardando...' : 'Guardar configuración'}
                                </button>
                            </div>
                        </form>
                    ) : null}
                </div>
            )}

            {/* ── TAB LOGS ─────────────────────────────────────────────── */}
            {activeTab === 'logs' && (
                <div className="space-y-4">
                    {/* Filtros */}
                    <div className="flex flex-wrap gap-2 items-center">
                        {[
                            { label: 'Canal', campo: 'canal', opts: [['', 'Todos'], ['email', 'Email'], ['whatsapp', 'WhatsApp']] },
                            { label: 'Estado', campo: 'estado', opts: [['', 'Todos'], ['enviado', 'Enviado'], ['fallido', 'Fallido'], ['pendiente', 'Pendiente']] },
                            { label: 'Tipo', campo: 'tipo', opts: [['', 'Todos'], ['mora_dia_0','Día 0'], ['mora_dia_5','Día 5'], ['mora_dia_10','Día 10'], ['mora_dia_15','Día 15'], ['comprobante','Comprobante'], ['bienvenida','Bienvenida'], ['pago_exitoso','Pago exitoso'], ['prueba','Prueba']] },
                        ].map(f => (
                            <select key={f.campo}
                                value={logFiltro[f.campo]}
                                onChange={e => setLogFiltro(prev => ({ ...prev, [f.campo]: e.target.value }))}
                                className="px-3 py-1.5 rounded-lg text-xs outline-none appearance-none"
                                style={{ border: '0.5px solid var(--border-md)', background: '#fff', color: 'var(--jet)' }}>
                                {f.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                        ))}
                        <button onClick={() => fetchLogs(1)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                            style={{ background: 'var(--pb)' }}>
                            <Filter size={12} /> Filtrar
                        </button>
                    </div>

                    <div className="rounded-xl overflow-hidden"
                        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                        <table className="w-full text-left">
                            <thead>
                                <tr>
                                    {['Fecha', 'Canal', 'Tipo', 'Destinatario', 'Estado'].map(h => (
                                        <th key={h} className="px-4 py-3 text-[11px] uppercase tracking-widest"
                                            style={{ color: 'var(--ash)', borderBottom: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {logsLoading ? (
                                    <tr><td colSpan="5" className="px-4 py-12 text-center">
                                        <Loader2 className="animate-spin inline-block" size={20} style={{ color: 'var(--pb)' }} />
                                    </td></tr>
                                ) : logs.length > 0 ? logs.map(l => (
                                    <tr key={l.id} style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--ash)' }}>
                                            {new Date(l.fecha_envio).toLocaleString('es-VE')}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${l.canal === 'email' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                                                {l.canal}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--jet)' }}>
                                            {l.tipo}
                                        </td>
                                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--jet)' }}>
                                            {l.destinatario}
                                            {l.alumno_nombre && <span className="block" style={{ color: 'var(--ash)' }}>{l.alumno_nombre}</span>}
                                        </td>
                                        <td className="px-4 py-3 text-xs">{estadoLog(l.estado)}</td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan="5" className="px-4 py-12 text-center text-sm"
                                        style={{ color: 'var(--ash)' }}>
                                        No hay registros.
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Paginación */}
                    {logsTotal > 20 && (
                        <div className="flex items-center justify-between">
                            <span className="text-xs" style={{ color: 'var(--ash)' }}>
                                {logsTotal} registros totales
                            </span>
                            <div className="flex gap-2">
                                <button onClick={() => fetchLogs(logsPage - 1)} disabled={logsPage <= 1}
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-40"
                                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                                    Anterior
                                </button>
                                <span className="px-3 py-1.5 text-xs" style={{ color: 'var(--ash)' }}>
                                    Página {logsPage}
                                </span>
                                <button onClick={() => fetchLogs(logsPage + 1)} disabled={logsPage * 20 >= logsTotal}
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-40"
                                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                                    Siguiente
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Sistemas;