// Handlers de Web Push del Portal de Representantes.
//
// El Service Worker principal (sw.js) lo genera vite-plugin-pwa con la
// estrategia `generateSW` (Workbox), que solo sabe de precache/runtime cache:
// no trae listeners de 'push' ni de 'notificationclick'. Este archivo se
// inyecta en ese sw.js vía `workbox.importScripts` (vite.config.js) — sin él,
// el navegador recibe el push pero no muestra nada.
//
// Payload que envía el backend (notificaciones/services.py → enviar_push):
//   { "title": "...", "body": "...", "url": "/portal/...", "icon": "/api/portal/icono-app/192.png?v=..." }
// `icon` es el logo del colegio y solo viene si el colegio subió uno.

const ICONO = '/icons/icon-192.png';
const URL_POR_DEFECTO = '/portal';

self.addEventListener('push', (event) => {
  let datos = {};
  if (event.data) {
    try {
      datos = event.data.json();
    } catch {
      datos = { body: event.data.text() };
    }
  }

  const titulo = datos.title || 'Octopus';
  const opciones = {
    body: datos.body || '',
    icon: datos.icon || ICONO,
    // El badge (barra de estado de Android) se pinta como silueta monocroma:
    // el ícono del colegio sobre fondo blanco saldría como un cuadrado lleno,
    // así que se mantiene el genérico.
    badge: ICONO,
    data: { url: datos.url || URL_POR_DEFECTO },
  };

  // userVisibleOnly: true obliga a mostrar siempre una notificación por cada
  // push recibido; si no, el navegador revoca el permiso.
  event.waitUntil(self.registration.showNotification(titulo, opciones));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const destino = new URL(
    (event.notification.data && event.notification.data.url) || URL_POR_DEFECTO,
    self.location.origin,
  ).href;

  event.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Si el portal ya está abierto en alguna pestaña, se reutiliza en vez de
    // abrir una nueva.
    const abierta = ventanas.find((c) => new URL(c.url).origin === self.location.origin);
    if (abierta) {
      await abierta.focus();
      if ('navigate' in abierta && abierta.url !== destino) {
        try {
          await abierta.navigate(destino);
        } catch {
          // navigate() falla si la pestaña no está controlada por este SW;
          // en ese caso se abre una ventana nueva con el destino.
          await self.clients.openWindow(destino);
        }
      }
      return;
    }
    await self.clients.openWindow(destino);
  })());
});
