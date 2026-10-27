// El refresh token vive en cookie HttpOnly gestionada por el backend.
// El access token se conserva solo durante la pestaña actual: esto evita que
// una recarga completa dependa de la red, algo importante en el POS, sin dejar
// la sesión persistida entre cierres del navegador como haría localStorage.
const SESSION_KEY = 'octopus_access_token';

const readSessionToken = () => {
    try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; }
};

let _token = readSessionToken();

export const tokenStore = {
    set:   (t) => {
        _token = t;
        try { sessionStorage.setItem(SESSION_KEY, t); } catch { /* memoria como fallback */ }
    },
    get:   ()  => _token,
    clear: ()  => {
        _token = null;
        try { sessionStorage.removeItem(SESSION_KEY); } catch { /* sin persistencia */ }
    },
};
