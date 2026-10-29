// Lógica pura de la conciliación masiva: filtros por fecha, resumen, selección,
// armado de ítems y lotes. Sin React ni red para poder probarla aislada.

export const TAMANO_LOTE = 200;
export const DIGITOS_MIN = 4;
export const DIGITOS_MAX = 8;

// El parser entrega fechas dd/MM/yyyy; la API espera ISO (yyyy-MM-dd).
export const fechaBancoAISO = (fecha) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(fecha || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : fecha;
};

const esISO = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f || '');

/** Transacciones cuya fecha cae en [desde, hasta] (ISO, ambos opcionales). */
export const filtrarPorFechas = (transactions, desde, hasta) => {
  if (!desde && !hasta) return transactions;
  return transactions.filter((tx) => {
    const f = fechaBancoAISO(tx.fecha);
    if (!esISO(f)) return true; // sin fecha interpretable: no se descarta en silencio
    if (desde && f < desde) return false;
    if (hasta && f > hasta) return false;
    return true;
  });
};

/** Fecha mínima y máxima (ISO) de las transacciones; '' si no hay fechas válidas. */
export const rangoFechas = (transactions) => {
  let min = '';
  let max = '';
  for (const tx of transactions) {
    const f = fechaBancoAISO(tx.fecha);
    if (!esISO(f)) continue;
    if (!min || f < min) min = f;
    if (!max || f > max) max = f;
  }
  return { desde: min, hasta: max };
};

// `requiere_caja`: comprobante del portal que coincide con una línea libre;
// no se concilia, se procesa en caja (no es seleccionable).
export const ESTADOS = ['exacta', 'dentro_tolerancia', 'fuera_tolerancia', 'ambigua', 'requiere_caja', 'sin_banco'];

const ORDEN_ESTADO = Object.fromEntries(ESTADOS.map((e, i) => [e, i]));

/** Orden estable: por estado y luego por fecha del sistema. */
export const ordenarPropuestas = (propuestas) =>
  [...propuestas].sort((a, b) => {
    const d = (ORDEN_ESTADO[a.estado] ?? 99) - (ORDEN_ESTADO[b.estado] ?? 99);
    if (d !== 0) return d;
    return String(a.fecha || '').localeCompare(String(b.fecha || ''));
  });

export const filtrarPorEstado = (propuestas, estado) =>
  !estado || estado === 'todas' ? propuestas : propuestas.filter((p) => p.estado === estado);

/** Contadores por estado calculados en el cliente (respaldo del resumen del API). */
export const contarPorEstado = (propuestas) => {
  const r = { total: propuestas.length, exactas: 0, dentro_tolerancia: 0, fuera_tolerancia: 0, ambiguas: 0, requiere_caja: 0, sin_banco: 0 };
  for (const p of propuestas) {
    if (p.estado === 'exacta') r.exactas += 1;
    else if (p.estado === 'dentro_tolerancia') r.dentro_tolerancia += 1;
    else if (p.estado === 'fuera_tolerancia') r.fuera_tolerancia += 1;
    else if (p.estado === 'ambigua') r.ambiguas += 1;
    else if (p.estado === 'requiere_caja') r.requiere_caja += 1;
    else if (p.estado === 'sin_banco') r.sin_banco += 1;
  }
  return r;
};

const redondear = (n) => Math.round(n * 100) / 100;

/** Diferencia con signo: banco − sistema. */
export const calcularDiferencia = (montoBanco, montoSistema) =>
  redondear(Number(montoBanco) - Number(montoSistema));

export const claveTransaccion = (t) => `${t.referencia}|${t.fecha}|${t.monto}`;

/**
 * Vista efectiva de una propuesta: en las ambiguas resuelve la candidata
 * elegida (clave de `claveTransaccion`) y recalcula diferencia y estado.
 */
export const propuestaEfectiva = (p, elecciones = {}, tolerancia = 0) => {
  if (p.estado !== 'ambigua') {
    const dif = p.diferencia_ves === null || p.diferencia_ves === undefined || p.diferencia_ves === ''
      ? null : Number(p.diferencia_ves);
    return { ...p, transaccionEfectiva: p.transaccion || null, difEfectiva: dif, fueraEfectiva: p.estado === 'fuera_tolerancia' };
  }
  const clave = elecciones[p.id];
  const tx = (p.candidatas || []).find((c) => claveTransaccion(c) === clave) || null;
  if (!tx) return { ...p, transaccionEfectiva: null, difEfectiva: null, fueraEfectiva: false };
  const dif = calcularDiferencia(tx.monto, p.monto_sistema_ves);
  return { ...p, transaccionEfectiva: tx, difEfectiva: dif, fueraEfectiva: Math.abs(dif) > tolerancia };
};

/**
 * Clave del pago conjunto de una fila efectiva (null si va sola):
 *  - 'g:' grupo propuesto por el servidor (varias operaciones del mismo
 *    representante cubiertas por una sola transferencia); su diferencia ya
 *    viene calculada sobre el conjunto.
 *  - 'a:' ambiguas a las que el operador les eligió la MISMA línea del banco.
 */
export const claveConjunto = (e) => {
  if (e.grupo?.clave) return `g:${e.grupo.clave}`;
  if (e.estado === 'ambigua' && e.transaccionEfectiva) return `a:${claveTransaccion(e.transaccionEfectiva)}`;
  return null;
};

/**
 * Anota los miembros de cada pago conjunto (`conjuntoIds`, `montoConjunto`) y,
 * para los armados por el operador, recalcula la diferencia sobre la suma:
 * el servidor también la evalúa así al confirmar.
 */
export const aplicarConjuntos = (efectivas, tolerancia = 0) => {
  const miembros = {};
  efectivas.forEach((e) => {
    const k = claveConjunto(e);
    if (k) (miembros[k] ||= []).push(e);
  });
  return efectivas.map((e) => {
    const k = claveConjunto(e);
    if (!k) return e;
    const filas = miembros[k];
    const conjuntoIds = filas.map((m) => m.id);
    if (e.grupo) return { ...e, conjuntoIds, montoConjunto: Number(e.grupo.monto_sistema_ves) };
    if (filas.length < 2) return e;
    const suma = redondear(filas.reduce((acc, m) => acc + Number(m.monto_sistema_ves), 0));
    const dif = calcularDiferencia(e.transaccionEfectiva.monto, suma);
    return { ...e, conjuntoIds, montoConjunto: suma, difEfectiva: dif, fueraEfectiva: Math.abs(dif) > tolerancia };
  });
};

/** Ids que se marcan/desmarcan juntos con la fila (los del grupo del servidor). */
export const idsAlternables = (efectiva) =>
  efectiva?.grupo && efectiva.conjuntoIds ? efectiva.conjuntoIds : [efectiva?.id];

/** Una propuesta es seleccionable si es confirmable y tiene una transacción de banco asignada. */
export const esSeleccionable = (efectiva) =>
  efectiva.confirmable !== false && efectiva.estado !== 'sin_banco' && Boolean(efectiva.transaccionEfectiva);

/** Selección inicial: las marcadas por el servidor. */
export const seleccionInicial = (propuestas) =>
  Object.fromEntries(propuestas.filter((p) => p.seleccionada_por_defecto && p.estado !== 'ambigua').map((p) => [p.id, true]));

/** Una fila fuera de tolerancia sin observación no puede incluirse. En un pago
 * conjunto basta con la observación de cualquiera de sus filas. */
export const faltaObservacion = (efectiva, observaciones = {}) =>
  efectiva.fueraEfectiva
  && !(efectiva.conjuntoIds || [efectiva.id]).some((id) => String(observaciones[id] || '').trim());

/** Vista efectiva de todas las propuestas, con los pagos conjuntos resueltos. */
export const efectivasDe = (propuestas, elecciones = {}, tolerancia = 0) =>
  aplicarConjuntos(propuestas.map((p) => propuestaEfectiva(p, elecciones, tolerancia)), tolerancia);

/**
 * Propuestas marcadas y válidas para enviar (seleccionables y con observación
 * si la exigen). Los miembros de un pago conjunto quedan contiguos para que
 * `dividirEnLotes` no los separe.
 */
export const propuestasAEnviar = (propuestas, { seleccion, elecciones, observaciones, tolerancia }) => {
  const validas = efectivasDe(propuestas, elecciones, tolerancia)
    .filter((e) => seleccion[e.id] && esSeleccionable(e) && !faltaObservacion(e, observaciones));
  const orden = [];
  const posicion = {};
  validas.forEach((e) => {
    const k = claveConjunto(e) || `id:${e.id}`;
    if (!(k in posicion)) {
      posicion[k] = orden.length;
      orden.push([]);
    }
    orden[posicion[k]].push(e);
  });
  return orden.flat();
};

export const construirItems = (efectivas, observaciones = {}) =>
  efectivas.map((e) => {
    const t = e.transaccionEfectiva;
    const item = {
      transaccion: { referencia: t.referencia, fecha: fechaBancoAISO(t.fecha), monto: t.monto },
      observacion: String(observaciones[e.id] || '').trim(),
    };
    item.operacion_uuid = e.operacion_uuid;
    return item;
  });

export const resumenConfirmacion = (efectivas) => ({
  operaciones: efectivas.length,
  fueraTolerancia: efectivas.filter((e) => e.fueraEfectiva).length,
});

const claveLineaItem = (item) =>
  item?.transaccion ? `${item.transaccion.referencia}|${item.transaccion.fecha}` : null;

/**
 * Divide en lotes de hasta `tamano` ítems sin separar los ítems contiguos que
 * comparten la misma línea del banco (un pago conjunto se concilia junto).
 */
export const dividirEnLotes = (items, tamano = TAMANO_LOTE) => {
  const lotes = [];
  let actual = [];
  let i = 0;
  while (i < items.length) {
    const k = claveLineaItem(items[i]);
    let fin = i + 1;
    while (k && fin < items.length && claveLineaItem(items[fin]) === k) fin += 1;
    const tramo = items.slice(i, fin);
    if (actual.length > 0 && actual.length + tramo.length > tamano) {
      lotes.push(actual);
      actual = [];
    }
    actual.push(...tramo);
    i = fin;
  }
  if (actual.length > 0) lotes.push(actual);
  return lotes;
};

/**
 * Une las respuestas de cada lote re-indexando al arreglo completo de ítems.
 * `tamanos`: tamaño de cada lote enviado (o un tamaño fijo, por compatibilidad).
 */
export const agregarResultados = (respuestas, tamanos = TAMANO_LOTE) => {
  const conciliadas = [];
  const errores = [];
  let lote = null;
  let base = 0;
  respuestas.forEach((r, n) => {
    if (n > 0) base += Array.isArray(tamanos) ? tamanos[n - 1] : tamanos;
    (r?.conciliadas || []).forEach((c) => conciliadas.push({ ...c, indice: base + c.indice }));
    (r?.errores || []).forEach((e) => errores.push({ ...e, indice: base + e.indice }));
    if (r?.lote) lote = r.lote;
  });
  return { conciliadas, errores, lote };
};
