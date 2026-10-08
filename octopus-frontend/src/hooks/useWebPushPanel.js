import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import {
    isPushSupported, urlBase64ToUint8Array, ensureServiceWorkerReady,
} from '../portal/hooks/useWebPush';
import {
    getEstadoPushUsuario, suscribirPushUsuario, desuscribirPushUsuario,
} from '../api/pushUsuario.service';

/**
 * Activar/desactivar notificaciones push en este navegador para el usuario
 * autenticado del panel administrativo o del portal docente.
 */
export default function useWebPushPanel() {
    const supported = isPushSupported();
    const [estado, setEstado] = useState({ activa: false, vapid: '', listo: false });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!supported) return;
        getEstadoPushUsuario()
            .then(res => setEstado({ activa: res.data.activa, vapid: res.data.vapid_public_key, listo: true }))
            .catch(() => {});
    }, [supported]);

    const activar = useCallback(async () => {
        if (await Notification.requestPermission() !== 'granted') {
            throw new Error('Permiso de notificaciones denegado.');
        }
        if (!estado.vapid) throw new Error('El servidor no tiene configuradas las notificaciones push.');
        const registration = await ensureServiceWorkerReady();
        if (!registration) throw new Error('No se pudo registrar el Service Worker.');
        const subscription = (await registration.pushManager.getSubscription())
            || await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(estado.vapid),
            });
        await suscribirPushUsuario(subscription);
    }, [estado.vapid]);

    const desactivar = useCallback(async () => {
        const registration = await navigator.serviceWorker.getRegistration('/');
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
            await desuscribirPushUsuario(subscription.endpoint).catch(() => {});
            await subscription.unsubscribe();
        }
    }, []);

    const alternar = useCallback(async () => {
        setLoading(true);
        try {
            if (estado.activa) await desactivar(); else await activar();
            setEstado(e => ({ ...e, activa: !e.activa }));
            toast.success(estado.activa ? 'Notificaciones desactivadas' : 'Notificaciones activadas');
        } catch (err) {
            toast.error(err?.response?.data?.error || err.message || 'No se pudo cambiar las notificaciones.');
        } finally {
            setLoading(false);
        }
    }, [estado.activa, activar, desactivar]);

    return { supported, listo: estado.listo, activa: estado.activa, loading, alternar };
}
