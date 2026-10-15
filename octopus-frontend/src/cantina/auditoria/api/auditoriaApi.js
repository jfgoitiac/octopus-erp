// Cliente de la Auditoría de Cantina (exclusiva del Director).
// Una función por endpoint de CONTRATO_AUDITORIA_CANTINA.md, bajo
// /api/cantina/auditoria/. Todas devuelven la respuesta de axios ({ data }),
// igual que src/api/cantina.service.js.
//
// Con VITE_AUDITORIA_MOCK=true responden con los fixtures de ./mocks.js
// (mismas formas del contrato) para que las páginas se construyan antes de
// que exista el backend real.
import cantinaApiClient from '../../api/cantinaApiClient';
import * as mocks from './mocks';

const USAR_MOCKS = import.meta.env.VITE_AUDITORIA_MOCK === 'true';
const BASE = 'auditoria/';

const mock = (data) =>
  new Promise((resolve) => setTimeout(() => resolve({ data: structuredClone(data) }), 350));

/* ── §2 Panel ejecutivo ── */

export const getPanel = (params, signal) =>
  USAR_MOCKS ? mock(mocks.panel) : cantinaApiClient.get(`${BASE}panel/`, { params, signal });

/* ── §3 Cierres diarios ── */

export const getCierres = (params, signal) =>
  USAR_MOCKS ? mock(mocks.cierres) : cantinaApiClient.get(`${BASE}cierres/`, { params, signal });

export const getCierre = (id, signal) =>
  USAR_MOCKS ? mock(mocks.cierreDetalle) : cantinaApiClient.get(`${BASE}cierres/${id}/`, { signal });

// payload: { estado: 'revisado'|'aprobado'|'observado', comentario }
export const revisarCierre = (id, payload) =>
  USAR_MOCKS
    ? mock({
        ...mocks.cierreDetalle,
        estado_revision: payload.estado,
        revision: {
          ...mocks.cierreDetalle.revision,
          estado: payload.estado,
          comentario_director: payload.comentario ?? '',
          transiciones_permitidas: payload.estado === 'aprobado' ? [] : ['aprobado'],
        },
      })
    : cantinaApiClient.post(`${BASE}cierres/${id}/revision/`, payload);

// archivo: File (imagen o PDF ≤ 5 MB); extra: { descripcion, reemplaza_a }
export const subirAdjuntoCierre = (id, archivo, extra = {}) => {
  if (USAR_MOCKS) return mock(mocks.cierreDetalle.adjuntos[0]);
  const form = new FormData();
  form.append('archivo', archivo);
  if (extra.descripcion) form.append('descripcion', extra.descripcion);
  if (extra.reemplaza_a) form.append('reemplaza_a', extra.reemplaza_a);
  return cantinaApiClient.post(`${BASE}cierres/${id}/adjuntos/`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const getHistorialCierre = (id, signal) =>
  USAR_MOCKS ? mock(mocks.bitacora.results) : cantinaApiClient.get(`${BASE}cierres/${id}/historial/`, { signal });

// payload: { motivo } — director o administrador (D4)
export const reabrirCaja = (id, payload) =>
  USAR_MOCKS
    ? mock({ reapertura_id: 1, apertura_nueva_id: 52 })
    : cantinaApiClient.post(`${BASE}cierres/${id}/reabrir/`, payload);

/* ── §4 Reportes ── */

// params.agrupar: 'producto' | 'categoria' | 'turno' | 'responsable' | 'dia'
export const getReporteVentas = (params, signal) =>
  USAR_MOCKS ? mock(mocks.reporteVentas) : cantinaApiClient.get(`${BASE}reportes/ventas/`, { params, signal });

// params.tipo: 'anulaciones' | 'descuentos' | 'manuales'
export const getReporteExcepciones = (params, signal) =>
  USAR_MOCKS ? mock(mocks.reporteExcepciones) : cantinaApiClient.get(`${BASE}reportes/excepciones/`, { params, signal });

// params.tipo: 'entrada' | 'salida' | 'ajuste' | 'merma'
export const getReporteInventario = (params, signal) =>
  USAR_MOCKS ? mock(mocks.reporteInventario) : cantinaApiClient.get(`${BASE}reportes/inventario/`, { params, signal });

// params.agrupar: 'producto' | 'categoria'
export const getReporteRentabilidad = (params, signal) =>
  USAR_MOCKS ? mock(mocks.reporteRentabilidad) : cantinaApiClient.get(`${BASE}reportes/rentabilidad/`, { params, signal });

/* ── §5 Bitácora ── */

export const getBitacora = (params, signal) =>
  USAR_MOCKS ? mock(mocks.bitacora) : cantinaApiClient.get(`${BASE}bitacora/`, { params, signal });

export const verificarBitacora = (signal) =>
  USAR_MOCKS ? mock(mocks.verificacionBitacora) : cantinaApiClient.get(`${BASE}bitacora/verificar/`, { signal });

/* ── §6 Alertas ── */

export const getAlertas = (params, signal) =>
  USAR_MOCKS ? mock(mocks.alertas) : cantinaApiClient.get(`${BASE}alertas/`, { params, signal });

export const getResumenAlertas = (signal) =>
  USAR_MOCKS ? mock(mocks.resumenAlertas) : cantinaApiClient.get(`${BASE}alertas/resumen/`, { signal });

// payload: { nota }
export const atenderAlerta = (id, payload) =>
  USAR_MOCKS
    ? mock({ ...mocks.alertas.results[0], estado: 'atendida', nota_atencion: payload.nota })
    : cantinaApiClient.post(`${BASE}alertas/${id}/atender/`, payload);

/* ── §7 Parámetros ── */

export const getParametrosAuditoria = (signal) =>
  USAR_MOCKS ? mock(mocks.parametros) : cantinaApiClient.get(`${BASE}parametros/`, { signal });

export const actualizarParametrosAuditoria = (payload) =>
  USAR_MOCKS ? mock({ ...mocks.parametros, ...payload }) : cantinaApiClient.put(`${BASE}parametros/`, payload);
