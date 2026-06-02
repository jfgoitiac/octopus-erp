import { useState, useMemo, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import { getMonth, getYear } from 'date-fns';
import {
  MESES,
  TIPO_RECIBO_DEFAULT,
  DEFAULT_ASIGNACIONES,
  DEFAULT_RETENCIONES,
  LOGO_MAX_BYTES,
} from '../constants/recibo';

const initInfo = () => {
  let logos = {};
  try { logos = JSON.parse(localStorage.getItem('octopus_logos_recibo') || '{}'); } catch {}
  return {
    nombre: '', cedula: '', horasSemana: '', cargo: '',
    fechaIngreso: '', titulo: '', categoriaDocente: '', nivel: '',
    mes:        MESES[getMonth(new Date())],
    año:        String(getYear(new Date())),
    tipoRecibo: TIPO_RECIBO_DEFAULT,
    logoColegio: logos.logoColegio || null,
    logoAvec:    logos.logoAvec    || null,
  };
};

export function useRecibo() {
  // El contador arranca en 10 para nunca colisionar con los IDs fijos de DEFAULT_*
  const uidRef = useRef(10);
  const nextId = useCallback(() => ++uidRef.current, []);

  const [info,        setInfo]        = useState(initInfo);
  const [asignaciones, setAsignaciones] = useState(() => DEFAULT_ASIGNACIONES.map(r => ({ ...r })));
  const [retenciones,  setRetenciones]  = useState(() => DEFAULT_RETENCIONES.map(r => ({ ...r })));
  const [alimentario, setAlimentario]  = useState({
    montoPorHora: '', costoDiario: '', totalBeneficio: '',
    horasInasistencia: '', descuentoInasistencia: '',
  });

  // ── Handlers genéricos ────────────────────────────────────────────────────
  const setInfoField = useCallback(
    (field, value) => setInfo(p => ({ ...p, [field]: value })),
    [],
  );

  const setAlimentarioField = useCallback(
    (field, value) => setAlimentario(p => ({ ...p, [field]: value })),
    [],
  );

  // ── Upload de logo (con validación de tamaño) ─────────────────────────────
  const handleLogoUpload = useCallback((field, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > LOGO_MAX_BYTES) {
      toast.error('El logo no debe superar 500 KB. Comprímelo antes de subirlo.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      setInfoField(field, ev.target.result);
      toast.success('Logo cargado para este recibo.');
    };
    reader.readAsDataURL(file);
  }, [setInfoField]);

  // ── Asignaciones CRUD ─────────────────────────────────────────────────────
  const updateAsig = useCallback(
    (id, field, value) => setAsignaciones(rows => rows.map(r => r.id === id ? { ...r, [field]: value } : r)),
    [],
  );
  const addAsig = useCallback(
    () => setAsignaciones(rows => [...rows, { id: nextId(), label: 'NUEVA ASIGNACIÓN', value: '' }]),
    [nextId],
  );
  const removeAsig = useCallback(
    (id) => setAsignaciones(rows => rows.filter(r => r.id !== id)),
    [],
  );

  // ── Retenciones CRUD ──────────────────────────────────────────────────────
  const updateRet = useCallback(
    (id, field, value) => setRetenciones(rows => rows.map(r => r.id === id ? { ...r, [field]: value } : r)),
    [],
  );
  const addRet = useCallback(
    () => setRetenciones(rows => [...rows, { id: nextId(), label: 'NUEVA RETENCIÓN', value: '' }]),
    [nextId],
  );
  const removeRet = useCallback(
    (id) => setRetenciones(rows => rows.filter(r => r.id !== id)),
    [],
  );

  // ── Cálculos derivados ────────────────────────────────────────────────────
  const calcs = useMemo(() => {
    const totalAsignaciones = asignaciones.reduce((s, a) => s + (parseFloat(a.value) || 0), 0);
    const totalRetenciones  = retenciones.reduce((s, r) => s + (parseFloat(r.value) || 0), 0);
    const totalBeneficioRecibir =
      (parseFloat(alimentario.totalBeneficio)       || 0) -
      (parseFloat(alimentario.descuentoInasistencia) || 0);
    return {
      totalAsignaciones,
      primerQuincena:       totalAsignaciones / 2,
      segundaQuincena:      totalAsignaciones / 2,
      totalRetenciones,
      netoDepositar:        totalAsignaciones - totalRetenciones,
      totalBeneficioRecibir,
    };
  }, [asignaciones, retenciones, alimentario]);

  return {
    info,        setInfoField,   handleLogoUpload,
    asignaciones, updateAsig,   addAsig,  removeAsig,
    retenciones,  updateRet,    addRet,   removeRet,
    alimentario,  setAlimentarioField,
    calcs,
  };
}
