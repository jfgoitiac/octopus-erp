import { useCallback, useState } from 'react';
import { toast } from 'react-toastify';
import { parseApiError } from '../utils/apiError';
import { descargarPreinscripcionBlob, descargarPreinscripcionMasivaBlob } from '../api/preinscripcion.service';

const CONTENT_TYPE_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const CONTENT_TYPE_ZIP = 'application/zip';

function descargarBlob(data, contentType, filename) {
    const url = URL.createObjectURL(new Blob([data], { type: contentType }));
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function usePreinscripcion() {
    const [showSelector, setShowSelector] = useState(false);
    const [modo, setModo] = useState(null); // 'individual' | 'masivo'
    const [alumnoId, setAlumnoId] = useState(null);
    const [generando, setGenerando] = useState(false);

    const abrirParaAlumno = useCallback((id) => {
        setModo('individual');
        setAlumnoId(id);
        setShowSelector(true);
    }, []);

    const abrirParaTodos = useCallback(() => {
        setModo('masivo');
        setAlumnoId(null);
        setShowSelector(true);
    }, []);

    const cerrarSelector = useCallback(() => {
        if (generando) return;
        setShowSelector(false);
    }, [generando]);

    const generar = useCallback(async (campos, formatoMasivo) => {
        setGenerando(true);
        try {
            if (modo === 'individual') {
                const res = await descargarPreinscripcionBlob(alumnoId, campos);
                descargarBlob(res.data, CONTENT_TYPE_DOCX, `preinscripcion_${alumnoId}.docx`);
            } else if (formatoMasivo === 'unico') {
                const res = await descargarPreinscripcionMasivaBlob(campos, 'unico');
                descargarBlob(res.data, CONTENT_TYPE_DOCX, 'preinscripciones.docx');
            } else {
                const res = await descargarPreinscripcionMasivaBlob(campos, 'individual');
                descargarBlob(res.data, CONTENT_TYPE_ZIP, 'preinscripciones.zip');
            }
            toast.success('Planilla de pre-inscripción generada correctamente.');
            setShowSelector(false);
        } catch (err) {
            toast.error(parseApiError(err) || 'No se pudo generar la planilla de pre-inscripción.');
        } finally {
            setGenerando(false);
        }
    }, [modo, alumnoId]);

    return { showSelector, modo, generando, abrirParaAlumno, abrirParaTodos, cerrarSelector, generar };
}
