// Tablas AVEC / MPPE — lógica financiera pura, sin dependencias de UI
// Modificar solo si cambian los convenios colectivos vigentes.

export const SSO_TOPE               = 26.00;
export const SSO_PCT                = 0.04;
export const SPF_PCT                = 0.005;
export const FAOV_PCT               = 0.01;
export const PRIMA_ASISTENCIAL_FIJA = 17.50;   // 4E — monto fijo
export const PRIMA_HIJO_FIJA        = 12.50;   // 4F — por hijo

export const CATEGORIAS_DOCENTE = ['D-I S/C', 'D-I', 'D-II', 'D-III', 'D-IV', 'D-V', 'D-VI'];

// 4B Prima Docente — % sobre sueldo base por categoría AVEC
export const PRIMA_DOCENTE_PCT = {
    'D-I S/C': 0.00,
    'D-I':     0.025,
    'D-II':    0.04,
    'D-III':   0.055,
    'D-IV':    0.07,
    'D-V':     0.085,
    'D-VI':    0.10,
};

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

// 4A — 1% del sueldo base por año de servicio (tope: 100%)
export function calcPrimaAntiguedad(sueldoBase, anosServicio) {
    return sueldoBase * (Math.min(parseInt(anosServicio) || 0, 100) / 100);
}

export function calcPrimaPostgrado(sueldoBase, titulo) {
    const key = (titulo || '').toUpperCase().trim();
    const pct = POSTGRADO_PCT[key]
        ?? Object.entries(POSTGRADO_PCT).find(([k]) => key.includes(k))?.[1]
        ?? 0;
    return sueldoBase * pct;
}

// Calcula el bloque completo de asignaciones + retenciones AVEC para un docente
// [DEUDA] 4C (primaGeo) se asume igual a 4B — verificar tabla MPPE vigente por zona
export function calcAVEC(sueldoBase, categoria, anosServicio, numeroHijos, titulo) {
    const sb         = parseFloat(sueldoBase) || 0;
    const hijos      = parseInt(numeroHijos)  || 0;
    const primaAnt   = calcPrimaAntiguedad(sb, anosServicio);
    const pctDoc     = PRIMA_DOCENTE_PCT[categoria] ?? 0;
    const primaDoc   = sb * pctDoc;
    const primaGeo   = primaDoc;
    const primaPos   = calcPrimaPostgrado(sb, titulo);
    const primaAsis  = sb > 0 ? PRIMA_ASISTENCIAL_FIJA : 0;
    const primaHijos = hijos * PRIMA_HIJO_FIJA;
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

// Sueldo base docente. Acepta sueldo_mensual (nuevo) o costo_hora (legado).
// sueldo_mensual ÷ horas_sem_referencia = costo_hora → × horas_semanales del empleado
export function calcSueldoBase(config, categoriaDocente, horasSemanales) {
    const catCfg = config.categorias?.[categoriaDocente] || {};
    let costoHora;
    if (parseFloat(catCfg.sueldo_mensual) > 0) {
        const horasRef = parseFloat(config.horas_sem_referencia) || 44;
        costoHora = parseFloat(catCfg.sueldo_mensual) / horasRef;
    } else {
        costoHora = parseFloat(catCfg.costo_hora) || 0;
    }
    return costoHora * (parseFloat(horasSemanales) || 0);
}

// Validación de cédula venezolana (V/E + 6–9 dígitos)
// [DEUDA] Pendiente: validación del dígito verificador con algoritmo módulo 10
export function validarCedula(cedula) {
    return /^[VEve]-?\d{6,9}$/.test((cedula || '').trim());
}

// ── Cesta ticket config (localStorage) ──────────────────────────────────────
// [DEUDA] Sin fecha de expiración — el usuario debe actualizarla manualmente cada período.
// Considerar agregar un campo `fecha_config` y mostrar aviso si tiene más de 30 días.

export const CESTA_LS_KEY = 'nomina_cesta_config';

const buildCategoriasDefault = () =>
    Object.fromEntries(CATEGORIAS_DOCENTE.map(c => [c, { sueldo_mensual: '' }]));

export const CESTA_DEFAULT = {
    categorias:           buildCategoriasDefault(),
    tasa_bcv:             '',
    tarifa_hora:          '0.20',  // USD/hora — para descontar horas de inasistencia del cestaticket
    horas_sem_referencia: '44',    // h/semana de referencia para derivar costo/hora del sueldo mensual
    docente:              { monto_usd: '' },
    apoyo:                { monto_usd: '' },
    administrativo:       { monto_usd: '' },
};


export function loadCestaConfig() {
    try {
        const raw = localStorage.getItem(CESTA_LS_KEY);
        if (!raw) return structuredClone(CESTA_DEFAULT);
        const saved      = JSON.parse(raw);
        const categorias = { ...buildCategoriasDefault(), ...(saved.categorias || {}) };
        return { ...CESTA_DEFAULT, ...saved, categorias };
    } catch { return structuredClone(CESTA_DEFAULT); }
}

export function saveCestaConfig(cfg) {
    localStorage.setItem(CESTA_LS_KEY, JSON.stringify(cfg));
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
