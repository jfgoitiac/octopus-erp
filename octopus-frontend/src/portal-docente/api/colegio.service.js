import docenteApiClient from './docenteApiClient';

// Configuración visual pública del colegio (nombre, colores, logo) — mismo
// endpoint público que ya usa el portal de representantes
// (src/portal/api/portal.service.js::getConfigColegio), sin auth requerida.
export const getConfigColegio = (signal) =>
  docenteApiClient.get('portal/config-colegio/', signal ? { signal } : undefined);
