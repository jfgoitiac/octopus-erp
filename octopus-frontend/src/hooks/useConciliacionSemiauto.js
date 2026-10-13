import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from 'react-toastify';
import apiClient from '../api/apiClient';
import { fechaBancoAISO, filtrarPorFechas } from '../utils/conciliacionMasiva';

export const TOLERANCIA_KEY = 'conciliador_tolerancia_sesion';
export const TOLERANCIA_DEFECTO = 200;

export const leerToleranciaSesion = () => {
  try {
    const v = sessionStorage.getItem(TOLERANCIA_KEY);
    return v === null || v === '' ? null : v;
  } catch {
    return null;
  }
};

export const guardarToleranciaSesion = (valor) => {
  try {
    sessionStorage.setItem(TOLERANCIA_KEY, String(valor));
  } catch {
    /* sessionStorage no disponible: la tolerancia solo vive en memoria */
  }
};

export const msgError = (err, fallback) =>
  err?.response?.data?.error || err?.response?.data?.detail || fallback;

export { fechaBancoAISO };

export const claveCandidato = (c) => c.operacion_uuid || `comprobante-${c.comprobante_id}`;

/**
 * Lógica de la conciliación semiautomática por referencia (modal del
 * Conciliador). `banco` es el id del BancoInstitucional elegido,
 * `transactions` las transacciones del estado de cuenta ya cargado.
 */
export function useConciliacionSemiauto({ banco, transactions, fileName }) {
  const [open, setOpen] = useState(false);
  // Banco receptor de la búsqueda de candidatos: por defecto el del estado de
  // cuenta, el operador puede cambiarlo dentro del modal.
  const [bancoReceptor, setBancoReceptor] = useState('');
  const [ref, setRef] = useState('');
  // Rango de fechas opcional (yyyy-MM-dd) para acotar la búsqueda.
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [buscado, setBuscado] = useState(false);
  const [matches, setMatches] = useState([]);
  const [txSel, setTxSel] = useState(null);
  const [candidatos, setCandidatos] = useState([]);
  const [loadingCand, setLoadingCand] = useState(false);
  // Claves de los candidatos elegidos: varios = una transferencia que cubre
  // varias operaciones (pago conjunto de hermanos).
  const [candSel, setCandSel] = useState([]);
  // Líneas del banco ya conciliadas que coinciden con la búsqueda.
  const [movimientosPrevios, setMovimientosPrevios] = useState([]);
  const [toleranciaGlobal, setToleranciaGlobal] = useState(TOLERANCIA_DEFECTO);
  const [toleranciaInput, setToleranciaInput] = useState(
    () => leerToleranciaSesion() ?? String(TOLERANCIA_DEFECTO)
  );
  const [observacion, setObservacion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [lote, setLote] = useState(null);
  const sesionEditada = useRef(leerToleranciaSesion() !== null);
  const reqId = useRef(0);

  const fetchLoteAbierto = useCallback(async () => {
    try {
      const { data } = await apiClient.get('cobranza/conciliacion/lotes/abierto/');
      setLote(data?.lote || null);
    } catch (err) {
      toast.error(msgError(err, 'No se pudo consultar el lote abierto.'));
    }
  }, []);

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

  useEffect(() => { fetchLoteAbierto(); }, [fetchLoteAbierto]);

  const bancoActivo = bancoReceptor || banco;

  const resetBusqueda = useCallback(() => {
    reqId.current += 1;
    setBuscado(false);
    setMatches([]);
    setTxSel(null);
    setCandidatos([]);
    setCandSel([]);
    setMovimientosPrevios([]);
    setLoadingCand(false);
    setObservacion('');
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
    setRef('');
    setDesde('');
    setHasta('');
    setBancoReceptor(banco);
    resetBusqueda();
    setOpen(true);
    fetchToleranciaGlobal();
    fetchLoteAbierto();
  }, [banco, transactions.length, resetBusqueda, fetchToleranciaGlobal, fetchLoteAbierto]);

  const cerrar = useCallback(() => setOpen(false), []);

  const cambiarRef = useCallback((valor) => {
    setRef(valor.replace(/\D/g, '').slice(0, 6));
    resetBusqueda();
  }, [resetBusqueda]);

  const refValida = ref.length >= 4 && ref.length <= 6;
  const hayFechas = Boolean(desde || hasta);
  const rangoInvalido = Boolean(desde && hasta && desde > hasta);
  // Con rango de fechas se puede buscar sin dígitos; con dígitos, deben ser 4 a 6.
  const puedeBuscar = !rangoInvalido && (refValida || (ref === '' && hayFechas));

  const cambiarDesde = useCallback((valor) => { setDesde(valor || ''); resetBusqueda(); }, [resetBusqueda]);
  const cambiarHasta = useCallback((valor) => { setHasta(valor || ''); resetBusqueda(); }, [resetBusqueda]);

  const consultarCandidatos = useCallback(async (bancoId, refBuscada, d, h) => {
    const id = ++reqId.current;
    setCandSel([]);
    setCandidatos([]);
    setMovimientosPrevios([]);
    setLoadingCand(true);
    try {
      const params = { banco: bancoId };
      if (refBuscada) params.ref = refBuscada;
      if (d) params.desde = d;
      if (h) params.hasta = h;
      const { data } = await apiClient.get('cobranza/conciliacion/candidatos/', { params });
      if (id !== reqId.current) return;
      const lista = data?.resultados || [];
      setCandidatos(lista);
      setMovimientosPrevios(data?.movimientos_previos || []);
      const libres = lista.filter(c => !c.conciliado);
      if (libres.length === 1) setCandSel([claveCandidato(libres[0])]);
    } catch (err) {
      if (id !== reqId.current) return;
      toast.error(msgError(err, 'No se pudieron consultar los candidatos del sistema.'));
    } finally {
      if (id === reqId.current) setLoadingCand(false);
    }
  }, []);

  const buscar = useCallback(async () => {
    if (!puedeBuscar) return;
    const n = ref.length;
    const enRango = filtrarPorFechas(transactions, desde, hasta);
    const encontradas = enRango.filter(
      tx => tx.tipo !== 'egreso' && (n === 0 || tx.referencia.replace(/\D/g, '').slice(-n) === ref)
    );
    setBuscado(true);
    setMatches(encontradas);
    setTxSel(encontradas.length === 1 ? encontradas[0] : null);
    await consultarCandidatos(bancoActivo, ref, desde, hasta);
  }, [puedeBuscar, ref, desde, hasta, transactions, bancoActivo, consultarCandidatos]);

  // Cambia el banco receptor; si ya hay una búsqueda, vuelve a consultar candidatos.
  const cambiarBanco = useCallback((id) => {
    if (!id || id === bancoActivo) return;
    setBancoReceptor(id);
    if (buscado && puedeBuscar) consultarCandidatos(id, ref, desde, hasta);
  }, [bancoActivo, buscado, puedeBuscar, ref, desde, hasta, consultarCandidatos]);

  const cambiarTolerancia = useCallback((valor) => {
    setToleranciaInput(valor);
    sesionEditada.current = true;
    if (valor !== '' && !Number.isNaN(Number(valor))) guardarToleranciaSesion(valor);
  }, []);

  const restablecerTolerancia = useCallback(() => {
    sesionEditada.current = false;
    try { sessionStorage.removeItem(TOLERANCIA_KEY); } catch { /* sin storage */ }
    setToleranciaInput(String(toleranciaGlobal));
  }, [toleranciaGlobal]);

  const alternarCandidato = useCallback((clave) => {
    setCandSel(prev => (prev.includes(clave) ? prev.filter(k => k !== clave) : [...prev, clave]));
  }, []);

  const candidatosSel = useMemo(
    () => candidatos.filter(c => candSel.includes(claveCandidato(c))),
    [candidatos, candSel]
  );
  const candidatoSel = candidatosSel[0] || null;

  // Si la transacción elegida ya fue conciliada (pago conjunto a medias), las
  // operaciones nuevas se suman a ese movimiento en el servidor.
  const movimientoPrevio = useMemo(() => {
    if (!txSel) return null;
    const ref = String(txSel.referencia).trim();
    const fecha = fechaBancoAISO(txSel.fecha);
    return movimientosPrevios.find(m => m.referencia === ref && m.fecha === fecha) || null;
  }, [txSel, movimientosPrevios]);

  const tolerancia = Math.abs(Number(toleranciaInput));
  const toleranciaValida = toleranciaInput !== '' && !Number.isNaN(tolerancia);

  const comparacion = useMemo(() => {
    if (!txSel || candidatosSel.length === 0) return null;
    const montoBanco = Number(txSel.monto);
    const montoPrevio = movimientoPrevio ? Number(movimientoPrevio.monto_sistema_ves) : 0;
    const montoSistema = Math.round(
      (candidatosSel.reduce((s, c) => s + Number(c.monto_ves), 0) + montoPrevio) * 100
    ) / 100;
    const diferencia = Math.round((montoBanco - montoSistema) * 100) / 100;
    const fuera = toleranciaValida ? Math.abs(diferencia) > tolerancia : false;
    const representantes = new Set(candidatosSel.map(c => c.representante_id ?? c.representante));
    return {
      montoBanco, montoSistema, montoPrevio, diferencia, fuera,
      operaciones: candidatosSel.length,
      representantesDistintos: representantes.size > 1,
    };
  }, [txSel, candidatosSel, movimientoPrevio, tolerancia, toleranciaValida]);

  const montoPrevioDistinto = Boolean(
    movimientoPrevio && txSel && Number(movimientoPrevio.monto_banco_ves) !== Number(txSel.monto)
  );
  const observacionRequerida = Boolean(comparacion?.fuera || comparacion?.representantesDistintos);
  const puedeConfirmar = Boolean(
    comparacion && toleranciaValida && !enviando && !montoPrevioDistinto
    && (!observacionRequerida || observacion.trim().length > 0)
  );

  const confirmar = useCallback(async () => {
    if (!puedeConfirmar) return;
    setEnviando(true);
    try {
      const body = {
        banco: bancoActivo,
        transaccion: {
          referencia: txSel.referencia,
          fecha: fechaBancoAISO(txSel.fecha),
          monto: txSel.monto,
        },
        tolerancia,
        observacion: observacion.trim(),
        archivo: fileName || '',
        operaciones: candidatosSel.map(c => (
          c.operacion_uuid ? { operacion_uuid: c.operacion_uuid } : { comprobante_id: c.comprobante_id }
        )),
      };

      const { data } = await apiClient.post('cobranza/conciliacion/conciliar/', body);
      if (data?.lote) setLote(prev => ({ ...(prev || {}), ...data.lote }));
      else fetchLoteAbierto();
      const aprobados = candidatosSel.filter(c => c.se_aprobara).length;
      let mensaje = candidatosSel.length > 1
        ? `${candidatosSel.length} operaciones conciliadas como pago conjunto.`
        : 'Operación conciliada y agregada al lote abierto.';
      if (movimientoPrevio) mensaje = 'Operación agregada al pago conjunto ya conciliado.';
      if (aprobados > 0) mensaje += aprobados > 1 ? ` Se aprobaron ${aprobados} comprobantes del portal.` : ' El comprobante del portal fue aprobado.';
      toast.success(mensaje);
      setOpen(false);
    } catch (err) {
      toast.error(msgError(err, 'No se pudo conciliar la operación.'));
    } finally {
      setEnviando(false);
    }
  }, [
    puedeConfirmar, bancoActivo, txSel, tolerancia, observacion, fileName,
    candidatosSel, movimientoPrevio, fetchLoteAbierto,
  ]);

  return {
    open, abrir, cerrar,
    bancoActivo, cambiarBanco,
    ref, cambiarRef, refValida, buscar, buscado,
    desde, hasta, cambiarDesde, cambiarHasta, hayFechas, rangoInvalido, puedeBuscar,
    matches, txSel, setTxSel,
    candidatos, loadingCand, candSel, alternarCandidato, candidatosSel, candidatoSel,
    movimientoPrevio, montoPrevioDistinto,
    toleranciaInput, cambiarTolerancia, restablecerTolerancia, toleranciaGlobal,
    toleranciaValida, tolerancia,
    observacion, setObservacion, observacionRequerida,
    comparacion, puedeConfirmar, enviando, confirmar,
    lote, refrescarLote: fetchLoteAbierto,
  };
}
