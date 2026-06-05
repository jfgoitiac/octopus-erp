// Access token en memoria — no persiste entre recargas (por diseño).
// El refresh token vive en cookie HttpOnly gestionada por el backend.
let _token = null;

export const tokenStore = {
    set:   (t) => { _token = t; },
    get:   ()  => _token,
    clear: ()  => { _token = null; },
};
