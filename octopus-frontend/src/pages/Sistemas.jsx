import { useState, useEffect, useContext } from 'react';
import { Navigate } from 'react-router-dom';
import {
    ShieldAlert, UserPlus, Key, Trash2, Settings,
    User, Mail, Lock, X, Eye, EyeOff, Loader2, RefreshCcw, UserCog
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

    useEffect(() => { fetchUsers(); }, []);

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

    return (
        <div>
            <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div> {/* CORRECCIÓN 6: Header de página */}
                    <h2 className="text-lg font-medium" style={{ color: 'var(--jet)' }}>
                        Panel de Sistemas
                    </h2>
                    <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>
                        Gestión de identidades y permisos.
                    </p>
                </div>

                <div className="flex gap-2">
                    {/* CORRECCIÓN 4: Botón secundario */}
                    <button onClick={fetchUsers}
                        className="p-2 rounded-lg border transition-all"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                        title="Refrescar">
                        <RefreshCcw size={15} />
                    </button>
                    <button onClick={() => setShowModal(true)}
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
                        style={{ background: 'var(--pb)' }}>
                        <UserPlus size={15} /> Nuevo usuario
                    </button>
                </div>
            </div>

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
        </div>
    );
};

export default Sistemas;