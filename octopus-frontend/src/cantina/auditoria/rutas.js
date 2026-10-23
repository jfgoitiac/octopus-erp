// Rutas del módulo Auditoría de Cantina dentro del panel administrativo
// (MainLayout), como un módulo más junto a Finanzas, Académico, etc.
// Exclusivo del Director. Todas las páginas y enlaces del módulo usan estas
// constantes en vez de escribir la ruta a mano.
export const RUTA_AUDITORIA = '/auditoria-cantina';

export const RUTAS_AUDITORIA = {
  panel: `${RUTA_AUDITORIA}/panel`,
  cierres: `${RUTA_AUDITORIA}/cierres`,
  reportes: `${RUTA_AUDITORIA}/reportes`,
  bitacora: `${RUTA_AUDITORIA}/bitacora`,
  alertas: `${RUTA_AUDITORIA}/bitacora?tab=alertas`,
  correcciones: `${RUTA_AUDITORIA}/correcciones`,
};

export const rutaCierre = (id) => `${RUTA_AUDITORIA}/cierres/${id}`;
