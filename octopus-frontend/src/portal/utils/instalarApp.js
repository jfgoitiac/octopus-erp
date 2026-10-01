// Instalación del portal como app (acceso directo en la pantalla de inicio).
//
// Chrome/Edge en Android disparan `beforeinstallprompt` UNA sola vez, apenas
// la página cumple los requisitos de PWA (manifest + service worker) — casi
// siempre antes de que React monte el portal. Por eso el listener se registra
// a nivel de módulo, importado desde main.jsx, y el evento se guarda aquí
// hasta que el banner lo pida.
//
// iOS/Safari no tiene ese evento: la única vía es "Compartir → Agregar a
// pantalla de inicio", así que para iPhone/iPad se muestran instrucciones.

const CLAVE_DESCARTE = 'portal_instalar_descartado';
const DIAS_SILENCIO = 7;

let eventoDiferido = null;
let instalada = false;
const suscriptores = new Set();

const notificar = () => suscriptores.forEach((fn) => fn());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Evita la mini-barra automática de Chrome: el banner propio la reemplaza.
    event.preventDefault();
    eventoDiferido = event;
    notificar();
  });

  window.addEventListener('appinstalled', () => {
    eventoDiferido = null;
    instalada = true;
    notificar();
  });
}

export function suscribirInstalacion(fn) {
  suscriptores.add(fn);
  return () => suscriptores.delete(fn);
}

export function hayEventoInstalacion() {
  return eventoDiferido !== null;
}

// Abre el diálogo nativo de instalación. Devuelve true si el usuario aceptó.
export async function lanzarInstalacion() {
  if (!eventoDiferido) return false;
  const evento = eventoDiferido;
  // El evento solo se puede usar una vez, acepte o no.
  eventoDiferido = null;
  notificar();
  await evento.prompt();
  const { outcome } = await evento.userChoice;
  return outcome === 'accepted';
}

export function estaEnModoApp() {
  if (instalada) return true;
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true // Safari iOS
  );
}

export function esIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // iPadOS 13+ se presenta como Mac; se distingue por la pantalla táctil.
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

export function fueDescartadoRecientemente() {
  try {
    const marca = Number(localStorage.getItem(CLAVE_DESCARTE));
    if (!marca) return false;
    return Date.now() - marca < DIAS_SILENCIO * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function marcarDescartado() {
  try {
    localStorage.setItem(CLAVE_DESCARTE, String(Date.now()));
  } catch {
    // Modo privado / almacenamiento bloqueado: el banner volverá a salir.
  }
}
