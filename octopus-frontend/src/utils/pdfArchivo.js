// Helpers para PDF que llegan del backend como blob. Sin dependencias de
// ningún cliente HTTP: los usan tanto el panel como el portal.

/** Nombre del archivo desde Content-Disposition (Recibo_<N°>.pdf) o el fallback. */
export const nombreArchivoPdf = (headers, fallback = 'Recibo.pdf') => {
    const match = /filename="?([^";]+)"?/i.exec(headers?.['content-disposition'] || '');
    return match ? match[1] : fallback;
};

/** Abre el diálogo de impresión con el PDF, sin salir de la pantalla actual. */
export const imprimirPdf = (blob) => {
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;';
    iframe.src = url;
    iframe.onload = () => {
        try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        } catch {
            // Navegadores que no imprimen un PDF desde un iframe: se abre en otra pestaña.
            window.open(url, '_blank', 'noopener');
        }
    };
    document.body.appendChild(iframe);
    setTimeout(() => {
        iframe.remove();
        URL.revokeObjectURL(url);
    }, 60000);
};

/** Descarga el PDF con su nombre (en el celular es lo que funciona, no imprimir). */
export const descargarPdf = (blob, nombre) => {
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
};
