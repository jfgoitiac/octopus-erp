import { useState, useCallback, useMemo, useRef } from 'react';
import { toast } from 'react-toastify';
import apiClient from '../api/apiClient';
import {
  TOLERANCIA_KEY, TOLERANCIA_DEFECTO, leerToleranciaSesion, guardarToleranciaSesion, msgError,
} from './useConciliacionSemiauto';
import {
  rangoFechas, filtrarPorFechas, fechaBancoAISO, ordenarPropuestas, filtrarPorEstado,
  contarPorEstado, propuestaEfectiva, esSeleccionable, faltaObservacion, seleccionInicial,
  propuestasAEnviar, construirItems, resumenConfirmacion, dividirEnLotes, agregarResultados,
  DIGITOS_MIN, DIGITOS_MAX,
} from '../utils/conciliacionMasiva';

const DIGITOS_DEFECTO = 6;

/**
 * Lógica del modal "Conciliar todos": propone coincidencias entre el estado de
 * cuenta cargado y los pagos/comprobantes del sistema, y confirma en bloque.
 * `onConciliado` se llama tras confirmar para refrescar el lote abierto.
 */
export function useConciliacionMasiva({ banco, transactions, fileName, onConciliado }) {
  const [open, setOpen] = useState(false);
  const [bancoReceptor, setBancoReceptor] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [digitos, setDigitos] = useState(DIGITOS_DEFECTO);
  const [toleranciaGlobal, setToleranciaGlobal] = useState(TOLERANCIA_DEFECTO);
  const [toleranciaInput, setToleranciaInput] = useState(
    () => leerToleranciaSesion() ?? String(TOLERANCIA_DEFECTO)
  );
  const [buscando, setBuscando] = useState(false);
  const [buscado, setBuscado] = useState(false);
  const [propuestas, setPropuestas] = useState([]);
  const [resumenApi, setResumenApi] = useState(null);
  const [sinOperacion, setSinOperacion] = useState([]);
  const [seleccion, setSeleccion] = useState({});
  const [elecciones, setElecciones] = useState({});
  const [observaciones, setObservaciones] = useState({});
  const [filtroEstado, setFiltroEstado] = useState('todas');
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroresFila, setErroresFila] = useState({});
  const [ultimoResultado, setUltimoResultado] = useState(null);
  const sesionEditada = useRef(leerToleranciaSesion() !== null);
  const reqId = useRef(0);

  const fetchToleranciaGlobal = useCallback(async () => {
    try {
      const { data } = await apiClient.get('secretaria/configuracion/');
      const v = data?.tolerancia_conciliacion_ves;
      if (v !== undefined && v !== null && v !== '') {
        setToleranciaGlobal(Number(v));
        if (!sesionEditada.current) setToleranciaInput(String(v));
      }
    } catch (err) {
      toast.error(msgError(err, 'No se pudo cargar la tolerancia global de conciliación.'));
    }
  }, []);

  const limpiarResultados = useCallback(() => {
    reqId.current += 1;
    setBuscando(false);
    setBuscado(false);
    setPropuestas([]);
    setResumenApi(null);
    setSinOperacion([]);
    setSeleccion({});
    setElecciones({});
    setObservaciones({});
    setFiltroEstado('todas');
    setErroresFila({});
    setUltimoResultado(null);
  }, []);

  const abrir = useCallback(() => {
    if (!banco) {
      toast.warning('Selecciona un banco primero.');
      return;
    }
    if (transactions.length === 0) {
      toast.warning('Primero carga un estado de cuenta.');
      return;
    }
    const rango = rangoFechas(transactions);
    setBancoReceptor(banco);
    setDesde(rango.desde);
    setHasta(rango.hasta);
    setDigitos(DIGITOS_DEFECTO);
    limpiarResultados();
    setConfirmando(false);
    setOpen(true);
    fetchToleranciaGlobal();
  }, [banco, transactions, limpiarResultados, fetchToleranciaGlobal]);

  const cerrar = useCallback(() => {
    if (enviando) return;
    setConfirmando(false);
    setOpen(false);
  }, [enviando]);

  const bancoActivo = bancoReceptor || banco;

  // Cualquier cambio de parámetros invalida la propuesta anterior.
  const cambiarBanco = useCallback((id) => { setBancoReceptor(id); limpiarResultados(); }, [limpiarResultados]);
  const cambiarDesde = useCallback((v) => { setDesde(v || ''); limpiarResultados(); }, [limpiarResultados]);
  const cambiarHasta = useCallback((v) => { setHasta(v || ''); limpiarResultados(); }, [limpiarResultados]);
  const cambiarDigitos = useCallback((v) => { setDigitos(Number(v)); limpiarResultados(); }, [limpiarResultados]);

  const cambiarTolerancia = useCallback((valor) => {
    setToleranciaInput(valor);
    sesionEditada.current = true;
    if (valor !== '' && !Number.isNaN(Number(valor))) guardarToleranciaSesion(valor);
    limpiarResultados();
  }, [limpiarResultados]);

  const restablecerTolerancia = useCallback(() => {
    sesionEditada.current = false;
    try { sessionStorage.removeItem(TOLERANCIA_KEY); } catch { /* sin storage */ }
    setToleranciaInput(String(toleranciaGlobal));
    limpiarResultados();
  }, [toleranciaGlobal, limpiarResultados]);

  const tolerancia = Math.abs(Number(toleranciaInput));
  const toleranciaValida = toleranciaInput !== '' && !Number.isNaN(tolerancia);
  const rangoInvalido = Boolean(desde && hasta && desde > hasta);
  const digitosValidos = Number.isInteger(digitos) && digitos >= DIGITOS_MIN && digitos <= DIGITOS_MAX;

  const transaccionesEnviar = useMemo(
    () => filtrarPorFechas(transactions, desde, hasta).filter(tx => tx.tipo !== 'egreso'),
    [transactions, desde, hasta]
  );

  const puedeBuscar = Boolean(
    bancoActivo && desde && hasta && !rangoInvalido && toleranciaValida && digitosValidos
    && transaccionesEnviar.length > 0 && !buscando && !enviando
  );

  const buscar = useCallback(async () => {
    if (!puedeBuscar) return;
    const id = ++reqId.current;
    setBuscando(true);
    setBuscado(false);
    setErroresFila({});
    setUltimoResultado(null);
    try {
      const { data } = await apiClient.post('cobranza/conciliacion/auto/propuestas/', {
        banco: bancoActivo,
        desde,
        hasta,
        tolerancia,
        digitos,
        transacciones: transaccionesEnviar.map(tx => ({
          referencia: tx.referencia,
          fecha: fechaBancoAISO(tx.fecha),
          monto: tx.monto,
        })),
      });
      if (id !== reqId.current) return;
      const lista = ordenarPropuestas(data?.propuestas || []);
      setPropuestas(lista);
      setResumenApi(data?.resumen || null);
      setSinOperacion(data?.sin_operacion || []);
      setSeleccion(seleccionInicial(lista));
      setElecciones({});
      setObservaciones({});
      setFiltroEstado('todas');
      setBuscado(true);
    } catch (err) {
      if (id !== reqId.current) return;
      toast.error(msgError(err, 'No se pudieron calcular las coincidencias.'));
    } finally {
      if (id === reqId.current) setBuscando(false);
    }
  }, [puedeBuscar, bancoActivo, desde, hasta, tolerancia, digitos, transaccionesEnviar]);

  // Propuestas con la candidata elegida resuelta (ambiguas) y la diferencia efectiva.
  const efectivas = useMemo(
    () => propuestas.map(p => propuestaEfectiva(p, elecciones, tolerancia)),
    [propuestas, elecciones, tolerancia]
  );

  const visibles = useMemo(() => filtrarPorEstado(efectivas, filtroEstado), [efectivas, filtroEstado]);

  const resumen = useMemo(() => {
    const base = contarPorEstado(propuestas);
    return resumenApi ? { ...base, ...resumenApi, total: base.total } : base;
  }, [propuestas, resumenApi]);

  const puedeMarcar = useCallback(
    (e) => esSeleccionable(e) && !faltaObservacion(e, observaciones),
    [observaciones]
  );

  const alternarSeleccion = useCallback((idProp) => {
    setSeleccion(prev => ({ ...prev, [idProp]: !prev[idProp] }));
  }, []);

  const seleccionables = useMemo(() => visibles.filter(puedeMarcar), [visibles, puedeMarcar]);
  const todasMarcadas = seleccionables.length > 0 && seleccionables.every(e => seleccion[e.id]);

  const alternarTodas = useCallback(() => {
    setSeleccion(prev => {
      const marcar = !(seleccionables.length > 0 && seleccionables.every(e => prev[e.id]));
      const next = { ...prev };
      seleccionables.forEach(e => { next[e.id] = marcar; });
      return next;
    });
  }, [seleccionables]);

  const elegirCandidata = useCallback((idProp, clave) => {
    setElecciones(prev => ({ ...prev, [idProp]: clave }));
    // Al resolver la ambigüedad la fila queda marcada para conciliar.
    setSeleccion(prev => ({ ...prev, [idProp]: Boolean(clave) }));
  }, []);

  const cambiarObservacion = useCallback((idProp, texto) => {
    setObservaciones(prev => ({ ...prev, [idProp]: texto }));
  }, []);

  const enviables = useMemo(
    () => propuestasAEnviar(propuestas, { seleccion, elecciones, observaciones, tolerancia }),
    [propuestas, seleccion, elecciones, observaciones, tolerancia]
  );
  const resumenSeleccion = useMemo(() => resumenConfirmacion(enviables), [enviables]);

  const pedirConfirmacion = useCallback(() => {
    if (enviables.length > 0) setConfirmando(true);
  }, [enviables.length]);
  const cancelarConfirmacion = useCallback(() => { if (!enviando) setConfirmando(false); }, [enviando]);

  const confirmar = useCallback(async () => {
    if (enviables.length === 0 || enviando) return;
    const items = construirItems(enviables, observaciones);
    const lotes = dividirEnLotes(items);
    setEnviando(true);
    const respuestas = [];
    const fallosDeLote = [];
    for (let n = 0; n < lotes.length; n += 1) {
      try {
        const { data } = await apiClient.post('cobranza/conciliacion/auto/confirmar/', {
          banco: bancoActivo,
          tolerancia,
          archivo: fileName || '',
          items: lotes[n],
        });
        respuestas.push(data);
      } catch (err) {
        // Todo el lote falló (red, permisos, validación global): sus filas quedan pendientes.
        const mensaje = msgError(err, 'No se pudo enviar el lote.');
        respuestas.push({ conciliadas: [], errores: lotes[n].map((_, i) => ({ indice: i, error: mensaje })) });
        fallosDeLote.push(mensaje);
      }
    }
    const { conciliadas, errores, lote } = agregarResultados(respuestas);
    const idsConciliados = new Set(conciliadas.map(c => enviables[c.indice]?.id));
    const nuevosErrores = {};
    errores.forEach(e => {
      const fila = enviables[e.indice];
      if (fila) nuevosErrores[fila.id] = e.error;
    });

    setPropuestas(prev => prev.filter(p => !idsConciliados.has(p.id)));
    setSeleccion(prev => {
      const next = { ...prev };
      enviables.forEach(e => { delete next[e.id]; });
      return next;
    });
    setErroresFila(nuevosErrores);
    setUltimoResultado({ conciliadas: conciliadas.length, errores: errores.length, lote });
    setConfirmando(false);
    setEnviando(false);
    if (onConciliado) onConciliado(lote);

    if (errores.length === 0) {
      toast.success(`${conciliadas.length} ${conciliadas.length === 1 ? 'operación conciliada' : 'operaciones conciliadas'}.`);
    } else if (conciliadas.length === 0) {
      toast.error(`No se concilió ninguna operación: ${errores.length} con error.`);
    } else {
      toast.warning(`${conciliadas.length} conciliadas, ${errores.length} con error. Revisa las filas marcadas.`);
    }
  }, [enviables, enviando, observaciones, bancoActivo, tolerancia, fileName, onConciliado]);

  return {
    open, abrir, cerrar,
    bancoActivo, cambiarBanco,
    desde, hasta, cambiarDesde, cambiarHasta, rangoInvalido,
    digitos, cambiarDigitos, digitosValidos,
    toleranciaInput, cambiarTolerancia, restablecerTolerancia, toleranciaGlobal, toleranciaValida,
    transaccionesEnviar,
    puedeBuscar, buscar, buscando, buscado,
    propuestas, visibles, resumen, sinOperacion,
    filtroEstado, setFiltroEstado,
    seleccion, alternarSeleccion, alternarTodas, todasMarcadas, puedeMarcar,
    elecciones, elegirCandidata,
    observaciones, cambiarObservacion,
    enviables, resumenSeleccion,
    confirmando, pedirConfirmacion, cancelarConfirmacion, confirmar, enviando,
    erroresFila, ultimoResultado,
  };
}
