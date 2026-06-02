import { useState, useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { User, Bell, MessageSquare } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { ROLES_SISTEMAS } from '../constants/roles';
import UsuariosTab      from '../components/sistemas/UsuariosTab';
import NotificacionesTab from '../components/sistemas/NotificacionesTab';
import LogsTab          from '../components/sistemas/LogsTab';

const TABS = [
    { id: 'usuarios',       label: 'Usuarios',       icon: User },
    { id: 'notificaciones', label: 'Notificaciones',  icon: Bell },
    { id: 'logs',           label: 'Log de envíos',   icon: MessageSquare },
];

const Sistemas = () => {
    // Guard: debe ir antes de cualquier otro hook condicional.
    const { user, loading: authLoading } = useContext(AuthContext);

    if (authLoading) return null;
    if (!user || !ROLES_SISTEMAS.includes(user.rol)) {
        return <Navigate to="/dashboard" replace />;
    }

    return <SistemasInner />;
};

// Componente interno: solo se monta cuando el usuario está autorizado.
const SistemasInner = () => {
    const [activeTab, setActiveTab] = useState('usuarios');

    return (
        <div>
            {/* Cabecera */}
            <div className="mb-6">
                <h2 className="text-lg font-medium" style={{ color: 'var(--jet)' }}>
                    Panel de Sistemas
                </h2>
                <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>
                    Gestión de identidades, permisos y configuración del sistema.
                </p>
            </div>

            {/* Navegación de tabs */}
            <div className="flex gap-1 mb-5 p-1 rounded-xl w-fit"
                style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                {TABS.map(({ id, label, icon: Icon }) => {
                    const active = activeTab === id;
                    return (
                        <button key={id} onClick={() => setActiveTab(id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                            style={active
                                ? { background: 'var(--pb)', color: '#fff' }
                                : { color: 'var(--ash)' }}>
                            <Icon size={13} /> {label}
                        </button>
                    );
                })}
            </div>

            {/* Contenido del tab activo */}
            {activeTab === 'usuarios'       && <UsuariosTab />}
            {activeTab === 'notificaciones' && <NotificacionesTab />}
            {activeTab === 'logs'           && <LogsTab />}
        </div>
    );
};

export default Sistemas;
