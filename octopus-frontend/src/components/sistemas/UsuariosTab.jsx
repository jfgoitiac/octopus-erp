import { useState, useEffect } from 'react';
import { UserPlus, UserCog, Key, Trash2, Settings, ShieldAlert,
         RefreshCcw, Loader2, Database, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useUsuariosSistemas } from '../../hooks/useUsuariosSistemas';
import { getRolStyle } from '../../constants/roles';
import ConfirmDeleteModal from '../ConfirmDeleteModal';
import CrearUsuarioModal from './modals/CrearUsuarioModal';
import EditRolModal from './modals/EditRolModal';
import ResetPasswordModal from './modals/ResetPasswordModal';

const UsuariosTab = () => {
    const {
        usuarios, loadingUsers, backingUp, syncingBCV,
        fetchUsers, createUser, deleteUser, editRol, resetPassword,
        downloadBackup, syncBCV,
    } = useUsuariosSistemas();

    const [showCrear,  setShowCrear]  = useState(false);
    const [showEditRol, setShowEditRol] = useState(false);
    const [showReset,  setShowReset]  = useState(false);
    const [showDelete, setShowDelete] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);

    useEffect(() => {
        const controller = new AbortController();
        fetchUsers(controller.signal);
        return () => controller.abort();
    }, [fetchUsers]);

    const openEditRol = (u) => { setSelectedUser(u); setShowEditRol(true); };
    const openReset   = (u) => { setSelectedUser(u); setShowReset(true); };
    const openDelete  = (u) => { setSelectedUser(u); setShowDelete(true); };

    const handleConfirmDelete = async () => {
        const ok = await deleteUser(selectedUser?.id);
        if (ok) { setShowDelete(false); setSelectedUser(null); }
    };

    const formatLastLogin = (dateStr) =>
        dateStr ? format(new Date(dateStr), 'dd MMM yyyy', { locale: es }) : 'Nunca';

    return (
        <>
            {/* Barra de acciones */}
            <div className="flex justify-end gap-2 mb-4">
                <button onClick={() => fetchUsers()}
                    className="p-2 rounded-lg border transition-all"
                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                    aria-label="Refrescar lista de usuarios" title="Refrescar">
                    <RefreshCcw size={15} />
                </button>
                <button onClick={() => setShowCrear(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all"
                    style={{ background: 'var(--pb)' }}>
                    <UserPlus size={15} /> Nuevo usuario
                </button>
            </div>

            {/* Tabla de usuarios con scroll horizontal para móvil */}
            <div className="rounded-xl overflow-hidden mb-6"
                style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[520px]">
                        <thead>
                            <tr>
                                {['Usuario', 'Rol', 'Último acceso', 'Acciones'].map(h => (
                                    <th key={h} className="px-4 py-3 text-[11px] uppercase tracking-widest"
                                        style={{ color: 'var(--ash)', background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loadingUsers ? (
                                <tr>
                                    <td colSpan="4" className="px-4 py-12 text-center">
                                        <Loader2 className="animate-spin inline-block" size={20} style={{ color: 'var(--pb)' }} />
                                    </td>
                                </tr>
                            ) : usuarios.length > 0 ? usuarios.map(u => (
                                <tr key={u.id} style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                                    <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                        {u.username}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase ${getRolStyle(u.perfil?.rol)}`}>
                                            {u.perfil?.rol || 'Sin rol'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--ash)' }}>
                                        {formatLastLogin(u.last_login)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-3">
                                            <button onClick={() => openEditRol(u)}
                                                aria-label={`Editar rol de ${u.username}`}
                                                title="Editar rol" className="transition-colors"
                                                style={{ color: 'var(--ash)' }}
                                                onMouseEnter={e => e.currentTarget.style.color = 'var(--pb)'}
                                                onMouseLeave={e => e.currentTarget.style.color = 'var(--ash)'}>
                                                <UserCog size={16} />
                                            </button>
                                            <button onClick={() => openReset(u)}
                                                aria-label={`Resetear clave de ${u.username}`}
                                                title="Resetear clave" className="transition-colors"
                                                style={{ color: 'var(--ash)' }}
                                                onMouseEnter={e => e.currentTarget.style.color = 'var(--pb)'}
                                                onMouseLeave={e => e.currentTarget.style.color = 'var(--ash)'}>
                                                <Key size={16} />
                                            </button>
                                            <button onClick={() => openDelete(u)}
                                                aria-label={`Eliminar usuario ${u.username}`}
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
            </div>

            {/* Consola de mantenimiento */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-xl" style={{ background: 'var(--jet)' }}>
                    <h3 className="text-sm font-medium text-white flex items-center gap-2 mb-4">
                        <Settings size={16} style={{ color: 'var(--pb)' }} />
                        <span>Consola de mantenimiento</span>
                    </h3>
                    <div className="space-y-2">
                        <button onClick={syncBCV} disabled={syncingBCV || backingUp}
                            className="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all disabled:opacity-50 flex items-center gap-2"
                            style={{ background: 'rgba(255,255,255,0.07)', color: '#e2e8f0' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}>
                            {syncingBCV
                                ? <><Loader2 className="animate-spin" size={14} /> Sincronizando...</>
                                : <><RefreshCw size={14} /> Sincronizar tasa BCV</>
                            }
                        </button>
                        <button onClick={downloadBackup} disabled={backingUp || syncingBCV}
                            className="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all disabled:opacity-50 flex items-center gap-2"
                            style={{ background: 'rgba(255,255,255,0.07)', color: '#e2e8f0' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}>
                            {backingUp
                                ? <><Loader2 className="animate-spin" size={14} /> Generando respaldo...</>
                                : <><Database size={14} /> Respaldar base de datos</>
                            }
                        </button>
                    </div>
                </div>

                <div className="p-5 rounded-xl flex flex-col justify-center items-center text-center"
                    style={{ border: '1.5px dashed var(--border-md)', background: 'var(--porcelain)' }}>
                    <ShieldAlert size={32} style={{ color: 'var(--border-md)' }} className="mb-2" />
                    <p className="text-sm" style={{ color: 'var(--ash)' }}>
                        Cualquier cambio en permisos queda registrado en el Log de Auditoría.
                    </p>
                </div>
            </div>

            {/* Modales */}
            {showCrear && (
                <CrearUsuarioModal
                    onClose={() => setShowCrear(false)}
                    onCreate={createUser}
                />
            )}
            {showEditRol && selectedUser && (
                <EditRolModal
                    targetUser={selectedUser}
                    onClose={() => { setShowEditRol(false); setSelectedUser(null); }}
                    onEditRol={editRol}
                />
            )}
            {showReset && selectedUser && (
                <ResetPasswordModal
                    targetUser={selectedUser}
                    onClose={() => { setShowReset(false); setSelectedUser(null); }}
                    onResetPassword={resetPassword}
                />
            )}
            {showDelete && selectedUser && (
                <ConfirmDeleteModal
                    titulo="Eliminar usuario"
                    nombre={selectedUser.username}
                    onConfirm={handleConfirmDelete}
                    onCancel={() => { setShowDelete(false); setSelectedUser(null); }}
                />
            )}
        </>
    );
};

export default UsuariosTab;
