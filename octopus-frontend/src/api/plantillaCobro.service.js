// Plantilla de cobro (PDF) de las cuentas por cobrar de cantina/librería.
// Archivo propio: no se mezcla con cantina.service.js.
import cantinaApiClient from '../cantina/api/cantinaApiClient';

/**
 * PDF (blob) del estado de cuenta a cobrar en bolívares a la tasa vigente.
 * `titular` = { tipo, id }; `filtros` = { area, fechaInicio, fechaFin } (todos opcionales).
 */
export const plantillaCobroPdf = (titular, filtros = {}, signal) => {
  const params = {
    [titular.tipo === 'representante' ? 'representante' : 'cliente']: titular.id,
    area: filtros.area || undefined,
    fecha_inicio: filtros.fechaInicio || undefined,
    fecha_fin: filtros.fechaFin || undefined,
  };
  return cantinaApiClient.get('cxc/plantilla-cobro/', { params, signal, responseType: 'blob' });
};

/**
 * Envía la plantilla de cobro (PDF) por WhatsApp al titular.
 * `telefono` es opcional: sin él, el backend usa el del titular.
 */
export const plantillaCobroWhatsApp = (titular, filtros = {}, telefono = '') => cantinaApiClient.post('cxc/plantilla-cobro/whatsapp/', {
  [titular.tipo === 'representante' ? 'representante' : 'cliente']: titular.id,
  area: filtros.area || undefined,
  fecha_inicio: filtros.fechaInicio || undefined,
  fecha_fin: filtros.fechaFin || undefined,
  telefono: telefono.trim() || undefined,
});
