// Motor genérico de nómina docente venezolana — lógica financiera pura, sin
// dependencias de UI. Capa 1 (universal, cualquier colegio venezolano) + Capa
// 3 (deducciones legales VE). La Capa 2 (convenio AVEC) vive en
// constants/convenios/avec_ve.js y se aplica solo cuando corresponde — ver
// calcAVEC(..., convenioNomina).
// Modificar solo si cambian los porcentajes/montos legales o de convenio vigentes.

import axiosInstance from '../api/apiClient';
import * as avecVe from './convenios/avec_ve';

export const SSO_TOPE               = 26.00;
// Compatibilidad con el flujo legacy de Pagos. Nómina nueva usa el backend.
export const SSO_PCT                = 0.04;
export const SPF_PCT                = 0.005;
export const FAOV_PCT               = 0.01;
export const PRIMA_ASISTENCIAL_FIJA = 17.50;   // 4E — monto fijo
export const PRIMA_HIJO_FIJA        = 12.50;   // 4F — por hijo

// Re-exportados desde el plugin AVEC para no romper a los importadores actuales
// (EmpleadoForm.jsx, Pagos.jsx). Solo tienen sentido cuando convenio_nomina='avec_ve'.
export const CATEGORIAS_DOCENTE = avecVe.CATEGORIAS_DOCENTE;
export const calcSueldoBase     = avecVe.calcSueldoBase;

// 4D Postgrado / Complemento Académico — % sobre sueldo base por título
export const POSTGRADO_PCT = {
    'DR':   0.40,
    'PHD':  0.40,
    'MSC':  0.35,
    'ESP':  0.30,
    'LEM':  0.30,   // Licenciado en Educación Mención (conv. AVEC)
    'LIC':  0.25,
    'PROF': 0.20,
    'TSU':  0.10,
    'BACH': 0.00,
    'NONE': 0.00,
};

// 4A — % del sueldo base por año de servicio (tope: 100%). 1% por defecto,
// configurable por colegio vía ConceptoNomina (codigo='ANTIGUEDAD_PCT_ANIO').
export function calcPrimaAntiguedad(sueldoBase, anosServicio, pctPorAnio = 0.01) {
    return sueldoBase * Math.min((parseInt(anosServicio) || 0) * pctPorAnio, 1);
}

export function calcPrimaPostgrado(sueldoBase, titulo) {
    const key = (titulo || '').toUpperCase().trim();
    const pct = POSTGRADO_PCT[key]
        ?? Object.entries(POSTGRADO_PCT).find(([k]) => key.includes(k))?.[1]
        ?? 0;
    return sueldoBase * pct;
}

// Calcula el bloque completo de asignaciones + retenciones para un docente.
// convenioNomina='avec_ve' (default, compatibilidad con el comportamiento actual)
// agrega la prima docente/geográfica del convenio AVEC (constants/convenios/avec_ve.js).
// convenioNomina='generico' solo aplica las asignaciones universales (Capa 1).
// conceptosUniversales={} (default, compatibilidad): objeto opcional con las
// tasas/montos configurados por el colegio vía ConceptoNomina (ver
// loadConceptosUniversales), keyeado por `codigo`. Si un código no está
// presente, se usa la constante hardcodeada de siempre.
export function calcAVEC(sueldoBase, categoria, anosServicio, numeroHijos, titulo, convenioNomina = 'avec_ve', conceptosUniversales = {}) {
    const sb         = parseFloat(sueldoBase) || 0;
    const hijos      = parseInt(numeroHijos)  || 0;
    const pctAntiguedad = parseFloat(conceptosUniversales.ANTIGUEDAD_PCT_ANIO?.porcentaje) || 0.01;
    const primaAnt   = calcPrimaAntiguedad(sb, anosServicio, pctAntiguedad);
    const { primaDoc, primaGeo } = convenioNomina === 'avec_ve'
        ? avecVe.calcPrimaDocente(sb, categoria)
        : { primaDoc: 0, primaGeo: 0 };
    const primaPos   = calcPrimaPostgrado(sb, titulo);
    const montoAsistencial = parseFloat(conceptosUniversales.ASISTENCIAL_FIJO?.monto) || PRIMA_ASISTENCIAL_FIJA;
    const montoHijo         = parseFloat(conceptosUniversales.HIJO_FIJO?.monto) || PRIMA_HIJO_FIJA;
    const primaAsis  = sb > 0 ? montoAsistencial : 0;
    const primaHijos = hijos * montoHijo;
    const otrasAsig  = primaAnt + primaDoc + primaGeo + primaPos + primaAsis + primaHijos;
    const totalAsig  = sb + otrasAsig;
    const sso        = Math.min(totalAsig * SSO_PCT, SSO_TOPE);
    const spf        = totalAsig * SPF_PCT;
    const faov       = totalAsig * FAOV_PCT;
    const totalRet   = sso + spf + faov;
    const neto       = totalAsig - totalRet;
    const quincena   = neto / 2;
    return { primaAnt, primaDoc, primaGeo, primaPos, primaAsis, primaHijos,
             otrasAsig, totalAsig, sso, spf, faov, totalRet, neto, quincena };
}

// Validación de cédula venezolana (V/E + 6–9 dígitos)
// [DEUDA] Pendiente: validación del dígito verificador con algoritmo módulo 10
export function validarCedula(cedula) {
    return /^[VEve]-?\d{6,9}$/.test((cedula || '').trim());
}

// ── Cesta ticket config (backend, GET/PUT cobranza/config-nomina/) ──────────
// Antes vivía solo en localStorage del navegador: cada administrador veía una
// configuración distinta según desde qué equipo la hubiera cargado. Ahora se
// persiste centralizada en el backend (ParametroGlobal, clave NOMINA_CONFIG_JSON),
// el mismo almacén que ya usa Pagos.jsx.
// [DEUDA] Sin fecha de expiración — el usuario debe actualizarla manualmente cada período.
// Considerar agregar un campo `fecha_config` y mostrar aviso si tiene más de 30 días.

export const CESTA_DEFAULT = {
    categorias:           avecVe.buildCategoriasDefault(),
    tasa_bcv:             '',
    tarifa_hora:          '0.20',  // USD/hora — para descontar horas de inasistencia del cestaticket
    horas_sem_referencia: '44',    // h/semana de referencia para derivar costo/hora del sueldo mensual
    docente:              { monto_usd: '' },
    apoyo:                { monto_usd: '' },
    administrativo:       { monto_usd: '' },
};

export async function loadCestaConfig() {
    try {
        const { data } = await axiosInstance.get('cobranza/config-nomina/');
        if (data && Object.keys(data).length > 0) {
            const categorias = { ...avecVe.buildCategoriasDefault(), ...(data.categorias || {}) };
            return { ...CESTA_DEFAULT, ...data, categorias };
        }
    } catch { /* sin configuración guardada aún o error de red — usar default */ }
    return structuredClone(CESTA_DEFAULT);
}

export async function saveCestaConfig(cfg) {
    await axiosInstance.put('cobranza/config-nomina/', cfg);
}

// ── Conceptos universales configurables (backend, ConceptoNomina) ──────────
// Trae los conceptos activos y universales (convenio='') y arma el lookup
// por `codigo` que consume calcAVEC(..., conceptosUniversales). Si un colegio
// no configuró ninguno, devuelve {} y calcAVEC usa sus constantes de siempre.
export async function loadConceptosUniversales() {
    try {
        const { data } = await axiosInstance.get('nomina/conceptos/', {
            params: { activo: 1, convenio: '' },
        });
        const lista = Array.isArray(data) ? data : (data?.results || []);
        return Object.fromEntries(
            lista.filter(c => c.codigo).map(c => [c.codigo, c])
        );
    } catch {
        return {}; // sin configuración guardada aún o error de red — usar defaults
    }
}

// ── Valores iniciales de formularios ────────────────────────────────────────
export const EMPTY_RECIBO = {
    mes:                '',
    horas_inasistencia: '0',
    cesta_monto_usd:    '',
    cesta_tasa:         '',
    sueldo_base_simple: '',
    otras_deducciones:  '',
};

export const EMPTY_EMP = {
    nombre: '', apellido: '', cedula: '', cargo: '',
    tipo_personal:     'docente',
    fecha_ingreso:     '', titulo: '', categoria_docente: '',
    anos_servicio:     '', numero_hijos: '0', nivel: '',
    horas_semanales:   '',
    sueldo_base:       '',
    banco: '', numero_cuenta: '', tipo_cuenta: '', telefono: '', correo: '',
};
