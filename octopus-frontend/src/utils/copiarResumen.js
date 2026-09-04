/**
 * Copia un resumen en texto plano al portapapeles.
 *
 * Usa la Clipboard API cuando está disponible (requiere contexto seguro);
 * si no, cae en un <textarea> temporal + document.execCommand('copy') —
 * equipos viejos o sedes sin HTTPS.
 *
 * @param {string} titulo primera línea del resumen
 * @param {string[]} lineas resto de las líneas, en orden
 * @returns {Promise<boolean>} true si la copia tuvo éxito
 */
export async function copiarResumen(titulo, lineas = []) {
    const texto = [titulo, ...lineas].join('\n');

    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(texto);
            return true;
        } catch {
            // sigue al fallback
        }
    }

    try {
        const textarea = document.createElement('textarea');
        textarea.value = texto;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(textarea);
        return ok;
    } catch {
        return false;
    }
}

export default copiarResumen;
