// En `vite dev` nunca se registra un Service Worker nuevo (devOptions.enabled:
// false en vite.config.js), pero uno registrado en una sesión previa de
// `vite preview`/build de producción sobre el mismo origen (localhost) sigue
// activo y sigue interceptando peticiones — un hard reload no lo desregistra,
// porque vive en Cache Storage, no en la caché HTTP. Eso puede hacer que un
// cambio de código parezca "no aplicarse" en desarrollo. Se limpia solo para
// que nadie tenga que acordarse de hacerlo a mano en DevTools.
export async function limpiarServiceWorkersEnDev() {
  if (!import.meta.env.DEV) return false;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  try {
    const registros = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registros.map((r) => r.unregister()));
    return registros.length > 0;
  } catch {
    return false;
  }
}
