import { useState, useEffect } from 'react';

// Re-lee el valor de localStorage cada vez que la ventana recupera el foco.
// Esto evita que cestaConfig (tasa BCV, montos USD) quede obsoleto si el usuario
// lo actualizó en otra pestaña/ruta sin recargar la página de Nómina.
export function useSyncedLocalStorage(readFn) {
    const [value, setValue] = useState(readFn);
    useEffect(() => {
        const sync = () => setValue(readFn());
        window.addEventListener('focus', sync);
        return () => window.removeEventListener('focus', sync);
    }, [readFn]);
    return value;
}
