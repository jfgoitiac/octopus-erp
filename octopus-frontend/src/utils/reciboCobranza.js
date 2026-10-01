import { toast } from 'react-toastify';
import { getReciboPdf, prepararReciboWhatsApp } from '../api/cobranza.service';
import { imprimirPdf } from './pdfArchivo';

// El recibo de cobranza se genera SOLO en el backend (cobranza/recibo_cobranza.py):
// el panel, el portal, el correo y WhatsApp reciben el mismo PDF. Aquí el panel
// solo lo imprime o lo comparte; no se dibuja nada en el navegador.

/** Pide el recibo de un pago al backend y abre la impresión. */
export const imprimirReciboPago = async (pagoId) => {
    try {
        const res = await getReciboPdf(pagoId);
        imprimirPdf(res.data);
    } catch {
        toast.error('No se pudo generar el recibo. Puedes reimprimirlo desde Comprobantes.');
    }
};

/**
 * Abre WhatsApp Web con el mensaje y el enlace al recibo (mismo patrón que el
 * cobro por WhatsApp). La pestaña se abre en el mismo clic para que el
 * navegador no la bloquee como ventana emergente; luego se le asigna wa.me.
 */
export const enviarReciboPorWhatsApp = async (pagoId) => {
    const ventana = window.open('', '_blank');
    try {
        const { data } = await prepararReciboWhatsApp(pagoId);
        if (ventana) {
            ventana.opener = null;
            ventana.location.href = data.url;
        } else {
            window.open(data.url, '_blank', 'noopener,noreferrer');
        }
        toast.success('Se abrió WhatsApp con el enlace al recibo.');
    } catch (error) {
        ventana?.close();
        toast.error(error?.response?.data?.error || 'No se pudo preparar el envío por WhatsApp.');
    }
};
