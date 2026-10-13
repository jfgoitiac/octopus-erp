export const iniciales = (nombre = '') =>
  nombre.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || '?';
