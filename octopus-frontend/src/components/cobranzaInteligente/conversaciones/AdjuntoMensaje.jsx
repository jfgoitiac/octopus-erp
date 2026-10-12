import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Download, FileText, ImageOff, Loader2 } from 'lucide-react';
import { descargarArchivoMensaje } from '../../../api/cobranza.service';
import { mensajeError } from './conversacionesUtils';

const esImagen = (adjunto) => String(adjunto?.tipo || '').startsWith('image/');

/**
 * Adjunto de un mensaje. El archivo exige JWT, así que se descarga con Axios (blob) y se muestra
 * con una URL de objeto: las imágenes se cargan al aparecer; los documentos, al pulsar "Descargar".
 */
export function AdjuntoMensaje({ mensajeId, adjunto, pendiente = false }) {
    const [url, setUrl] = useState(null);
    const [fallo, setFallo] = useState(false);
    const [bajando, setBajando] = useState(false);
    const imagen = esImagen(adjunto);
    const descargable = !pendiente && !!adjunto?.url;

    useEffect(() => {
        if (!imagen || !descargable) return undefined;
        const controller = new AbortController();
        let objeto = null;
        descargarArchivoMensaje(mensajeId, controller.signal)
            .then(res => {
                objeto = URL.createObjectURL(res.data);
                setUrl(objeto);
            })
            .catch(err => {
                if (err?.code !== 'ERR_CANCELED') setFallo(true);
            });
        return () => {
            controller.abort();
            if (objeto) URL.revokeObjectURL(objeto);
        };
    }, [mensajeId, imagen, descargable]);

    const descargar = async () => {
        setBajando(true);
        try {
            const res = await descargarArchivoMensaje(mensajeId);
            const objeto = URL.createObjectURL(res.data);
            const enlace = document.createElement('a');
            enlace.href = objeto;
            enlace.download = adjunto.nombre || 'archivo';
            document.body.appendChild(enlace);
            enlace.click();
            enlace.remove();
            setTimeout(() => URL.revokeObjectURL(objeto), 1000);
        } catch (err) {
            toast.error(mensajeError(err, 'No se pudo descargar el archivo.'));
        } finally {
            setBajando(false);
        }
    };

    if (imagen) {
        if (url) {
            return (
                <button type="button" onClick={() => window.open(url, '_blank', 'noopener')}
                    className="block rounded-xl overflow-hidden max-w-full" aria-label={`Abrir imagen ${adjunto.nombre || ''}`.trim()}>
                    <img src={url} alt={adjunto.nombre || 'Imagen adjunta'} className="max-h-64 w-auto max-w-full object-cover rounded-xl" />
                </button>
            );
        }
        return (
            <div className="flex items-center justify-center gap-2 h-28 w-full sm:w-56 rounded-xl text-xs"
                style={{ background: 'var(--ash-light)', color: 'var(--ash)' }}>
                {fallo
                    ? <><ImageOff size={16} aria-hidden="true" /> No se pudo cargar la imagen</>
                    : <><Loader2 size={16} className="animate-spin" aria-hidden="true" /> {pendiente ? 'Enviando imagen…' : 'Cargando imagen…'}</>}
            </div>
        );
    }

    return (
        <button type="button" onClick={descargar} disabled={!descargable || bajando}
            className="flex items-center gap-2 w-full min-h-11 px-3 py-2 rounded-xl text-sm text-left disabled:opacity-60"
            style={{ background: 'var(--ash-light)', color: 'var(--jet)' }}>
            <FileText size={18} className="shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{adjunto?.nombre || 'Documento'}</span>
            {bajando
                ? <Loader2 size={16} className="animate-spin shrink-0" aria-hidden="true" />
                : descargable && <Download size={16} className="shrink-0" aria-label="Descargar" />}
        </button>
    );
}

export default AdjuntoMensaje;
