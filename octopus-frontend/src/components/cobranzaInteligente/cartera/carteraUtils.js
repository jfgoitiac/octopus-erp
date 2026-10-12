import { format, formatDistanceToNowStrict, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { coincideBusqueda } from '../../../utils/busqueda';

/** De menos a más grave; sirve para elegir la etapa que representa a un representante. */
export const ORDEN_ETAPAS = ['preventiva', 'vencida', 'seguimiento', 'prioritaria', 'critica', 'pausada'];

export const OPCIONES_ETAPA = [
    { value: '', label: 'Todas las etapas' },
    { value: 'preventiva', label: 'Preventiva' },
    { value: 'vencida', label: 'Vencida' },
    { value: 'seguimiento', label: 'Seguimiento' },
    { value: 'prioritaria', label: 'Prioritaria' },
    { value: 'critica', label: 'Crítica' },
    { value: 'pausada', label: 'Pausada' },
];

export const FILTROS_INICIALES = { buscar: '', etapa: '', conConvenio: false, conPagoRevision: false };

const numero = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
};

const fechaValida = (valor) => {
    if (!valor) return null;
    const f = typeof valor === 'string' ? parseISO(valor) : new Date(valor);
    return isValid(f) ? f : null;
};

/** Fecha corta en español: "12 oct 2026". */
export const formatearFecha = (valor) => {
    const f = fechaValida(valor);
    return f ? format(f, 'd MMM yyyy', { locale: es }) : '—';
};

/** Relativa en español: "hace 5 minutos". */
export const formatearRelativa = (valor) => {
    const f = fechaValida(valor);
    return f ? formatDistanceToNowStrict(f, { locale: es, addSuffix: true }) : '—';
};

export const formatearUsd = (valor) => `$${numero(valor).toFixed(2)}`;

const masGrave = (etapas) => {
    let mejor = null;
    for (const e of etapas) {
        if (ORDEN_ETAPAS.indexOf(e) > ORDEN_ETAPAS.indexOf(mejor)) mejor = e;
    }
    return mejor;
};

/**
 * `cartera/` devuelve un ciclo por mensualidad; la pestaña muestra un renglón por representante.
 * Junta los ciclos, los convenios vigentes y los pagos en revisión de cada uno.
 * El resultado es compatible con lo que esperan ModalAccion y ModalConvenio
 * (`representante`, `ciclos` = ids, `saldo_total_usd`).
 */
export function agruparCartera(ciclos = [], pagosRevision = [], convenios = []) {
    const porRep = new Map();
    for (const c of ciclos) {
        const rep = c.representante;
        if (!rep?.id) continue;
        if (!porRep.has(rep.id)) porRep.set(rep.id, { representante: rep, detalle: [] });
        porRep.get(rep.id).detalle.push(c);
    }
    const revisionPorRep = new Map();
    for (const p of pagosRevision) {
        const id = p.representante?.id;
        if (id) revisionPorRep.set(id, [...(revisionPorRep.get(id) || []), p]);
    }
    const conveniosPorRep = new Map();
    for (const cv of convenios) {
        if (cv.estado !== 'vigente') continue;
        conveniosPorRep.set(cv.representante, [...(conveniosPorRep.get(cv.representante) || []), cv]);
    }

    return [...porRep.values()].map(({ representante, detalle }) => {
        const saldo = detalle.reduce((s, c) => s + numero(c.saldo_usd), 0);
        const conAccion = detalle.filter(c => c.proxima_accion || c.proxima_accion_fecha)
            .sort((a, b) => String(a.proxima_accion_fecha || '9999').localeCompare(String(b.proxima_accion_fecha || '9999')));
        const contactos = detalle.map(c => c.ultimo_contacto).filter(Boolean).sort();
        return {
            representante,
            ciclos: detalle.map(c => c.id),
            detalle,
            saldo_total_usd: saldo.toFixed(2),
            dias_mora_max: Math.max(0, ...detalle.map(c => c.dias_mora || 0)),
            etapa: masGrave(detalle.map(c => c.estado)),
            alumnos: [...new Set(detalle.map(c => c.alumno?.nombre).filter(Boolean))],
            ultimo_contacto: contactos.length ? contactos[contactos.length - 1] : null,
            proxima_accion: conAccion[0]?.proxima_accion || '',
            proxima_accion_fecha: conAccion[0]?.proxima_accion_fecha || null,
            convenios_vigentes: (conveniosPorRep.get(representante.id) || []).length,
            pagos_revision: (revisionPorRep.get(representante.id) || []).length,
        };
    }).sort((a, b) => b.dias_mora_max - a.dias_mora_max || numero(b.saldo_total_usd) - numero(a.saldo_total_usd));
}

/** Búsqueda tolerante a tildes/mayúsculas por representante, cédula y alumnos. */
export function filtrarCartera(filas, f = FILTROS_INICIALES) {
    return filas.filter(fila => {
        if (f.etapa && !fila.detalle.some(c => c.estado === f.etapa)) return false;
        if (f.conConvenio && fila.convenios_vigentes === 0) return false;
        if (f.conPagoRevision && fila.pagos_revision === 0) return false;
        if (f.buscar.trim()) {
            const texto = [fila.representante.nombre, fila.representante.cedula, ...fila.alumnos].join(' ');
            if (!coincideBusqueda(texto, f.buscar)) return false;
        }
        return true;
    });
}
