import { useState, useEffect } from 'react';
import {
    FileText, Loader2, AlertCircle, Download, X,
    Users, Wheat, Check, DollarSign, Settings2,
    GraduationCap, Briefcase, Wrench,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'react-toastify';

import axiosInstance from '../api/apiClient';
import {
    generarPlanillaBancaribePDF, generarTXTBancaribe, fmtBs,
} from '../utils/nominaPDF';
import {
    loadCestaConfig, saveCestaConfig, calcAVEC, calcSueldoBase,
    SSO_PCT, SPF_PCT, FAOV_PCT, SSO_TOPE, CATEGORIAS_DOCENTE,
} from '../constants/avec';

// ── Helpers ───────────────────────────────────────────────────────────────────

function useEscape(isOpen, onClose) {
    useEffect(() => {
        if (!isOpen) return;
        const h = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, [isOpen, onClose]);
}

/** Devuelve true si el número de cuenta comienza con 0114 (Bancaribe). */
const esBancaribe = (emp) => (emp.numero_cuenta || '').startsWith('0114');

/**
 * Calcula el monto de nómina (neto o quincena) para un empleado.
 * Docentes y directivos: usa tablas AVEC + cestaConfig (costo_hora).
 * Administrativos / apoyo (obreros): usa emp.sueldo_base almacenado.
 */
function calcMontoNomina(emp, cestaConfig, periodo) {
    const esDocente = emp.tipo_personal === 'docente' || emp.tipo_personal === 'directivo';
    let neto = 0;
    let ok   = false;

    if (esDocente) {
        const sb = calcSueldoBase(cestaConfig, emp.categoria_docente, emp.horas_semanales);
        if (sb > 0) {
            const avec = calcAVEC(sb, emp.categoria_docente, emp.anos_servicio, emp.numero_hijos, emp.titulo);
            neto = avec.neto;
            ok   = true;
        }
    } else {
        const sb = parseFloat(emp.sueldo_base) || 0;
        if (sb > 0) {
            const sso  = Math.min(sb * SSO_PCT, SSO_TOPE);
            const spf  = sb * SPF_PCT;
            const faov = sb * FAOV_PCT;
            neto = sb - (sso + spf + faov);
            ok   = true;
        }
    }

    const monto = periodo === 'Mensual' ? neto : neto / 2;
    return { monto: parseFloat(monto.toFixed(2)), ok };
}

/**
 * Calcula el neto de cestaticket de una fila (ya con descuento por inasistencia).
 * Usa la misma lógica de Nomina.jsx: descuento = hsInasist * tarifa_hora (en Bs).
 */
function getCestaMontoFinal(row, cfg) {
    // PRD §6.5: descuento = horas_ausentes × tarifa_hora (Bs directo, sin × tasa)
    const tarifaHora  = parseFloat(cfg?.tarifa_hora) || 0.20;
    const hsInasist   = parseFloat(row.hs_inasistencia) || 0;
    const descuentoBs = hsInasist * tarifaHora;
    return parseFloat(Math.max((row.cesta_total_bs || 0) - descuentoBs, 0).toFixed(2));
}

// ── Estilos compartidos ───────────────────────────────────────────────────────
const inputCls   = 'w-full px-3 py-2 rounded-lg text-sm outline-none';
const inputStyle = { border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' };
const labelCls   = 'block text-[11px] uppercase tracking-widest mb-1.5';
const labelStyle = { color: 'var(--ash)' };

const PERIODOS = ['I Quincena', 'II Quincena', 'Mensual'];

// ── Actualiza un campo anidado por ruta "a.b.c" ──────────────────────────────
function setNestedPath(prev, path, value) {
    const parts = path.split('.');
    if (parts.length === 1) return { ...prev, [path]: value };
    if (parts.length === 2) {
        const [k1, k2] = parts;
        return { ...prev, [k1]: { ...prev[k1], [k2]: value } };
    }
    const [k1, k2, k3] = parts;
    return { ...prev, [k1]: { ...prev[k1], [k2]: { ...(prev[k1]?.[k2] || {}), [k3]: value } } };
}

const TABS_CESTA = [
    { key: 'docente',        label: 'Docente',           icon: GraduationCap },
    { key: 'apoyo',          label: 'Personal de Apoyo', icon: Wrench },
    { key: 'administrativo', label: 'Administrativo',    icon: Briefcase },
];

// ── Etiquetas de tipo personal ────────────────────────────────────────────────
const TIPO_LABEL = {
    docente:        'Docente',
    directivo:      'Directivo',
    administrativo: 'Administrativo',
    apoyo:          'Apoyo/Obrero',
};

// ═════════════════════════════════════════════════════════════════════════════
// Componente principal
// ═════════════════════════════════════════════════════════════════════════════
const Pagos = () => {

    /* ── Sección 1: Incentivo (Bancaribe existente) ────────────────────────── */
    const [showBancaribeModal, setShowBancaribeModal] = useState(false);
    const [loadingBancaribe,   setLoadingBancaribe]   = useState(false);
    const [bancaribeRows,      setBancaribeRows]       = useState([]);
    const [tasaDia,            setTasaDia]             = useState(0);

    /* ── Sección 2: Nómina ─────────────────────────────────────────────────── */
    const [showNominaModal, setShowNominaModal] = useState(false);
    const [loadingNomina,   setLoadingNomina]   = useState(false);
    const [nominaRows,      setNominaRows]       = useState([]);
    const [nominaPeriodo,   setNominaPeriodo]    = useState('I Quincena');

    /* ── Sección 3: Cestaticket ────────────────────────────────────────────── */
    const [showCestaModal,      setShowCestaModal]      = useState(false);
    const [loadingCesta,        setLoadingCesta]        = useState(false);
    const [cestaRows,           setCestaRows]           = useState([]);
    const [cestaConfigState,    setCestaConfigState]    = useState(null);

    /* ── Sección 3-b: Configuración Cestaticket ───────────────────────────── */
    const [showCestaConfigModal, setShowCestaConfigModal] = useState(false);
    const [cestaConfigLocal,     setCestaConfigLocal]     = useState(loadCestaConfig);
    const [cestaFormLocal,       setCestaFormLocal]       = useState(loadCestaConfig);

    /* ── Modal concepto (compartido por las 3 secciones) ──────────────────── */
    const [showConceptoModal, setShowConceptoModal] = useState(false);
    const [conceptoFor,       setConceptoFor]       = useState(null); // 'incentivo' | 'nomina' | 'cesta'
    const [conceptoPago,      setConceptoPago]      = useState('');

    // ── Escape ──────────────────────────────────────────────────────────────
    useEscape(showBancaribeModal,   () => { setShowBancaribeModal(false); setBancaribeRows([]); setTasaDia(0); });
    useEscape(showNominaModal,     () => setShowNominaModal(false));
    useEscape(showCestaModal,      () => setShowCestaModal(false));
    useEscape(showCestaConfigModal, () => setShowCestaConfigModal(false));
    useEscape(showConceptoModal,   () => { setShowConceptoModal(false); setConceptoPago(''); });

    // ════════════════════════════════════════════════════════════════════════
    // Handlers — Incentivo
    // ════════════════════════════════════════════════════════════════════════
    const handleOpenBancaribeModal = async () => {
        setLoadingBancaribe(true);
        try {
            const res = await axiosInstance.get('rrhh/empleados/preview_bancaribe/');
            const { empleados: emps, tasa } = res.data;
            setTasaDia(tasa || 0);
            setBancaribeRows(emps.map(e => ({ ...e, monto_usd: '' })));
            setShowBancaribeModal(true);
        } catch { toast.error('No se pudo cargar la vista previa de Bancaribe.'); }
        finally  { setLoadingBancaribe(false); }
    };

    const closeBancaribeModal = () => {
        setShowBancaribeModal(false);
        setBancaribeRows([]);
        setTasaDia(0);
    };

    // ════════════════════════════════════════════════════════════════════════
    // Handlers — Nómina
    // ════════════════════════════════════════════════════════════════════════
    const handleOpenNominaModal = async () => {
        setLoadingNomina(true);
        try {
            const cfg = loadCestaConfig();
            const res = await axiosInstance.get('rrhh/empleados/');
            const emps = res.data || [];
            const rows = emps.map(emp => {
                const { monto, ok } = calcMontoNomina(emp, cfg, nominaPeriodo);
                return { ...emp, monto_bs: ok ? String(monto) : '', calculado: ok };
            });
            setNominaRows(rows);
            setShowNominaModal(true);
        } catch { toast.error('No se pudo cargar los empleados.'); }
        finally  { setLoadingNomina(false); }
    };

    /** Recalcula los montos al cambiar el período sin volver a llamar a la API. */
    const handleNominaPeriodoChange = (periodo) => {
        setNominaPeriodo(periodo);
        const cfg = loadCestaConfig();
        setNominaRows(prev => prev.map(emp => {
            const { monto, ok } = calcMontoNomina(emp, cfg, periodo);
            // Si el usuario ya editó el monto manualmente (!emp.calculado), no sobreescribir
            if (!ok && !emp.calculado) return emp;
            return { ...emp, monto_bs: ok ? String(monto) : '', calculado: ok };
        }));
    };

    // ════════════════════════════════════════════════════════════════════════
    // Handlers — Configuración Cestaticket
    // ════════════════════════════════════════════════════════════════════════
    const handleCestaConfigFormChange = (path, value) =>
        setCestaFormLocal(prev => setNestedPath(prev, path, value));

    const handleSaveCestaConfig = () => {
        saveCestaConfig(cestaFormLocal);
        setCestaConfigLocal({ ...cestaFormLocal });
        setShowCestaConfigModal(false);
        toast.success('Configuración de cesta ticket guardada.');
    };

    // ════════════════════════════════════════════════════════════════════════
    // Handlers — Cestaticket
    // ════════════════════════════════════════════════════════════════════════
    const handleOpenCestaModal = async () => {
        const cfg = cestaConfigLocal;
        if (!(parseFloat(cfg.tasa_bcv) > 0)) {
            toast.warning('Configura la Tasa BCV usando el botón "Configurar" antes de procesar.');
            return;
        }
        setLoadingCesta(true);
        try {
            const res  = await axiosInstance.get('rrhh/empleados/');
            const emps = res.data || [];
            const rows = emps.map(emp => {
                const tipo     = emp.tipo_personal || 'docente';
                const montoUsd = parseFloat(cfg[tipo]?.monto_usd) || 0;
                const tasaBcv  = parseFloat(cfg.tasa_bcv) || 0;
                const totalBs  = parseFloat((montoUsd * tasaBcv).toFixed(2));
                return {
                    ...emp,
                    cesta_total_bs:   totalBs,
                    hs_inasistencia:  '',
                    ok_cesta:         totalBs > 0,
                };
            });
            setCestaRows(rows);
            setCestaConfigState(cfg);
            setShowCestaModal(true);
        } catch { toast.error('No se pudo cargar los empleados.'); }
        finally  { setLoadingCesta(false); }
    };

    // ════════════════════════════════════════════════════════════════════════
    // Handlers — Concepto + generación final
    // ════════════════════════════════════════════════════════════════════════
    const handleAbrirConcepto = (para) => {
        let hasPagos = false;
        if (para === 'incentivo') hasPagos = bancaribeRows.some(r => parseFloat(r.monto_usd) > 0);
        if (para === 'nomina')    hasPagos = nominaRows.some(r => parseFloat(r.monto_bs) > 0 && esBancaribe(r));
        if (para === 'cesta')     hasPagos = cestaRows.some(r => getCestaMontoFinal(r, cestaConfigState) > 0 && esBancaribe(r));

        if (!hasPagos) {
            toast.warning('No hay empleados Bancaribe con monto para incluir en el TXT.');
            return;
        }
        setConceptoFor(para);
        setConceptoPago('');
        setShowConceptoModal(true);
    };

    const handleConfirmarGeneracion = () => {
        if (!conceptoPago.trim()) { toast.warning('Escribe el concepto de pago.'); return; }

        const hoy    = format(new Date(), 'yyyyMMdd');
        const mesStr = format(new Date(), 'MMyyyy');

        if (conceptoFor === 'incentivo') {
            if (!(tasaDia > 0)) { toast.warning('La tasa Bs/USD debe ser mayor a 0.'); return; }
            const pagos = bancaribeRows.filter(r => parseFloat(r.monto_usd) > 0);
            generarTXTBancaribe(pagos, tasaDia, `Incentivo_Bancaribe_${hoy}`);
            generarPlanillaBancaribePDF(pagos, tasaDia, conceptoPago.trim(), {
                titulo:   'PLANILLA DE PAGO — INCENTIVO BANCARIBE',
                colMonto: 'Monto USD',
                filename: `Planilla_Incentivo_${hoy}`,
            });
            toast.success(`Incentivo: TXT + planilla generados (${pagos.length} empleado/s).`);
            setShowConceptoModal(false);
            closeBancaribeModal();

        } else if (conceptoFor === 'nomina') {
            const pagos = nominaRows
                .filter(r => parseFloat(r.monto_bs) > 0 && esBancaribe(r))
                .map(r => ({ ...r, monto_usd: r.monto_bs }));
            generarTXTBancaribe(pagos, 1, `Nomina_${nominaPeriodo.replace(' ', '')}_${mesStr}`);
            generarPlanillaBancaribePDF(pagos, 1, conceptoPago.trim(), {
                titulo:   `PLANILLA DE NÓMINA — ${nominaPeriodo.toUpperCase()}`,
                filename: `Planilla_Nomina_${nominaPeriodo.replace(' ', '')}_${mesStr}`,
            });
            toast.success(`Nómina: TXT + planilla generados (${pagos.length} empleado/s).`);
            setShowConceptoModal(false);
            setShowNominaModal(false);

        } else if (conceptoFor === 'cesta') {
            const pagos = cestaRows
                .filter(r => getCestaMontoFinal(r, cestaConfigState) > 0 && esBancaribe(r))
                .map(r => ({ ...r, monto_usd: String(getCestaMontoFinal(r, cestaConfigState)) }));
            generarTXTBancaribe(pagos, 1, `Cestaticket_${mesStr}`);
            generarPlanillaBancaribePDF(pagos, 1, conceptoPago.trim(), {
                titulo:   'PLANILLA DE PAGO — CESTATICKET / BONO ALIMENTARIO',
                filename: `Planilla_Cesta_${mesStr}`,
            });
            toast.success(`Cestaticket: TXT + planilla generados (${pagos.length} empleado/s).`);
            setShowConceptoModal(false);
            setShowCestaModal(false);
        }

        setConceptoPago('');
        setConceptoFor(null);
    };

    // ════════════════════════════════════════════════════════════════════════
    // Render
    // ════════════════════════════════════════════════════════════════════════
    return (
        <div className="animate-fadeIn">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="mb-6">
                <h2 className="text-lg font-medium" style={{ color: 'var(--jet)' }}>
                    Módulo de Pagos
                </h2>
                <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>
                    Generación de archivos TXT y planillas PDF para transferencias bancarias
                </p>
            </div>

            {/* ── Tres tarjetas de acción ──────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                {/* 1 ── Incentivo */}
                <div className="rounded-xl p-5 flex flex-col gap-4"
                    style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                    <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: '#e8f0fc' }}>
                            <FileText size={18} style={{ color: '#004FA3' }} />
                        </div>
                        <div>
                            <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>Incentivo</p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>
                                Pagos en USD vía Bancaribe — TXT + planilla PDF
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleOpenBancaribeModal}
                        disabled={loadingBancaribe}
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 w-full"
                        style={{ background: '#004FA3' }}>
                        {loadingBancaribe
                            ? <><Loader2 className="animate-spin" size={15} /> Cargando...</>
                            : <><FileText size={15} /> Generar Incentivo</>}
                    </button>
                </div>

                {/* 2 ── Nómina */}
                <div className="rounded-xl p-5 flex flex-col gap-4"
                    style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                    <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: '#ede9fe' }}>
                            <Users size={18} style={{ color: '#6d28d9' }} />
                        </div>
                        <div>
                            <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>Nómina</p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>
                                Pago de sueldo — Cálculo AVEC automático por categoría
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleOpenNominaModal}
                        disabled={loadingNomina}
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 w-full"
                        style={{ background: '#6d28d9' }}>
                        {loadingNomina
                            ? <><Loader2 className="animate-spin" size={15} /> Cargando...</>
                            : <><Users size={15} /> Generar Nómina</>}
                    </button>
                </div>

                {/* 3 ── Cestaticket */}
                <div className="rounded-xl p-5 flex flex-col gap-4"
                    style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                                style={{ background: '#dcfce7' }}>
                                <Wheat size={18} style={{ color: '#16a34a' }} />
                            </div>
                            <div>
                                <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>Cestaticket</p>
                                <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>
                                    Bono alimentario
                                    {parseFloat(cestaConfigLocal.tasa_bcv) > 0 && (
                                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                                            style={{ background: '#dcfce7', color: '#16a34a' }}>
                                            {parseFloat(cestaConfigLocal.tasa_bcv).toLocaleString('es-VE')} Bs
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => { setCestaFormLocal({ ...cestaConfigLocal }); setShowCestaConfigModal(true); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0"
                            style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}
                            title="Configurar tarifas y tasa BCV de cesta ticket">
                            <Settings2 size={13} /> Configurar
                        </button>
                    </div>
                    <button
                        onClick={handleOpenCestaModal}
                        disabled={loadingCesta}
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 w-full"
                        style={{ background: '#16a34a' }}>
                        {loadingCesta
                            ? <><Loader2 className="animate-spin" size={15} /> Cargando...</>
                            : <><Wheat size={15} /> Generar Cestaticket</>}
                    </button>
                </div>

            </div>

            {/* ════════════════════════════════════════════════════════════
                MODAL 1 — INCENTIVO (Bancaribe)
            ════════════════════════════════════════════════════════════ */}
            {showBancaribeModal && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
                    style={{ background: 'rgba(43,48,58,0.6)' }}
                    role="dialog" aria-modal="true" aria-label="Generar pago Incentivo Bancaribe">
                    <div className="w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl flex flex-col"
                        style={{ background: 'var(--porcelain)', maxHeight: '90vh' }}>

                        {/* Header */}
                        <div className="flex justify-between items-center px-6 py-4 flex-shrink-0"
                            style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                            <div className="flex items-center gap-3 flex-wrap">
                                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: '#004FA3' }} />
                                <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                    Incentivo — Pago Bancaribe
                                </h3>
                                <div className="flex items-center gap-2">
                                    <label className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--ash)' }}>
                                        Tasa Bs/USD
                                    </label>
                                    <input type="number" min="0" step="0.0001" value={tasaDia}
                                        onChange={e => setTasaDia(parseFloat(e.target.value) || 0)}
                                        className="w-28 px-2.5 py-1 rounded-lg text-sm font-mono outline-none text-right"
                                        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                                        aria-label="Tasa de cambio Bs/USD" />
                                </div>
                                {tasaDia <= 0 && (
                                    <span className="text-[11px] flex items-center gap-1" style={{ color: '#b45309' }}>
                                        <AlertCircle size={12} /> Ingresa la tasa
                                    </span>
                                )}
                            </div>
                            <button onClick={closeBancaribeModal} style={{ color: 'var(--ash)' }}
                                aria-label="Cerrar modal Incentivo">
                                <X size={18} />
                            </button>
                        </div>

                        {/* Tabla */}
                        <div className="overflow-y-auto flex-1">
                            {bancaribeRows.length === 0 ? (
                                <div className="py-20 text-center text-sm" style={{ color: 'var(--ash)' }}>
                                    No hay empleados con cuenta Bancaribe (0114) configurada.
                                </div>
                            ) : (
                                <table className="w-full text-left">
                                    <thead className="sticky top-0" style={{ background: 'var(--porcelain)', zIndex: 1 }}>
                                        <tr>
                                            {['Empleado', 'Cédula', 'N° Cuenta', 'Tipo', 'Monto USD', 'Monto Bs'].map(h => (
                                                <th key={h} className="px-4 py-3 text-[11px] uppercase tracking-widest"
                                                    style={{ color: 'var(--ash)', borderBottom: '0.5px solid var(--border-md)' }}>
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {bancaribeRows.map(row => {
                                            const montoUsd = parseFloat(row.monto_usd) || 0;
                                            const montoVes = tasaDia > 0 ? (montoUsd * tasaDia).toFixed(2) : '—';
                                            const activo   = montoUsd > 0;
                                            return (
                                                <tr key={row.id}
                                                    style={{ borderBottom: '0.5px solid var(--border)', background: activo ? 'rgba(0,79,163,0.04)' : 'var(--porcelain)' }}>
                                                    <td className="px-4 py-3">
                                                        <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                                            {row.nombre} {row.apellido}
                                                        </p>
                                                        <p className="text-[11px]" style={{ color: 'var(--ash)' }}>{row.banco_nombre}</p>
                                                    </td>
                                                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--ash)' }}>
                                                        V-{row.cedula}
                                                    </td>
                                                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--jet)' }}>
                                                        {row.numero_cuenta}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="text-xs px-2 py-0.5 rounded-md font-medium"
                                                            style={{ background: row.tipo_cuenta === 'CTE' ? 'var(--pb-light)' : '#f0fdf4', color: row.tipo_cuenta === 'CTE' ? 'var(--pb-mid)' : '#16a34a' }}>
                                                            {row.tipo_cuenta === 'CTE' ? 'Corriente' : 'Ahorro'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-1">
                                                            <span className="text-xs" style={{ color: 'var(--ash)' }}>$</span>
                                                            <input type="number" min="0" step="0.01" placeholder="0.00"
                                                                value={row.monto_usd}
                                                                onChange={e => setBancaribeRows(prev =>
                                                                    prev.map(r => r.id === row.id ? { ...r, monto_usd: e.target.value } : r)
                                                                )}
                                                                className="w-28 px-2 py-1.5 rounded-lg text-sm font-mono outline-none text-right"
                                                                style={{ border: `0.5px solid ${activo ? '#004FA3' : 'var(--border-md)'}`, background: 'var(--porcelain)', color: 'var(--jet)' }} />
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-sm font-mono" style={{ color: activo ? 'var(--jet)' : 'var(--ash)' }}>
                                                        {activo && tasaDia > 0 ? `${montoVes} Bs` : '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 flex justify-between items-center flex-shrink-0"
                            style={{ borderTop: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                            <p className="text-xs" style={{ color: 'var(--ash)' }}>
                                {bancaribeRows.filter(r => parseFloat(r.monto_usd) > 0).length} de {bancaribeRows.length} empleado(s) con monto
                            </p>
                            <div className="flex gap-2">
                                <button onClick={closeBancaribeModal}
                                    className="px-4 py-2 rounded-lg text-sm font-medium"
                                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                                    Cancelar
                                </button>
                                <button onClick={() => handleAbrirConcepto('incentivo')}
                                    disabled={bancaribeRows.length === 0}
                                    className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                                    style={{ background: '#004FA3' }}>
                                    <Download size={15} /> Generar TXT
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                MODAL 2 — NÓMINA
            ════════════════════════════════════════════════════════════ */}
            {showNominaModal && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
                    style={{ background: 'rgba(43,48,58,0.6)' }}
                    role="dialog" aria-modal="true" aria-label="Generar pago de Nómina">
                    <div className="w-full max-w-5xl rounded-2xl overflow-hidden shadow-2xl flex flex-col"
                        style={{ background: 'var(--porcelain)', maxHeight: '90vh' }}>

                        {/* Header */}
                        <div className="flex justify-between items-start px-6 py-4 flex-shrink-0"
                            style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-3">
                                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: '#6d28d9' }} />
                                    <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                        Nómina — Pago de Sueldo
                                    </h3>
                                </div>
                                {/* Selector de período */}
                                <div className="flex gap-1 ml-5">
                                    {PERIODOS.map(p => (
                                        <button key={p}
                                            onClick={() => handleNominaPeriodoChange(p)}
                                            className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
                                            style={{
                                                background: nominaPeriodo === p ? '#6d28d9' : 'var(--porcelain)',
                                                color:      nominaPeriodo === p ? '#fff' : 'var(--ash)',
                                                border:     `0.5px solid ${nominaPeriodo === p ? '#6d28d9' : 'var(--border-md)'}`,
                                            }}>
                                            {p}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button onClick={() => setShowNominaModal(false)} style={{ color: 'var(--ash)' }}
                                aria-label="Cerrar modal Nómina">
                                <X size={18} />
                            </button>
                        </div>

                        {/* Aviso si hay empleados sin calcular */}
                        {nominaRows.some(r => !r.calculado) && (
                            <div className="px-6 py-2 flex items-center gap-2 flex-shrink-0 text-xs"
                                style={{ background: '#fef9c3', color: '#92400e', borderBottom: '0.5px solid #fde047' }}>
                                <AlertCircle size={13} />
                                Algunos empleados no tienen datos suficientes para cálculo automático (sin categoría, H/Sem o sueldo base). Puedes ingresar el monto manualmente.
                            </div>
                        )}

                        {/* Tabla */}
                        <div className="overflow-y-auto flex-1">
                            <table className="w-full text-left">
                                <thead className="sticky top-0" style={{ background: 'var(--porcelain)', zIndex: 1 }}>
                                    <tr>
                                        {['Empleado', 'Tipo', 'Cálculo', `Monto ${nominaPeriodo} (Bs)`, 'Cuenta Bancaribe', 'TXT'].map(h => (
                                            <th key={h} className="px-4 py-3 text-[11px] uppercase tracking-widest"
                                                style={{ color: 'var(--ash)', borderBottom: '0.5px solid var(--border-md)' }}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {nominaRows.map(row => {
                                        const monto    = parseFloat(row.monto_bs) || 0;
                                        const enTXT    = monto > 0 && esBancaribe(row);
                                        return (
                                            <tr key={row.id}
                                                style={{ borderBottom: '0.5px solid var(--border)', background: enTXT ? 'rgba(109,40,217,0.03)' : 'var(--porcelain)' }}>
                                                <td className="px-4 py-3">
                                                    <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                                        {row.nombre} {row.apellido}
                                                    </p>
                                                    <p className="text-[11px] font-mono" style={{ color: 'var(--ash)' }}>
                                                        {row.cedula}
                                                    </p>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="text-xs px-2 py-0.5 rounded-md"
                                                        style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}>
                                                        {TIPO_LABEL[row.tipo_personal] || row.tipo_personal}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="text-[11px] px-1.5 py-0.5 rounded"
                                                        style={{
                                                            background: row.calculado ? '#dcfce7' : '#fef9c3',
                                                            color:      row.calculado ? '#15803d' : '#92400e',
                                                        }}>
                                                        {row.calculado ? 'Auto' : 'Manual'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <input type="number" min="0" step="0.01" placeholder="0.00"
                                                        value={row.monto_bs}
                                                        onChange={e => setNominaRows(prev =>
                                                            prev.map(r => r.id === row.id ? { ...r, monto_bs: e.target.value, calculado: false } : r)
                                                        )}
                                                        className="w-32 px-2 py-1.5 rounded-lg text-sm font-mono outline-none text-right"
                                                        style={{ border: `0.5px solid ${monto > 0 ? '#6d28d9' : 'var(--border-md)'}`, background: 'var(--porcelain)', color: 'var(--jet)' }} />
                                                </td>
                                                <td className="px-4 py-3">
                                                    {row.numero_cuenta
                                                        ? <span className="text-xs font-mono" style={{ color: esBancaribe(row) ? '#004FA3' : 'var(--ash)' }}>
                                                            {row.numero_cuenta}
                                                        </span>
                                                        : <span className="text-xs" style={{ color: 'var(--ash)' }}>—</span>
                                                    }
                                                </td>
                                                <td className="px-4 py-3">
                                                    {enTXT
                                                        ? <span className="flex items-center gap-1 text-xs" style={{ color: '#15803d' }}>
                                                            <Check size={12} /> Incluido
                                                        </span>
                                                        : <span className="text-xs" style={{ color: 'var(--ash)' }}>
                                                            {!esBancaribe(row) ? 'Sin cta. Bancaribe' : 'Sin monto'}
                                                        </span>
                                                    }
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 flex justify-between items-center flex-shrink-0"
                            style={{ borderTop: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                            <div className="text-xs space-y-0.5" style={{ color: 'var(--ash)' }}>
                                <p>
                                    {nominaRows.filter(r => parseFloat(r.monto_bs) > 0 && esBancaribe(r)).length} empleado(s) en TXT
                                    {' · '}
                                    Total: <span className="font-mono font-medium" style={{ color: 'var(--jet)' }}>
                                        {fmtBs(nominaRows.reduce((s, r) => s + (parseFloat(r.monto_bs) || 0), 0))} Bs
                                    </span>
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setShowNominaModal(false)}
                                    className="px-4 py-2 rounded-lg text-sm font-medium"
                                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                                    Cancelar
                                </button>
                                <button onClick={() => handleAbrirConcepto('nomina')}
                                    className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white"
                                    style={{ background: '#6d28d9' }}>
                                    <Download size={15} /> Generar TXT
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                MODAL 3 — CESTATICKET
            ════════════════════════════════════════════════════════════ */}
            {showCestaModal && cestaConfigState && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
                    style={{ background: 'rgba(43,48,58,0.6)' }}
                    role="dialog" aria-modal="true" aria-label="Generar pago de Cestaticket">
                    <div className="w-full max-w-5xl rounded-2xl overflow-hidden shadow-2xl flex flex-col"
                        style={{ background: 'var(--porcelain)', maxHeight: '90vh' }}>

                        {/* Header */}
                        <div className="flex justify-between items-start px-6 py-4 flex-shrink-0"
                            style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-3">
                                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: '#16a34a' }} />
                                    <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                        Cestaticket — Bono Alimentario
                                    </h3>
                                </div>
                                <p className="text-xs ml-5" style={{ color: 'var(--ash)' }}>
                                    Tasa BCV: <span className="font-mono font-medium" style={{ color: 'var(--jet)' }}>
                                        {parseFloat(cestaConfigState.tasa_bcv).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs/USD
                                    </span>
                                    {' · '}
                                    Tarifa/hora: <span className="font-mono font-medium" style={{ color: 'var(--jet)' }}>
                                        {cestaConfigState.tarifa_hora} Bs/h
                                    </span>
                                    {' · '}
                                    <button
                                        onClick={() => { setCestaFormLocal({ ...cestaConfigState }); setShowCestaConfigModal(true); }}
                                        className="underline underline-offset-2"
                                        style={{ color: 'var(--pb)' }}>
                                        Editar configuración
                                    </button>
                                </p>
                            </div>
                            <button onClick={() => setShowCestaModal(false)} style={{ color: 'var(--ash)' }}
                                aria-label="Cerrar modal Cestaticket">
                                <X size={18} />
                            </button>
                        </div>

                        {/* Aviso si hay empleados sin monto configurado */}
                        {cestaRows.some(r => !r.ok_cesta) && (
                            <div className="px-6 py-2 flex items-center gap-2 flex-shrink-0 text-xs"
                                style={{ background: '#fef9c3', color: '#92400e', borderBottom: '0.5px solid #fde047' }}>
                                <AlertCircle size={13} />
                                Algunos empleados no tienen monto USD configurado para su estamento. Usa el botón "Configurar" en esta página.
                            </div>
                        )}

                        {/* Tabla */}
                        <div className="overflow-y-auto flex-1">
                            <table className="w-full text-left">
                                <thead className="sticky top-0" style={{ background: 'var(--porcelain)', zIndex: 1 }}>
                                    <tr>
                                        {['Empleado', 'Tipo', 'Total Bs', 'H/Mens Inasistencia', 'Descuento', 'Neto a Recibir', 'TXT'].map(h => (
                                            <th key={h} className="px-4 py-3 text-[11px] uppercase tracking-widest"
                                                style={{ color: 'var(--ash)', borderBottom: '0.5px solid var(--border-md)' }}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {cestaRows.map(row => {
                                        const tarifaHora  = parseFloat(cestaConfigState.tarifa_hora) || 0.20;
                                        const hsInasist   = parseFloat(row.hs_inasistencia) || 0;
                                        const descuento   = parseFloat((hsInasist * tarifaHora).toFixed(2)); // PRD: horas × Bs/hora
                                        const neto        = getCestaMontoFinal(row, cestaConfigState);
                                        const enTXT      = neto > 0 && esBancaribe(row);
                                        return (
                                            <tr key={row.id}
                                                style={{ borderBottom: '0.5px solid var(--border)', background: enTXT ? 'rgba(22,163,74,0.03)' : 'var(--porcelain)' }}>
                                                <td className="px-4 py-3">
                                                    <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                                        {row.nombre} {row.apellido}
                                                    </p>
                                                    <p className="text-[11px] font-mono" style={{ color: 'var(--ash)' }}>
                                                        {row.cedula}
                                                    </p>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="text-xs px-2 py-0.5 rounded-md"
                                                        style={{ background: '#dcfce7', color: '#15803d' }}>
                                                        {TIPO_LABEL[row.tipo_personal] || row.tipo_personal}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-sm font-mono"
                                                    style={{ color: row.ok_cesta ? 'var(--jet)' : 'var(--ash)' }}>
                                                    {row.ok_cesta ? `${fmtBs(row.cesta_total_bs)} Bs` : '—'}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <input type="number" min="0" step="0.5" placeholder="0"
                                                        value={row.hs_inasistencia}
                                                        onChange={e => setCestaRows(prev =>
                                                            prev.map(r => r.id === row.id ? { ...r, hs_inasistencia: e.target.value } : r)
                                                        )}
                                                        className="w-20 px-2 py-1.5 rounded-lg text-sm font-mono outline-none text-right"
                                                        style={{ border: `0.5px solid ${hsInasist > 0 ? '#b45309' : 'var(--border-md)'}`, background: 'var(--porcelain)', color: 'var(--jet)' }} />
                                                </td>
                                                <td className="px-4 py-3 text-sm font-mono"
                                                    style={{ color: descuento > 0 ? '#dc2626' : 'var(--ash)' }}>
                                                    {descuento > 0 ? `−${fmtBs(descuento)} Bs` : '—'}
                                                </td>
                                                <td className="px-4 py-3 text-sm font-mono font-semibold"
                                                    style={{ color: neto > 0 ? '#15803d' : 'var(--ash)' }}>
                                                    {row.ok_cesta ? `${fmtBs(neto)} Bs` : '—'}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {enTXT
                                                        ? <span className="flex items-center gap-1 text-xs" style={{ color: '#15803d' }}>
                                                            <Check size={12} /> Incluido
                                                        </span>
                                                        : <span className="text-xs" style={{ color: 'var(--ash)' }}>
                                                            {!esBancaribe(row) ? 'Sin cta. Bancaribe' : 'Sin monto'}
                                                        </span>
                                                    }
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 flex justify-between items-center flex-shrink-0"
                            style={{ borderTop: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                            <div className="text-xs" style={{ color: 'var(--ash)' }}>
                                {cestaRows.filter(r => getCestaMontoFinal(r, cestaConfigState) > 0 && esBancaribe(r)).length} empleado(s) en TXT
                                {' · '}
                                Total: <span className="font-mono font-medium" style={{ color: 'var(--jet)' }}>
                                    {fmtBs(cestaRows.reduce((s, r) => s + getCestaMontoFinal(r, cestaConfigState), 0))} Bs
                                </span>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setShowCestaModal(false)}
                                    className="px-4 py-2 rounded-lg text-sm font-medium"
                                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                                    Cancelar
                                </button>
                                <button onClick={() => handleAbrirConcepto('cesta')}
                                    className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white"
                                    style={{ background: '#16a34a' }}>
                                    <Download size={15} /> Generar TXT
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                MODAL CONCEPTO — compartido por las 3 secciones
            ════════════════════════════════════════════════════════════ */}
            {showConceptoModal && (
                <div className="fixed inset-0 flex items-center justify-center z-[60] p-4"
                    style={{ background: 'rgba(43,48,58,0.7)' }}
                    role="dialog" aria-modal="true" aria-label="Concepto de pago">
                    <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl"
                        style={{ background: 'var(--porcelain)' }}>
                        <div className="flex justify-between items-center px-5 py-4"
                            style={{ borderBottom: '0.5px solid var(--border)' }}>
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{
                                    background: conceptoFor === 'incentivo' ? '#004FA3'
                                              : conceptoFor === 'nomina'    ? '#6d28d9'
                                              : '#16a34a',
                                }} />
                                <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                    Concepto de pago
                                </h3>
                                <span className="text-xs px-2 py-0.5 rounded-full capitalize"
                                    style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}>
                                    {conceptoFor}
                                </span>
                            </div>
                            <button onClick={() => { setShowConceptoModal(false); setConceptoPago(''); }}
                                style={{ color: 'var(--ash)' }}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <p className="text-xs" style={{ color: 'var(--ash)' }}>
                                Aparecerá en la planilla PDF. Ej: <em>Nómina I Quincena Junio 2026</em>
                            </p>
                            <div>
                                <label className={`block ${labelCls}`} style={labelStyle}>
                                    Concepto <span style={{ color: 'var(--red)' }}>*</span>
                                </label>
                                <input type="text" autoFocus
                                    placeholder="Ej: Nómina I Quincena Junio 2026"
                                    value={conceptoPago}
                                    onChange={e => setConceptoPago(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleConfirmarGeneracion()}
                                    className={inputCls} style={inputStyle} />
                            </div>
                            <div className="flex gap-2 pt-1">
                                <button type="button"
                                    onClick={() => { setShowConceptoModal(false); setConceptoPago(''); }}
                                    className="flex-1 py-2 rounded-lg text-sm font-medium"
                                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                                    Cancelar
                                </button>
                                <button type="button" onClick={handleConfirmarGeneracion}
                                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium text-white"
                                    style={{
                                        background: conceptoFor === 'incentivo' ? '#004FA3'
                                                  : conceptoFor === 'nomina'    ? '#6d28d9'
                                                  : '#16a34a',
                                    }}>
                                    <Download size={14} /> Descargar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                MODAL — CONFIGURACIÓN CESTA TICKET
            ════════════════════════════════════════════════════════════ */}
            {showCestaConfigModal && (
                <div className="fixed inset-0 flex items-center justify-center z-[70] p-4"
                    style={{ background: 'rgba(43,48,58,0.65)' }}
                    role="dialog" aria-modal="true" aria-label="Configuración de Cesta Ticket">
                    <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl flex flex-col"
                        style={{ background: 'var(--porcelain)', maxHeight: '92vh' }}>

                        <div className="flex justify-between items-center px-6 py-4 flex-shrink-0"
                            style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                            <div className="flex items-center gap-2">
                                <DollarSign size={16} style={{ color: 'var(--pb)' }} />
                                <div>
                                    <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                        Configuración de Cesta Ticket
                                    </h3>
                                    <p className="text-[11px]" style={{ color: 'var(--ash)' }}>
                                        Monto en USD por estamento · Se guarda localmente
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => setShowCestaConfigModal(false)} style={{ color: 'var(--ash)' }}
                                aria-label="Cerrar configuración de cesta ticket">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-6 space-y-5 overflow-y-auto flex-1">

                            {/* Tabla AVEC: costo/hora por categoría */}
                            <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)' }}>
                                <div className="px-4 py-2.5"
                                    style={{ background: 'var(--pb-light)', borderBottom: '0.5px solid var(--border-md)' }}>
                                    <p className="text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--pb-mid)' }}>
                                        Tabla AVEC — Costo por Hora según Categoría
                                    </p>
                                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--ash)' }}>
                                        Sueldo Base = Costo/Hora[categoría] × N° H/Sem del docente
                                    </p>
                                </div>
                                <div className="divide-y" style={{ background: 'var(--porcelain)' }}>
                                    {CATEGORIAS_DOCENTE.map((cat, i) => {
                                        const valor   = cestaFormLocal.categorias?.[cat]?.costo_hora || '';
                                        const ejemplo = valor
                                            ? `Ej: ${parseFloat(valor).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs/h × 36 h = ${(parseFloat(valor)*36).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs`
                                            : null;
                                        return (
                                            <div key={cat} className="flex items-center gap-3 px-4 py-2.5">
                                                <span className="text-xs font-medium w-16 flex-shrink-0 px-2 py-0.5 rounded text-center"
                                                    style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}>
                                                    {cat}
                                                </span>
                                                <div className="flex-1 flex items-center gap-1.5">
                                                    <input type="number" step="0.01" min="0"
                                                        placeholder="Bs/hora"
                                                        autoFocus={i === 0}
                                                        value={valor}
                                                        onChange={e => handleCestaConfigFormChange(`categorias.${cat}.costo_hora`, e.target.value)}
                                                        className="w-32 px-2.5 py-1.5 rounded-lg text-sm font-mono outline-none"
                                                        style={{ border: `0.5px solid ${valor ? 'var(--pb)' : 'var(--border-md)'}`, background: 'var(--porcelain)', color: 'var(--jet)' }}
                                                        aria-label={`Costo por hora categoría ${cat}`} />
                                                    <span className="text-[11px]" style={{ color: 'var(--ash)' }}>Bs/hora</span>
                                                </div>
                                                {ejemplo && (
                                                    <span className="text-[10px] font-mono text-right hidden sm:block"
                                                        style={{ color: 'var(--ash)' }}>{ejemplo}</span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Tarifa/hora + Horas/día — PRD §5.3 */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={`block ${labelCls}`} style={labelStyle}>
                                        Monto por Hora (Bs)
                                    </label>
                                    <input type="number" step="0.01" min="0" placeholder="0.20"
                                        value={cestaFormLocal.tarifa_hora}
                                        onChange={e => handleCestaConfigFormChange('tarifa_hora', e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                                        aria-label="Monto por hora del beneficio de alimentación en Bs" />
                                    <p className="text-[10px] mt-1" style={{ color: 'var(--ash)' }}>
                                        Tarifa unitaria — cuerpo del recibo
                                    </p>
                                </div>
                                <div>
                                    <label className={`block ${labelCls}`} style={labelStyle}>
                                        Horas por Día (base)
                                    </label>
                                    <input type="number" step="0.01" min="0" placeholder="6.67"
                                        value={cestaFormLocal.horas_por_dia ?? ''}
                                        onChange={e => handleCestaConfigFormChange('horas_por_dia', e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none"
                                        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                                        aria-label="Horas por día base para calcular costo diario" />
                                    <p className="text-[10px] mt-1" style={{ color: 'var(--ash)' }}>
                                        Costo diario = Monto/hora × H/día
                                    </p>
                                </div>
                            </div>
                            {/* Preview costo diario calculado */}
                            {parseFloat(cestaFormLocal.tarifa_hora) > 0 && parseFloat(cestaFormLocal.horas_por_dia) > 0 && (
                                <p className="text-[10px] px-2 py-1 rounded" style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}>
                                    Costo diario calculado:{' '}
                                    <strong>
                                        {(parseFloat(cestaFormLocal.tarifa_hora) * parseFloat(cestaFormLocal.horas_por_dia))
                                            .toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs/día
                                    </strong>
                                </p>
                            )}

                            {/* Tasa BCV */}
                            <div>
                                <label className={`block ${labelCls} font-medium`} style={labelStyle}>
                                    Tasa BCV del día (Bs/USD) <span style={{ color: 'var(--red)' }}>*</span>
                                </label>
                                <input type="number" step="0.01" min="0" placeholder="Ej: 91.50"
                                    value={cestaFormLocal.tasa_bcv}
                                    onChange={e => handleCestaConfigFormChange('tasa_bcv', e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none"
                                    style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                                    aria-label="Tasa BCV del día en Bs por USD" />
                                <p className="text-[10px] mt-1" style={{ color: 'var(--ash)' }}>
                                    Total Cesta (Bs) = Monto USD × Tasa BCV. Se aplica a todos los estamentos.
                                </p>
                            </div>

                            {/* Monto USD por estamento */}
                            <div className="space-y-3">
                                <p className="text-[11px] uppercase tracking-widest font-medium"
                                    style={{ color: 'var(--ash)', opacity: 0.7 }}>
                                    Monto Cesta Ticket (USD) por Estamento
                                </p>
                                {TABS_CESTA.map(tab => {
                                    const Icon     = tab.icon;
                                    const montoUsd = parseFloat(cestaFormLocal[tab.key]?.monto_usd) || 0;
                                    const tasa     = parseFloat(cestaFormLocal.tasa_bcv) || 0;
                                    const totalBs  = montoUsd > 0 && tasa > 0 ? montoUsd * tasa : null;
                                    return (
                                        <div key={tab.key} className="rounded-xl p-3 space-y-2"
                                            style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                                            <div className="flex items-center gap-2">
                                                <Icon size={14} style={{ color: 'var(--pb)' }} />
                                                <span className="text-xs font-medium" style={{ color: 'var(--jet)' }}>
                                                    {tab.label}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-mono" style={{ color: 'var(--ash)' }}>USD $</span>
                                                <input type="number" step="0.01" min="0" placeholder="0.00"
                                                    value={cestaFormLocal[tab.key]?.monto_usd || ''}
                                                    onChange={e => handleCestaConfigFormChange(`${tab.key}.monto_usd`, e.target.value)}
                                                    className="flex-1 px-3 py-1.5 rounded-lg text-sm font-mono outline-none"
                                                    style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                                                    aria-label={`Monto cesta ticket USD para ${tab.label}`} />
                                                {totalBs !== null && (
                                                    <span className="text-xs font-mono font-medium px-2 py-1 rounded-lg flex-shrink-0"
                                                        style={{ background: '#dcfce7', color: '#15803d' }}>
                                                        = {totalBs.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="px-6 py-4 flex justify-end gap-2 flex-shrink-0"
                            style={{ borderTop: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                            <button onClick={() => setShowCestaConfigModal(false)}
                                className="px-4 py-2 rounded-lg text-sm font-medium"
                                style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                                Cancelar
                            </button>
                            <button onClick={handleSaveCestaConfig}
                                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white"
                                style={{ background: 'var(--pb)' }}>
                                <Settings2 size={14} /> Guardar configuración
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default Pagos;
