import { useCallback, useEffect, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import { toast } from 'react-toastify';
import { Loader2, ZoomIn } from 'lucide-react';
import { Modal } from './Modal';

async function renderizarPrimeraPaginaPdf(archivo) {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
    ).toString();

    const buffer = await archivo.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const pagina = await pdf.getPage(1);
    const viewport = pagina.getViewport({ scale: 3 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await pagina.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return canvas.toDataURL('image/png');
}

function cargarImagen(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

async function exportarRecorte(src, areaRecorte, salidaW, salidaH) {
    const img = await cargarImagen(src);
    const canvas = document.createElement('canvas');
    canvas.width = salidaW;
    canvas.height = salidaH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(
        img,
        areaRecorte.x, areaRecorte.y, areaRecorte.width, areaRecorte.height,
        0, 0, salidaW, salidaH,
    );
    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

/**
 * Modal de recorte con proporción fija (por defecto 2200:410, encabezado_personalizado).
 * Acepta una imagen (PNG/JPG) o un PDF (se renderiza su primera página como
 * imagen dentro del navegador con pdf.js) y exporta el recorte final como PNG
 * exacto a salidaW x salidaH — no interpreta ni extrae contenido del documento.
 */
export default function RecortadorImagen({
    archivo, onCancelar, onRecortado,
    salidaW = 2200, salidaH = 410,
    titulo = 'Recortar encabezado personalizado',
    ayuda = 'Arrastrá y hacé zoom para encuadrar tu membrete en la proporción del encabezado (2200×410px).',
}) {
    const aspecto = salidaW / salidaH;
    const [imagenSrc, setImagenSrc] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [areaPixeles, setAreaPixeles] = useState(null);
    const [exportando, setExportando] = useState(false);

    // onCancelar llega como función inline desde Configuracion.jsx, que se
    // re-renderiza constantemente (cualquier tecla, polling, etc.) y por lo
    // tanto crea una identidad nueva en cada render. Se lee vía ref para que
    // este efecto dependa solo de `archivo` — si dependiera de `onCancelar`,
    // cada re-render del padre reiniciaba la carga (cargando=true) mientras
    // el usuario recortaba, desmontando el Cropper y perdiendo el recorte.
    const onCancelarRef = useRef(onCancelar);
    useEffect(() => { onCancelarRef.current = onCancelar; }, [onCancelar]);

    useEffect(() => {
        let cancelado = false;
        (async () => {
            try {
                if (archivo.type === 'application/pdf') {
                    const dataUrl = await renderizarPrimeraPaginaPdf(archivo);
                    if (!cancelado) setImagenSrc(dataUrl);
                } else {
                    if (!cancelado) setImagenSrc(URL.createObjectURL(archivo));
                }
            } catch {
                if (!cancelado) toast.error('No se pudo leer el archivo. Probá con otra imagen o PDF.');
                if (!cancelado) onCancelarRef.current();
            } finally {
                if (!cancelado) setCargando(false);
            }
        })();
        return () => { cancelado = true; };
    }, [archivo]);

    const onCropComplete = useCallback((_, areaPixelesRecorte) => {
        setAreaPixeles(areaPixelesRecorte);
    }, []);

    const handleConfirmar = async () => {
        if (!areaPixeles) return;
        setExportando(true);
        try {
            const blob = await exportarRecorte(imagenSrc, areaPixeles, salidaW, salidaH);
            onRecortado(blob);
        } catch {
            toast.error('No se pudo generar el recorte.');
        } finally {
            setExportando(false);
        }
    };

    return (
        <Modal
            open
            onClose={onCancelar}
            titulo={titulo}
            size="lg"
            footer={(
                <>
                    <button type="button" onClick={onCancelar} disabled={exportando}
                        className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium"
                        style={{ background: 'var(--bg)', color: 'var(--ash)', border: '0.5px solid var(--border-md)' }}>
                        Cancelar
                    </button>
                    <button type="button" onClick={handleConfirmar} disabled={exportando || cargando || !areaPixeles}
                        className="w-full sm:w-auto px-4 py-2.5 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
                        style={{ background: 'var(--pb)' }}>
                        {exportando ? <Loader2 size={16} className="animate-spin" /> : null}
                        Usar este recorte
                    </button>
                </>
            )}
        >
            <div className="flex flex-col gap-3">
                <p className="text-xs" style={{ color: 'var(--ash)' }}>
                    {ayuda}
                </p>
                <div className="relative w-full" style={{ height: '55dvh', minHeight: 220, background: '#1a1a1a', borderRadius: 12, overflow: 'hidden' }}>
                    {cargando && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="animate-spin" size={28} color="#fff" />
                        </div>
                    )}
                    {imagenSrc && !cargando && (
                        <Cropper
                            image={imagenSrc}
                            crop={crop}
                            zoom={zoom}
                            aspect={aspecto}
                            restrictPosition={false}
                            onCropChange={setCrop}
                            onZoomChange={setZoom}
                            onCropComplete={onCropComplete}
                        />
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <ZoomIn size={16} style={{ color: 'var(--ash)' }} />
                    <input
                        type="range" min={1} max={4} step={0.01} value={zoom}
                        onChange={e => setZoom(Number(e.target.value))}
                        className="w-full"
                    />
                </div>
            </div>
        </Modal>
    );
}
