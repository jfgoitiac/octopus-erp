// Destino post-login del portal. Solo se aceptan rutas internas /portal/* para
// evitar open redirect (//host, http://..., /admin, /portal-docente, etc.).
export const DESTINO_PORTAL_POR_DEFECTO = '/portal';

const RUTAS_AUTH = ['/portal/login', '/portal/olvide-contrasena', '/portal/restablecer-contrasena'];

export const esDestinoPortalValido = (destino) => {
  if (typeof destino !== 'string' || !destino.startsWith('/') || destino.startsWith('//')) return false;
  if (destino.includes('\\') || [...destino].some((c) => c.charCodeAt(0) <= 32)) return false;
  const path = destino.split(/[?#]/)[0];
  if (path !== '/portal' && !path.startsWith('/portal/')) return false;
  return !RUTAS_AUTH.includes(path);
};

export const destinoPortalSeguro = (destino) =>
  esDestinoPortalValido(destino) ? destino : DESTINO_PORTAL_POR_DEFECTO;

// Ruta al login conservando el destino original (path + query).
export const loginPortalConDestino = ({ pathname, search = '', hash = '' }) => {
  const destino = `${pathname}${search}${hash}`;
  return esDestinoPortalValido(destino) && destino !== DESTINO_PORTAL_POR_DEFECTO
    ? { pathname: '/portal/login', search: `?redirect=${encodeURIComponent(destino)}` }
    : '/portal/login';
};
