import { useEffect, useMemo, useState } from 'react';
import { useConfiguracion } from './useConfiguracion';
import { getLogosInstitucionales } from '../utils/logosInstitucionales';

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
    const [logos, setLogos] = useState({ logoColegio: null, logoAvec: null });

    useEffect(() => {
        getLogosInstitucionales().then(setLogos);
    }, []);

    return useMemo(() => ({
        nombre:      config?.nombre_colegio || NOMBRE_FALLBACK,
        logoColegio: logos.logoColegio,
        logoAvec:    logos.logoAvec,
    }), [config?.nombre_colegio, logos]);
}
