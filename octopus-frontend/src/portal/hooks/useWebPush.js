import { useCallback, useState } from 'react';
import { suscribirPush, desuscribirPush } from '../api/notificaciones.service';
import { useBranding } from '../../context/BrandingContext';

const isPushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  typeof Notification !== 'undefined';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Registra el Service Worker generado por vite-plugin-pwa (registro manual,
// injectRegister: null en vite.config.js) y espera a que quede activo.
async function ensureServiceWorkerReady() {
  if (!isPushSupported()) return null;
  try {
    const { registerSW } = await import('virtual:pwa-register');
    registerSW({ immediate: true });
  } catch {
    // En dev sin devOptions.enabled no existe el módulo virtual — no hay
    // Service Worker que registrar hasta correr sobre un build de producción.
  }
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/**
 * Suscripción/desuscripción a notificaciones Web Push del portal.
 * Fallback esperado: Safari < 16.4 (o cualquier navegador sin PushManager)
 * reporta `supported: false` — el llamador debe mostrar el aviso de que las
 * notificaciones seguirán llegando por email.
 */
export default function useWebPush() {
  const supported = isPushSupported();
  const [permission, setPermission] = useState(supported ? Notification.permission : 'unsupported');
  const [loading, setLoading] = useState(false);
  const { vapidPublicKey } = useBranding();

  const subscribe = useCallback(async (tipos) => {
    if (!supported) throw new Error('Este navegador no soporta notificaciones push.');
    setLoading(true);
    try {
      const permiso = await Notification.requestPermission();
      setPermission(permiso);
      if (permiso !== 'granted') {
        throw new Error('Permiso de notificaciones denegado.');
      }

      const registration = await ensureServiceWorkerReady();
      if (!registration) {
        throw new Error('No se pudo registrar el Service Worker.');
      }

      if (!vapidPublicKey) {
        throw new Error('El servidor no tiene configurado Web Push.');
      }

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
      }
      await suscribirPush(subscription, tipos);
      return true;
    } finally {
      setLoading(false);
    }
  }, [supported, vapidPublicKey]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await desuscribirPush(subscription.endpoint).catch(() => {});
        await subscription.unsubscribe();
      }
    } finally {
      setLoading(false);
    }
  }, [supported]);

  return { supported, permission, loading, subscribe, unsubscribe };
}
