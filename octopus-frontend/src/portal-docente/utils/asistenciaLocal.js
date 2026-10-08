/**
 * Persistencia local de la asistencia del portal docente (localStorage).
 * Todo acceso va en try/catch: en modo privado o con el almacenamiento
 * bloqueado simplemente no se guarda nada y la app sigue funcionando.
 *
 * - Borrador: copia de un pase con cambios sin guardar, por sección y fecha,
 *   para recuperarlo si el docente sale sin guardar o se cierra el navegador.
 * - Cola: guardados que fallaron por falta de conexión, a reenviar.
 */
const PREFIJO_BORRADOR = 'docente_asistencia_borrador:';
const VIGENCIA_BORRADOR_MS = 3 * 24 * 60 * 60 * 1000;

export const claveBorrador = (gradoSeccion, fechaStr) => `${PREFIJO_BORRADOR}${gradoSeccion}:${fechaStr}`;

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

const CLAVE_COLA = 'docente_asistencia_cola';
const suscriptores = new Set();
let cacheRaw;
let cacheCola = [];

/** Lectura cacheada (misma referencia mientras no cambie): apta para useSyncExternalStore. */
export function leerCola() {
  let raw = null;
  try { raw = localStorage.getItem(CLAVE_COLA); } catch { /* bloqueado */ }
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    try { cacheCola = raw ? JSON.parse(raw) : []; } catch { cacheCola = []; }
    if (!Array.isArray(cacheCola)) cacheCola = [];
  }
  return cacheCola;
}

function escribirCola(cola) {
  try {
    if (cola.length) localStorage.setItem(CLAVE_COLA, JSON.stringify(cola));
    else localStorage.removeItem(CLAVE_COLA);
  } catch { /* bloqueado */ }
  suscriptores.forEach(fn => fn());
}

const mismoEnvio = (a, gradoSeccion, fecha) => a.gradoSeccion === gradoSeccion && a.fecha === fecha;

export function encolarEnvio({ gradoSeccion, fecha, registros }) {
  const resto = leerCola().filter(e => !mismoEnvio(e, gradoSeccion, fecha));
  escribirCola([...resto, { gradoSeccion, fecha, registros, encoladoEn: Date.now() }]);
}

export function quitarDeCola(gradoSeccion, fecha) {
  escribirCola(leerCola().filter(e => !mismoEnvio(e, gradoSeccion, fecha)));
}

export function suscribirCola(fn) {
  suscriptores.add(fn);
  const onStorage = (e) => { if (e.key === CLAVE_COLA) fn(); };
  window.addEventListener('storage', onStorage);   // otras pestañas
  return () => {
    suscriptores.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
}
