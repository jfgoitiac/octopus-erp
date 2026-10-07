import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from 'react-toastify';
import apiClient from '../api/apiClient';

const TOLERANCIA_KEY = 'conciliador_tolerancia_sesion';
const TOLERANCIA_DEFECTO = 200;

const leerToleranciaSesion = () => {
  try {
    const v = sessionStorage.getItem(TOLERANCIA_KEY);
    return v === null || v === '' ? null : v;
  } catch {
    return null;
  }
};

const guardarToleranciaSesion = (valor) => {
  try {
    sessionStorage.setItem(TOLERANCIA_KEY, String(valor));
  } catch {
    /* sessionStorage no disponible: la tolerancia solo vive en memoria */
  }
};

const msgError = (err, fallback) =>
  err?.response?.data?.error || err?.response?.data?.detail || fallback;

// El parser entrega fechas dd/MM/yyyy; la API espera ISO (yyyy-MM-dd).
export const fechaBancoAISO = (fecha) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(fecha || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : fecha;
};

export const claveCandidato = (c) => c.operacion_uuid || `comprobante-${c.comprobante_id}`;

/**
 * Lógica de la conciliación semiautomática por referencia (modal del
 * Conciliador). `banco` es el id del BancoInstitucional elegido,
 * `transactions` las transacciones del estado de cuenta ya cargado.
 */
export function useConciliacionSemiauto({ banco, transactions, fileName }) {
  const [open, setOpen] = useState(false);
  const [ref, setRef] = useState('');
  const [buscado, setBuscado] = useState(false);
  const [matches, setMatches] = useState([]);
  const [txSel, setTxSel] = useState(null);
  const [candidatos, setCandidatos] = useState([]);
  const [loadingCand, setLoadingCand] = useState(false);
  const [candSel, setCandSel] = useState(null);
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

  const resetBusqueda = useCallback(() => {
    reqId.current += 1;
    setBuscado(false);
    setMatches([]);
    setTxSel(null);
    setCandidatos([]);
    setCandSel(null);
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

  const buscar = useCallback(async () => {
    if (!refValida) return;
    const n = ref.length;
    const encontradas = transactions.filter(
      tx => tx.tipo !== 'egreso' && tx.referencia.replace(/\D/g, '').slice(-n) === ref
    );
    setBuscado(true);
    setMatches(encontradas);
    setTxSel(encontradas.length === 1 ? encontradas[0] : null);
    setCandSel(null);
    setCandidatos([]);

    const id = ++reqId.current;
    setLoadingCand(true);
    try {
      const { data } = await apiClient.get('cobranza/conciliacion/candidatos/', {
        params: { banco, ref },
      });
      if (id !== reqId.current) return;
      const lista = data?.resultados || [];
      setCandidatos(lista);
      const libres = lista.filter(c => !c.conciliado);
      if (libres.length === 1) setCandSel(claveCandidato(libres[0]));
    } catch (err) {
      if (id !== reqId.current) return;
      toast.error(msgError(err, 'No se pudieron consultar los candidatos del sistema.'));
    } finally {
      if (id === reqId.current) setLoadingCand(false);
    }
  }, [refValida, ref, transactions, banco]);

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

  const candidatoSel = useMemo(
    () => candidatos.find(c => claveCandidato(c) === candSel) || null,
    [candidatos, candSel]
  );

  const tolerancia = Math.abs(Number(toleranciaInput));
  const toleranciaValida = toleranciaInput !== '' && !Number.isNaN(tolerancia);

  const comparacion = useMemo(() => {
    if (!txSel || !candidatoSel) return null;
    const montoBanco = Number(txSel.monto);
    const montoSistema = Number(candidatoSel.monto_ves);
    const diferencia = Math.round((montoBanco - montoSistema) * 100) / 100;
    const fuera = toleranciaValida ? Math.abs(diferencia) > tolerancia : false;
    return { montoBanco, montoSistema, diferencia, fuera };
  }, [txSel, candidatoSel, tolerancia, toleranciaValida]);

  const observacionRequerida = Boolean(comparacion?.fuera);
  const puedeConfirmar = Boolean(
    comparacion && toleranciaValida && !enviando
    && (!observacionRequerida || observacion.trim().length > 0)
  );

  const confirmar = useCallback(async () => {
    if (!puedeConfirmar) return;
    setEnviando(true);
    try {
      const body = {
        banco,
        transaccion: {
          referencia: txSel.referencia,
          fecha: fechaBancoAISO(txSel.fecha),
          monto: txSel.monto,
        },
        tolerancia,
        observacion: observacion.trim(),
        archivo: fileName || '',
      };
      if (candidatoSel.operacion_uuid) body.operacion_uuid = candidatoSel.operacion_uuid;
      else body.comprobante_id = candidatoSel.comprobante_id;

      const { data } = await apiClient.post('cobranza/conciliacion/conciliar/', body);
      if (data?.lote) setLote(prev => ({ ...(prev || {}), ...data.lote }));
      else fetchLoteAbierto();
      toast.success(
        candidatoSel.se_aprobara
          ? 'Conciliado. El comprobante del portal fue aprobado.'
          : 'Operación conciliada y agregada al lote abierto.'
      );
      setOpen(false);
    } catch (err) {
      toast.error(msgError(err, 'No se pudo conciliar la operación.'));
    } finally {
      setEnviando(false);
    }
  }, [
    puedeConfirmar, banco, txSel, tolerancia, observacion, fileName,
    candidatoSel, fetchLoteAbierto,
  ]);

  return {
    open, abrir, cerrar,
    ref, cambiarRef, refValida, buscar, buscado,
    matches, txSel, setTxSel,
    candidatos, loadingCand, candSel, setCandSel, candidatoSel,
    toleranciaInput, cambiarTolerancia, restablecerTolerancia, toleranciaGlobal,
    toleranciaValida, tolerancia,
    observacion, setObservacion, observacionRequerida,
    comparacion, puedeConfirmar, enviando, confirmar,
    lote,
  };
}
