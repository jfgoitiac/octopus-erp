/**
 * Persistencia local de la asistencia del portal docente (localStorage).
 * Todo acceso va en try/catch: en modo privado o con el almacenamiento
 * bloqueado simplemente no se guarda nada y la app sigue funcionando.
 *
 * - Borrador: copia de un pase con cambios sin guardar, por sección y fecha,
 *   para recuperarlo si el docente sale sin guardar o se cierra el navegador.
 * - Cola: guardados que fallaron por falta de conexión, a reenviar.
 */
import { jwtDecode } from 'jwt-decode';
import { tokenStore } from '../../api/tokenStore';

const PREFIJO_RAIZ = 'docente_asistencia:';
const PREFIJO_BORRADOR_LEGACY = 'docente_asistencia_borrador:';
const CLAVE_COLA_LEGACY = 'docente_asistencia_cola';
const VIGENCIA_BORRADOR_MS = 3 * 24 * 60 * 60 * 1000;
const VIGENCIA_COLA_MS = 3 * 24 * 60 * 60 * 1000;

function namespaceActual() {
  try {
    const token = tokenStore.get();
    const claims = token ? jwtDecode(token) : {};
    const usuario = claims.user_id ?? claims.sub ?? claims.username ?? 'anonimo';
    const colegio = claims.colegio_id ?? claims.sede_id ?? 'sin-sede';
    return `${encodeURIComponent(String(usuario))}:${encodeURIComponent(String(colegio))}`;
  } catch {
    return 'anonimo:sin-sede';
  }
}

const prefijoBorrador = () => `${PREFIJO_RAIZ}${namespaceActual()}:borrador:`;
const claveCola = () => `${PREFIJO_RAIZ}${namespaceActual()}:cola`;

export const claveBorrador = (gradoSeccion, fechaStr) => `${prefijoBorrador()}${gradoSeccion}:${fechaStr}`;

/** Solo lo necesario para reconstruir el pase: estado y observación por alumno. */
const resumirRegistros = (registros) =>
  registros.map(({ alumno_id, estado, observacion }) => ({
    alumno_id,
    estado: estado ?? null,
    observacion: observacion || '',
  }));

export function leerBorrador(gradoSeccion, fechaStr) {
  const clave = claveBorrador(gradoSeccion, fechaStr);
  try {
    const raw = localStorage.getItem(clave);
    if (!raw) return null;
    const borrador = JSON.parse(raw);
    if (!Array.isArray(borrador?.registros) || Date.now() - borrador.guardadoEn > VIGENCIA_BORRADOR_MS) {
      localStorage.removeItem(clave);
      return null;
    }
    return borrador;
  } catch {
    return null;
  }
}

export function escribirBorrador(gradoSeccion, fechaStr, registros) {
  try {
    localStorage.setItem(
      claveBorrador(gradoSeccion, fechaStr),
      JSON.stringify({ guardadoEn: Date.now(), registros: resumirRegistros(registros) }),
    );
  } catch { /* almacenamiento lleno o bloqueado: el borrador es una ayuda, no un requisito */ }
}

export function borrarBorrador(gradoSeccion, fechaStr) {
  try { localStorage.removeItem(claveBorrador(gradoSeccion, fechaStr)); } catch { /* idem */ }
}

/** true si el borrador tiene algún estado u observación distinto a lo cargado del servidor. */
export function borradorDifiere(borrador, registros) {
  const actuales = new Map(registros.map(r => [r.alumno_id, r]));
  return borrador.registros.some(b => {
    const r = actuales.get(b.alumno_id);
    return r && ((r.estado ?? null) !== b.estado || (r.observacion || '') !== b.observacion);
  });
}

// ── Cola de envíos pendientes ───────────────────────────────────────────────
// Si guardar falla por falta de conexión, el payload ya listo para el backend
// queda aquí y se reenvía solo al volver la señal (ver colaAsistencia.js).
// Un envío por sección+fecha: el último guardado reemplaza al anterior.

const suscriptores = new Set();
let cacheRaw;
let cacheCola = [];
let cacheClave;

/** Lectura cacheada (misma referencia mientras no cambie): apta para useSyncExternalStore. */
export function leerCola() {
  const clave = claveCola();
  let raw = null;
  try { raw = localStorage.getItem(clave); } catch { /* bloqueado */ }
  if (raw !== cacheRaw || clave !== cacheClave) {
    cacheClave = clave;
    cacheRaw = raw;
    try { cacheCola = raw ? JSON.parse(raw) : []; } catch { cacheCola = []; }
    if (!Array.isArray(cacheCola)) cacheCola = [];
    const ahora = Date.now();
    const vigente = cacheCola.filter(item => ahora - Number(item.encoladoEn || 0) <= VIGENCIA_COLA_MS);
    if (vigente.length !== cacheCola.length) {
      cacheCola = vigente;
      try {
        if (vigente.length) localStorage.setItem(clave, JSON.stringify(vigente));
        else localStorage.removeItem(clave);
      } catch { /* bloqueado */ }
      cacheRaw = vigente.length ? JSON.stringify(vigente) : null;
    }
  }
  return cacheCola;
}

function escribirCola(cola) {
  const clave = claveCola();
  try {
    if (cola.length) localStorage.setItem(clave, JSON.stringify(cola));
    else localStorage.removeItem(clave);
  } catch { /* bloqueado */ }
  cacheClave = clave;
  cacheRaw = cola.length ? JSON.stringify(cola) : null;
  cacheCola = cola;
  suscriptores.forEach(fn => fn());
}

const mismoEnvio = (a, gradoSeccion, fecha, claveScope = gradoSeccion) =>
  (a.claveScope ?? a.gradoSeccion) === claveScope && a.fecha === fecha;

export function encolarEnvio({ gradoSeccion, claveScope = gradoSeccion, fecha, registros, jornada_id = null, version = 0 }) {
  const resto = leerCola().filter(e => !mismoEnvio(e, gradoSeccion, fecha, claveScope));
  escribirCola([...resto, { gradoSeccion, claveScope, fecha, registros, jornada_id, version, encoladoEn: Date.now() }]);
}

export function quitarDeCola(gradoSeccion, fecha, claveScope = gradoSeccion) {
  escribirCola(leerCola().filter(e => !mismoEnvio(e, gradoSeccion, fecha, claveScope)));
}

export function suscribirCola(fn) {
  suscriptores.add(fn);
  const onStorage = (e) => { if (e.key === claveCola()) fn(); };
  window.addEventListener('storage', onStorage);   // otras pestañas
  return () => {
    suscriptores.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
}

/** El logout elimina cualquier dato académico offline del dispositivo. */
export function purgarDatosAsistenciaLocal() {
  try {
    const claves = [];
    for (let i = 0; i < localStorage.length; i += 1) claves.push(localStorage.key(i));
    claves
      .filter(clave => clave && (
        clave.startsWith(PREFIJO_RAIZ)
        || clave.startsWith(PREFIJO_BORRADOR_LEGACY)
        || clave === CLAVE_COLA_LEGACY
      ))
      .forEach(clave => localStorage.removeItem(clave));
  } catch { /* almacenamiento bloqueado */ }
  cacheClave = undefined;
  cacheRaw = undefined;
  cacheCola = [];
  suscriptores.forEach(fn => fn());
}
