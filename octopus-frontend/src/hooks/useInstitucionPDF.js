import { useEffect, useMemo, useState } from 'react';
import { useConfiguracion } from './useConfiguracion';
import { getLogosInstitucionales } from '../utils/logosInstitucionales';

const NOMBRE_FALLBACK    = 'U.E. COLEGIO LOS HIJOS DE MARÍA AUXILIADORA';
const DIRECCION_FALLBACK = 'Calle el Samán, detrás de la Guardia Nacional en el Municipio Cacique Manaure, Yaracal, Estado Falcón.';
const TELEFONO_FALLBACK  = '0259 938 1347  -  0426 563 1569';
const RIF_FALLBACK       = 'RIF-J-085222910';

/**
 * Devuelve un objeto `institucion` listo para pasar a cualquier generador de PDF
 * de nómina (nominaPDF.js, boletinPdf.js, etc.).
 *
 * Campos:
 *   nombre         — nombre_colegio de la configuración del sistema
 *   direccion      — direccion_colegio + municipio/estado (si están configurados)
 *   telefono       — telefono_colegio
 *   rif            — rif del colegio
 *   logoColegio    — base64 del escudo (subido en Configuración › Logos)
 *   afiliacionNombre — nombre de la afiliación institucional (ej. "AVEC"), vacío si no aplica (solo texto, sin logo propio)
 *   encabezadoPersonalizado — base64 del banner que reemplaza el bloque logo+texto, si el colegio lo configuró
 *   piePaginaPersonalizado — base64 del banner que reemplaza el pie de página de dirección/contacto, si el colegio lo configuró
 *
 * Los fallbacks solo se usan si el colegio no ha completado su ficha en
 * Configuración — evita que un PDF salga con campos vacíos, pero cualquier
 * colegio que complete sus datos ve los suyos, no los de otro colegio.
 */
export function useInstitucionPDF() {
    const { config } = useConfiguracion();
    const [logos, setLogos] = useState({ logoColegio: null, encabezadoPersonalizado: null, piePaginaPersonalizado: null });

    useEffect(() => {
        getLogosInstitucionales().then(setLogos);
    }, []);

    return useMemo(() => {
        const direccionColegio = config?.direccion_colegio?.trim();
        const municipioEstado  = [config?.municipio, config?.estado_colegio].filter(Boolean).join(', ') || null;
        const direccion = direccionColegio
            ? [direccionColegio, municipioEstado].filter(Boolean).join(', ')
            : DIRECCION_FALLBACK;

        return {
            nombre:        config?.nombre_colegio    || NOMBRE_FALLBACK,
            direccion,
            municipioEstado: municipioEstado || 'YARACAL ESTADO FALCÓN',
            telefono:      config?.telefono_colegio  || TELEFONO_FALLBACK,
            rif:           config?.rif               || RIF_FALLBACK,
            logoColegio:   logos.logoColegio,
            afiliacionNombre: config?.afiliacion_nombre || '',
            encabezadoPersonalizado: logos.encabezadoPersonalizado,
            piePaginaPersonalizado: logos.piePaginaPersonalizado,
        };
    }, [config?.nombre_colegio, config?.direccion_colegio, config?.municipio, config?.estado_colegio, config?.telefono_colegio, config?.rif, config?.afiliacion_nombre, logos]);
}
