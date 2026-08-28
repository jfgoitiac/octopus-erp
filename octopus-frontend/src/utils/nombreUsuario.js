export const nombreUsuario = (u) =>
    u?.nombre_completo
    || `${u?.first_name || ''} ${u?.last_name || ''}`.trim()
    || u?.nombre
    || u?.username
    || 'Usuario';

export const inicialesUsuario = (u) => {
    const first = (u?.first_name || '').trim();
    const last = (u?.last_name || '').trim();

    if (first || last) {
        return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || first.slice(0, 2).toUpperCase();
    }

    const nombre = (u?.nombre_completo || u?.nombre || '').trim();
    if (nombre) {
        const partes = nombre.split(/\s+/).filter(Boolean);
        if (partes.length >= 2) {
            return `${partes[0].charAt(0)}${partes[1].charAt(0)}`.toUpperCase();
        }
        return nombre.slice(0, 2).toUpperCase();
    }

    return (u?.username || 'US').slice(0, 2).toUpperCase();
};
