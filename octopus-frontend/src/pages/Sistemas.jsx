import { useState, useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { User, Bell, MessageSquare, AlertTriangle } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { ROLES_SISTEMAS } from '../constants/roles';
import UsuariosTab      from '../components/sistemas/UsuariosTab';
import NotificacionesTab from '../components/sistemas/NotificacionesTab';
import LogsTab          from '../components/sistemas/LogsTab';
import LimpiezaDatosTab  from '../components/sistemas/LimpiezaDatosTab';

const TABS = [
    { id: 'usuarios',       label: 'Usuarios',       icon: User },
    { id: 'notificaciones', label: 'Notificaciones',  icon: Bell },
    { id: 'logs',           label: 'Log de envíos',   icon: MessageSquare },
    // TODO-TEMPORAL: quitar este tab (y LimpiezaDatosTab.jsx) tras la limpieza de datos de prueba
    { id: 'limpieza',       label: '⚠ Limpieza de datos', icon: AlertTriangle },
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
            <div className="w-full overflow-x-auto mb-5 -mx-4 px-4 sm:mx-0 sm:px-0">
                <div className="flex gap-1 p-1 rounded-xl w-fit"
                    style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                    {TABS.map(({ id, label, icon: Icon }) => {
                        const active = activeTab === id;
                        return (
                            <button key={id} onClick={() => setActiveTab(id)}
                                aria-current={active ? 'page' : undefined}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all min-h-[40px] whitespace-nowrap"
                                style={active
                                    ? { background: 'var(--pb)', color: '#fff' }
                                    : { color: 'var(--ash)' }}>
                                <Icon size={13} /> {label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Contenido del tab activo */}
            {activeTab === 'usuarios'       && <UsuariosTab />}
            {activeTab === 'notificaciones' && <NotificacionesTab />}
            {activeTab === 'logs'           && <LogsTab />}
            {activeTab === 'limpieza'       && <LimpiezaDatosTab />}
        </div>
    );
};

export default Sistemas;
