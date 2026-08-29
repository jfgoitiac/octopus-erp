import { useState, useEffect, useCallback, useRef } from 'react';

const VERSION = 1;

const storageKey = (username) => `octopus_sidebar_prefs_${username}`;

const esFormaValida = (data) =>
    data &&
    typeof data === 'object' &&
    data.version === VERSION &&
    Array.isArray(data.favoritos) &&
    data.favoritos.every((p) => typeof p === 'string') &&
    Array.isArray(data.gruposColapsados) &&
    data.gruposColapsados.every((g) => typeof g === 'string');

const leerPrefs = (username) => {
    if (!username) return null;
    try {
        const raw = window.localStorage.getItem(storageKey(username));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return esFormaValida(parsed) ? parsed : null;
    } catch {
        return null;
    }
};

const escribirPrefs = (username, prefs) => {
    if (!username) return;
    try {
        window.localStorage.setItem(storageKey(username), JSON.stringify(prefs));
    } catch {
        // almacenamiento bloqueado o cuota excedida — se continúa sin persistir
    }
};

const DEFAULT_PREFS = { favoritos: [], gruposColapsados: [], version: VERSION };

// Encapsula toda la persistencia de preferencias del sidebar (favoritos y
// grupos colapsados). Si username aún no está disponible (carga asíncrona del
// usuario), opera en memoria sin persistir hasta que aparezca.
export function useSidebarPrefs(username) {
    const [prefs, setPrefs] = useState(() => leerPrefs(username) ?? DEFAULT_PREFS);
    const usernameRef = useRef(username);

    useEffect(() => {
        if (username && username !== usernameRef.current) {
            setPrefs(leerPrefs(username) ?? DEFAULT_PREFS);
        }
        usernameRef.current = username;
    }, [username]);

    useEffect(() => {
        if (!username) return;
        escribirPrefs(username, prefs);
    }, [username, prefs]);

    const toggleFavorito = useCallback((path) => {
        setPrefs((prev) => {
            const yaEsFavorito = prev.favoritos.includes(path);
            return {
                ...prev,
                favoritos: yaEsFavorito
                    ? prev.favoritos.filter((p) => p !== path)
                    : [...prev.favoritos, path],
            };
        });
    }, []);

    const toggleGrupo = useCallback((label) => {
        setPrefs((prev) => {
            const colapsado = prev.gruposColapsados.includes(label);
            return {
                ...prev,
                gruposColapsados: colapsado
                    ? prev.gruposColapsados.filter((g) => g !== label)
                    : [...prev.gruposColapsados, label],
            };
        });
    }, []);

    const esFavorito = useCallback((path) => prefs.favoritos.includes(path), [prefs.favoritos]);

    const reset = useCallback(() => {
        setPrefs(DEFAULT_PREFS);
    }, []);

    return {
        favoritos: prefs.favoritos,
        gruposColapsados: prefs.gruposColapsados,
        toggleFavorito,
        toggleGrupo,
        esFavorito,
        reset,
    };
}
