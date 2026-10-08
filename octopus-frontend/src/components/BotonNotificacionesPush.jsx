import { Bell, BellOff } from 'lucide-react';
import useWebPushPanel from '../hooks/useWebPushPanel';

/**
 * Botón de campana para activar o desactivar las notificaciones push de este
 * navegador. No se muestra si el navegador no soporta push o el servidor aún
 * no cargó el estado. `variante="topbar"` usa los colores de la barra
 * superior del panel; `"claro"`, los del portal docente.
 */
export default function BotonNotificacionesPush({ variante = 'topbar' }) {
    const { supported, listo, activa, loading, alternar } = useWebPushPanel();
    if (!supported || !listo) return null;

    const estilo = variante === 'topbar'
        ? { background: 'rgba(0,0,0,0.18)', color: 'var(--topbar-fg)', outlineColor: 'var(--topbar-fg)' }
        : { background: 'transparent', color: activa ? 'var(--docente-primary)' : '#6b7280' };
    const Icono = activa ? Bell : BellOff;

    return (
        <button
            type="button"
            onClick={alternar}
            disabled={loading}
            aria-pressed={activa}
            aria-label={activa ? 'Desactivar notificaciones push' : 'Activar notificaciones push'}
            title={activa ? 'Notificaciones activadas' : 'Activar notificaciones'}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={estilo}
        >
            <Icono size={14} />
        </button>
    );
}
