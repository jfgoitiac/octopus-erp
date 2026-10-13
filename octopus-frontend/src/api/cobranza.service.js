import apiClient from './apiClient';

export const getDeudaAlumno = (cedula, signal) =>
    apiClient.get(`cobranza/buscar/${cedula}/`, { signal });

export const getCuotaInscripcionAlumno = (alumnoId, signal) =>
    apiClient.get(`cobranza/cuota-inscripcion-alumno/${alumnoId}/`, { signal });

export const getMensualidadesAlumno = (alumnoId, signal) =>
    apiClient.get(`cobranza/mensualidades-alumno/${alumnoId}/`, { signal });

export const exportarMorososExcel = (busqueda, signal) => {
    const params = {};
    if (busqueda?.trim()) params.buscar = busqueda.trim();
    return apiClient.get('cobranza/morosos/exportar-excel/', {
        params,
        responseType: 'blob',
        signal,
    });
};

export const getBancos = (signal) =>
    apiClient.get('cobranza/bancos/', signal ? { signal } : undefined);

/* ── Recibo de cobranza (motor único en el backend) ── */

export const getReciboPdf = (pagoId, signal) =>
    apiClient.get(`cobranza/recibo/${pagoId}/`, { responseType: 'blob', signal });

export const prepararReciboWhatsApp = (pagoId) =>
    apiClient.post(`cobranza/recibo/${pagoId}/whatsapp/`);

export const sincronizarTasa = (signal) =>
    apiClient.post('cobranza/sincronizar-tasa/', {}, signal ? { signal } : undefined);

/* ── Clasificación manual de pagos (desglose contable) ── */

export const getEstadoClasificacionPagos = (params, signal) =>
    apiClient.get('cobranza/pagos/estado-clasificacion/', { params, signal });

export const crearClasificacionPago = (pagoId, payload, signal) =>
    apiClient.post(`cobranza/pagos/${pagoId}/clasificacion/`, payload, { signal });

export const clasificarPagosBatch = (payload, signal) =>
    apiClient.post('cobranza/pagos/clasificacion/batch/', payload, { signal });

export const actualizarClasificacionLinea = (lineaId, payload, signal) =>
    apiClient.patch(`cobranza/pagos/clasificacion/${lineaId}/`, payload, { signal });

export const eliminarClasificacionLinea = (lineaId, signal) =>
    apiClient.delete(`cobranza/pagos/clasificacion/${lineaId}/`, { signal });

export const getDesgloseContable = (params, signal) =>
    apiClient.get('cobranza/pagos/desglose-contable/', { params, signal });

/* ── Corrección de Pagos ── */

export const listarPagos = (params, signal) =>
    apiClient.get('cobranza/pagos/lista/', { params, signal });

export const corregirPago = (pagoId, payload, signal) =>
    apiClient.patch(`cobranza/pagos/${pagoId}/corregir/`, payload, { signal });

export const obtenerElegibilidadMontoPago = (pagoId, signal) =>
    apiClient.get(`cobranza/pagos/${pagoId}/elegibilidad-monto/`, { signal });

export const cargarPagoRetroactivo = (payload, signal) =>
    apiClient.post('cobranza/pagos/retroactivo/', payload, { signal });

export const anularPago = (pagoId, motivo, signal) =>
    apiClient.post(`cobranza/pagos/${pagoId}/anular/`, { motivo }, { signal });

/* ── Módulo de Solvencia (dashboard, reportes por concepto, estado de cuenta) ── */

export const getConceptosCobrables = (signal) =>
    apiClient.get('cobranza/conceptos-cobrables/', { signal });

export const getSolvenciaMensual = (params, signal) =>
    apiClient.get('cobranza/solvencia-mensual/', { params, signal });

export const getResumenPorConcepto = (params, signal) =>
    apiClient.get('cobranza/estado-por-concepto/resumen/', { params, signal });

export const getEstadoPorConcepto = (params, signal) =>
    apiClient.get('cobranza/estado-por-concepto/', { params, signal });

export const exportarEstadoPorConceptoExcel = (params, signal) =>
    apiClient.get('cobranza/estado-por-concepto/exportar-excel/', {
        params,
        responseType: 'blob',
        signal,
    });

export const getEstadoCuentaRepresentante = (representanteId, params, signal) =>
    apiClient.get(`cobranza/representantes/${representanteId}/estado-cuenta/`, { params, signal });

/* ── Cobranza Inteligente (toggle por sede) ── */

export const getCobranzaInteligente = (sedeId, signal) =>
    apiClient.get('cobranza/inteligente/configuracion/', {
        params: sedeId ? { sede: sedeId } : undefined,
        signal,
    });

export const actualizarCobranzaInteligente = (sedeId, datos) =>
    apiClient.patch('cobranza/inteligente/configuracion/', datos, {
        params: sedeId ? { sede: sedeId } : undefined,
    });

/* ── Cobranza Inteligente (gestión y dashboard) ── */

const parametrosSede = (sedeId) => (sedeId ? { sede: sedeId } : undefined);
const BASE_INT = 'cobranza/inteligente';

export const getBandejaInteligente = (sedeId, signal) =>
    apiClient.get(`${BASE_INT}/bandeja/`, { params: parametrosSede(sedeId), signal });

export const accionCicloInteligente = (cicloId, datos) =>
    apiClient.post(`${BASE_INT}/ciclos/${cicloId}/acciones/`, datos);

export const getPagosRevisionInteligente = (sedeId, signal) =>
    apiClient.get(`${BASE_INT}/pagos-revision/`, { params: parametrosSede(sedeId), signal });

export const getConveniosInteligente = (signal) =>
    apiClient.get(`${BASE_INT}/convenios/`, { signal });

export const crearConvenioInteligente = (datos) =>
    apiClient.post(`${BASE_INT}/convenios/`, datos);

export const pagarCuotaConvenio = (cuotaId) =>
    apiClient.post(`${BASE_INT}/convenios/cuotas/${cuotaId}/pagar/`);

export const cancelarConvenioInteligente = (convenioId) =>
    apiClient.post(`${BASE_INT}/convenios/${convenioId}/cancelar/`);

export const getDashboardInteligente = (sedeId, signal) =>
    apiClient.get(`${BASE_INT}/dashboard/`, { params: parametrosSede(sedeId), signal });

export const getLineaBaseInteligente = (sedeId, signal) =>
    apiClient.get(`${BASE_INT}/linea-base/`, { params: parametrosSede(sedeId), signal });

export const guardarLineaBaseInteligente = (sedeId, datos) =>
    apiClient.put(`${BASE_INT}/linea-base/`, datos, { params: parametrosSede(sedeId) });

export const getHistorialCobranzaInteligente = (sedeId, signal) =>
    apiClient.get('cobranza/inteligente/configuracion/historial/', {
        params: sedeId ? { sede: sedeId } : undefined,
        signal,
    });

/* ── Cobranza Inteligente v4: Hoy, contadores, conversaciones (PLAN_COBRANZA_INTELIGENTE_V4 §2.4) ── */

export const getHoyInteligente = (sedeId, signal) =>
    apiClient.get(`${BASE_INT}/hoy/`, { params: parametrosSede(sedeId), signal });

export const marcarTarjetaHecha = (clave, datos) =>
    apiClient.post(`${BASE_INT}/hoy/tarjetas/${encodeURIComponent(clave)}/hecha/`, datos);

export const getContadoresInteligente = (sedeId, signal) =>
    apiClient.get(`${BASE_INT}/contadores/`, { params: parametrosSede(sedeId), signal });

export const getSimulacionMotor = (fecha, sedeId, signal) =>
    apiClient.get(`${BASE_INT}/motor/simulacion/`, { params: { ...parametrosSede(sedeId), fecha }, signal });

export const crearPromesaInteligente = (datos) =>
    apiClient.post(`${BASE_INT}/promesas/`, datos);

// Contrato: docs/CONTRATO_COBRANZA_V4_FASE_B.md.
// `params` admite `desde` (ISO), `filtro`, `q`, `limite` y `sede`; con `desde` solo devuelve lo cambiado.
export const getConversacionesInteligente = (params, signal) =>
    apiClient.get(`${BASE_INT}/conversaciones/`, { params, signal });

export const getConversacionInteligente = (conversacionId, signal) =>
    apiClient.get(`${BASE_INT}/conversaciones/${conversacionId}/`, { signal });

// Devuelve la conversación del representante (la crea vacía si no existe).
export const iniciarConversacionInteligente = (representanteId) =>
    apiClient.post(`${BASE_INT}/conversaciones/iniciar/`, { representante_id: representanteId });

// Sin `desde`: los últimos mensajes; con `desde` (ISO): lo creado o modificado desde entonces.
export const getMensajesConversacion = (conversacionId, desde, signal) =>
    apiClient.get(`${BASE_INT}/conversaciones/${conversacionId}/mensajes/`, {
        params: desde ? { desde } : undefined,
        signal,
    });

// `datos` es { cuerpo } (JSON) o un FormData con `archivo` y `cuerpo` opcional.
export const enviarMensajeConversacion = (conversacionId, datos) =>
    apiClient.post(`${BASE_INT}/conversaciones/${conversacionId}/mensajes/`, datos);

export const getPlantillasConversacion = (signal) =>
    apiClient.get(`${BASE_INT}/conversaciones/plantillas/`, { signal });

// `datos`: { plantilla_id, parametros, idioma?, cuerpo? } o { nombre, idioma, parametros, cuerpo? }.
export const enviarPlantillaConversacion = (conversacionId, datos) =>
    apiClient.post(`${BASE_INT}/conversaciones/${conversacionId}/plantilla/`, datos);

// `datos`: { cuerpo }.
export const crearNotaConversacion = (conversacionId, datos) =>
    apiClient.post(`${BASE_INT}/conversaciones/${conversacionId}/nota/`, datos);

export const tomarConversacion = (conversacionId) =>
    apiClient.post(`${BASE_INT}/conversaciones/${conversacionId}/tomar/`);

export const devolverConversacion = (conversacionId) =>
    apiClient.post(`${BASE_INT}/conversaciones/${conversacionId}/devolver/`);

// `datos`: { representante_id }.
export const vincularConversacion = (conversacionId, datos) =>
    apiClient.post(`${BASE_INT}/conversaciones/${conversacionId}/vincular/`, datos);

export const marcarConversacionLeida = (conversacionId) =>
    apiClient.post(`${BASE_INT}/conversaciones/${conversacionId}/leida/`);

// Descarga autenticada de un adjunto: devuelve un Blob (no sirve como `src` directo).
export const descargarArchivoMensaje = (mensajeId, signal) =>
    apiClient.get(`${BASE_INT}/mensajes/${mensajeId}/archivo/`, { responseType: 'blob', signal });

// Respuestas rápidas con las variables de la conversación ya resueltas (`cuerpo_renderizado`).
export const getRespuestasRapidasConversacion = (conversacionId, signal) =>
    apiClient.get(`${BASE_INT}/respuestas-rapidas/`, { params: { conversacion: conversacionId }, signal });

// Búsqueda de representantes (por nombre o cédula) para vincular una conversación.
export const buscarRepresentantesVincular = (texto, signal) =>
    apiClient.get('secretaria/representantes/', { params: { buscar: texto, page_size: 8 }, signal });

export const getRespuestasRapidas = (signal) =>
    apiClient.get(`${BASE_INT}/respuestas-rapidas/`, { signal });

export const crearRespuestaRapida = (datos) =>
    apiClient.post(`${BASE_INT}/respuestas-rapidas/`, datos);

export const actualizarRespuestaRapida = (id, datos) =>
    apiClient.patch(`${BASE_INT}/respuestas-rapidas/${id}/`, datos);

// Comprobantes recibidos por WhatsApp. Contrato: docs/CONTRATO_COBRANZA_V4_FASE_C.md.
// Mensualidades impagas del representante vinculado (selector del modal de conversión).
export const getMensualidadesPendientes = (conversacionId, signal) =>
    apiClient.get(`${BASE_INT}/conversaciones/${conversacionId}/mensualidades-pendientes/`, { signal });

// `datos`: { mensualidades: [ids], referencia_bancaria?, metodo_pago?, banco_receptor_id? }.
// 201 { mensaje, comprobantes, conversacion }.
export const convertirAdjuntoComprobante = (mensajeId, datos) =>
    apiClient.post(`${BASE_INT}/adjuntos/${mensajeId}/convertir-comprobante/`, datos);

// `datos`: { motivo } (obligatorio, máx. 300). 200 { mensaje }.
export const descartarAdjunto = (mensajeId, datos) =>
    apiClient.post(`${BASE_INT}/adjuntos/${mensajeId}/descartar/`, datos);

export const eliminarRespuestaRapida = (id) =>
    apiClient.delete(`${BASE_INT}/respuestas-rapidas/${id}/`);

// Reglas del motor (línea de tiempo −5…+30). `todas=1` incluye las inactivas.
// Contrato: docs/CONTRATO_COBRANZA_V4_FASE_D.md. Si responde 404/405 (backend viejo), la
// pestaña Automatizaciones degrada a solo lectura con las reglas por defecto.
export const getReglasCobranza = (sedeId, signal) =>
    apiClient.get(`${BASE_INT}/reglas/`, { params: { ...parametrosSede(sedeId), todas: 1 }, signal });

export const crearReglaCobranza = (datos, sedeId) =>
    apiClient.post(`${BASE_INT}/reglas/`, datos, { params: parametrosSede(sedeId) });

export const actualizarReglaCobranza = (id, datos) =>
    apiClient.patch(`${BASE_INT}/reglas/${id}/`, datos);

// Fase D: proyección de caja de la semana de `fecha` (AAAA-MM-DD) y reporte A/B (7 días).
export const getProyeccionCaja = (fecha, sedeId, signal) =>
    apiClient.get(`${BASE_INT}/proyeccion-caja/`, { params: { ...parametrosSede(sedeId), ...(fecha ? { fecha } : {}) }, signal });

// `params`: { desde, hasta, regla } opcionales (AAAA-MM-DD).
export const getReporteAB = (params, sedeId, signal) =>
    apiClient.get(`${BASE_INT}/ab/reporte/`, { params: { ...parametrosSede(sedeId), ...params }, signal });
