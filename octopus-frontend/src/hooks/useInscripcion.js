import { useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import { crearInscripcion, descargarComprobanteBlob } from '../api/inscripciones.service';

export const ESTADO_INICIAL = {
    representante:       null,
    esRepresentanteNuevo: false,
    alumno:              null,
    esAlumnoNuevo:       false,
    grado_seccion:       '',
    tipo_ingreso:        'nuevo',
    documentos_completos: false,
    periodo_escolar:     '',
    inscripcion_id:      null,
};

function parseApiError(err) {
    const data = err.response?.data;
    if (!data) return 'Error de conexión.';
    if (data.error) return data.error;
    if (data.detail) return data.detail;
    if (typeof data === 'object') {
        return Object.entries(data)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
            .join(' | ');
    }
    return 'Error inesperado.';
}

// Construye el payload con campos explícitos — evita enviar
// propiedades internas del objeto alumno/representante al backend.
// Siempre se envían los datos completos porque el backend usa get_or_create/
// update_or_create por cédula y no acepta objetos con solo {id}.
function buildPayload(datos) {
    const repBase = {
        cedula:    datos.representante.cedula,
        nombre:    datos.representante.nombre,
        apellido:  datos.representante.apellido,
        telefono:  datos.representante.telefono  || '',
        correo:    datos.representante.correo    || '',
        direccion: datos.representante.direccion || '',
    };

    const alumnoBase = {
        nombre:           datos.alumno.nombre,
        apellido:         datos.alumno.apellido,
        cedula_escolar:   datos.alumno.cedula_escolar || '',
        fecha_nacimiento: datos.alumno.fecha_nacimiento,
        genero:           datos.alumno.genero,
    };

    return {
        alumno:               { ...alumnoBase, representante: repBase },
        grado_seccion:        datos.grado_seccion,
        tipo_ingreso:         datos.tipo_ingreso,
        periodo_escolar:      datos.periodo_escolar,
        documentos_completos: datos.documentos_completos,
    };
}

export function useInscripcion() {
    const [paso,    setPaso]   = useState(1);
    const [loading, setLoading] = useState(false);
    const [exito,   setExito]  = useState(false);
    const [datos,   setDatos]  = useState(ESTADO_INICIAL);

    const handleConfirmar = useCallback(async () => {
        setLoading(true);
        try {
            const res = await crearInscripcion(buildPayload(datos));
            if (res.status === 201) {
                setDatos(prev => ({ ...prev, inscripcion_id: res.data.inscripcion_id }));
                setExito(true);
            }
        } catch (err) {
            toast.error(parseApiError(err));
        } finally {
            setLoading(false);
        }
    }, [datos]);

    const descargarPDF = useCallback(async (id) => {
        const targetId = id ?? datos.inscripcion_id;
        if (!targetId) {
            toast.error('No se encontró el ID de la inscripción.');
            return;
        }
        try {
            const res = await descargarComprobanteBlob(targetId);
            const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const newTab = window.open(url, '_blank', 'noopener,noreferrer');
            if (!newTab || newTab.closed || typeof newTab.closed === 'undefined') {
                const a = Object.assign(document.createElement('a'), {
                    href:     url,
                    download: `comprobante_inscripcion_${targetId}.pdf`,
                });
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
            // 5 s es suficiente para que el browser cargue el blob antes de revocarlo
            setTimeout(() => URL.revokeObjectURL(url), 5000);
        } catch (err) {
            if (err.response?.status === 404) {
                toast.error('Comprobante no encontrado. Intenta descargarlo desde el historial.');
            } else {
                toast.error('No se pudo generar el comprobante PDF. Intenta nuevamente.');
            }
        }
    }, [datos.inscripcion_id]);

    const reiniciar = useCallback(() => {
        setPaso(1);
        setExito(false);
        setDatos(ESTADO_INICIAL);
    }, []);

    return {
        paso, setPaso,
        loading,
        exito,
        datos, setDatos,
        handleConfirmar,
        descargarPDF,
        reiniciar,
    };
}
