import { useMemo } from 'react';
import { useConfiguracion } from './useConfiguracion';
import { useLogosRecibo } from './useLogosRecibo';

const NOMBRE_FALLBACK = 'U.E. COLEGIO LOS HIJOS DE MARÍA AUXILIADORA';

/**
 * Devuelve un objeto `institucion` listo para pasar a cualquier generador de PDF
 * de nómina (nominaPDF.js, boletinPdf.js, etc.).
 *
 * Campos:
 *   nombre      — nombre_colegio de la configuración del sistema
 *   logoColegio — base64 del escudo (subido en Configuración › Logos)
 *   logoAvec    — base64 del logo AVEC (subido en Configuración › Logos)
 */
export function useInstitucionPDF() {
    const { config } = useConfiguracion();
    const { logosRecibo } = useLogosRecibo();

    return useMemo(() => ({
        nombre:      config?.nombre_colegio || NOMBRE_FALLBACK,
        logoColegio: logosRecibo?.logoColegio || null,
        logoAvec:    logosRecibo?.logoAvec    || null,
    }), [config?.nombre_colegio, logosRecibo?.logoColegio, logosRecibo?.logoAvec]);
}
