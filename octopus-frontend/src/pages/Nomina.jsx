import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    Download, Loader2, RefreshCcw, Plus, X,
    FileSpreadsheet, Pencil, GraduationCap, Briefcase, Wrench,
    Receipt, Search, DollarSign,
} from 'lucide-react';
import { toast } from 'react-toastify';

import { useNomina } from '../hooks/useNomina';
import { EmpleadoForm } from '../components/nomina/EmpleadoForm';
import {
    fmtBs, generarReciboAVECPDF, generarReciboSimplePDF,
} from '../utils/nominaPDF';
import {
    SSO_TOPE, SSO_PCT, SPF_PCT, FAOV_PCT,
    calcAVEC, calcSueldoBase,
    loadCestaConfig, EMPTY_RECIBO,
} from '../constants/avec';

// ── Tabs de estamento ────────────────────────────────────────────────────────
const TABS = [
    { key: 'docente',        label: 'Docente',           icon: GraduationCap },
    { key: 'apoyo',          label: 'Personal de Apoyo', icon: Wrench },
    { key: 'administrativo', label: 'Administrativo',    icon: Briefcase },
];

// ── Cierra el modal activo cuando se presiona Escape ─────────────────────────
function useEscape(isOpen, onClose) {
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [isOpen, onClose]);
}

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

// ── Componente principal ─────────────────────────────────────────────────────
const Nomina = () => {
    const {
        empleados, bancosNomina, loading, refetch,
        busqueda, setBusqueda, empleadosPorTab,
        exportingExcel, handleExportExcel,
        showRegisterModal, setShowRegisterModal,
        newEmployeeData, handleNewChange,
        isRegistering, handleRegisterEmployee, handleOpenRegisterModal, handleCloseRegisterModal,
        showEditModal, editEmployeeData, handleEditChange,
        isSaving, handleOpenEditModal, handleSaveEmployee, handleCloseEditModal,
    } = useNomina();

    const [activeTab, setActiveTab] = useState('docente');

    // ── Cesta ticket config (solo lectura — se edita en Pagos) ───────────────
    const [cestaConfig] = useState(loadCestaConfig);

    // ── Recibo de pago ────────────────────────────────────────────────────────
    const [showReciboModal, setShowReciboModal] = useState(false);
    const [reciboEmp,       setReciboEmp]       = useState(null);
    const [reciboData,      setReciboData]       = useState(EMPTY_RECIBO);

    const handleOpenRecibo = (emp) => {
        setReciboEmp(emp);
        const tipo = emp.tipo_personal || 'docente';
        setReciboData({
            ...EMPTY_RECIBO,
            mes:             format(new Date(), 'MMMM yyyy', { locale: es }).toUpperCase(),
            cesta_monto_usd: cestaConfig[tipo]?.monto_usd || '',
            cesta_tasa:      cestaConfig.tasa_bcv          || '',
        });
        setShowReciboModal(true);
    };

    const handleReciboChange = (e) => {
        const { name, value } = e.target;
        setReciboData(prev => ({ ...prev, [name]: value }));
    };

    const reciboCalc = useMemo(() => {
        if (!reciboData || !reciboEmp) return null;
        const esDocente = !reciboEmp.tipo_personal || reciboEmp.tipo_personal === 'docente';

        // PRD §5.3 + §6.5: dos escalas independientes
        // Escala 1 — tarifa en Bs (cuerpo del recibo)
        const tarifaHora  = parseFloat(cestaConfig.tarifa_hora)       || 0.20; // Bs/hora directo
        const horasPorDia = parseFloat(cestaConfig.horas_por_dia)     || 6.67; // parámetro configurable
        const costoDiario = tarifaHora * horasPorDia;                          // Bs/día
        const hsInasist   = parseFloat(reciboData.horas_inasistencia)  || 0;
        const descuento   = hsInasist * tarifaHora;                            // horas × Bs/hora
        // Escala 2 — total en otra unidad (monto_usd × tasa)
        const cestaUsd    = parseFloat(reciboData.cesta_monto_usd)     || 0;
        const cestaTasa   = parseFloat(reciboData.cesta_tasa)          || 0;
        const totalBs     = cestaUsd * cestaTasa;
        const totalRecibir = Math.max(totalBs - descuento, 0);
        const cesta = { tarifaHora, costoDiario, totalBs, hsInasistencia: hsInasist, descuento, totalRecibir };

        if (esDocente) {
            const sueldoBase = calcSueldoBase(cestaConfig, reciboEmp.categoria_docente, reciboEmp.horas_semanales);
            const avec = calcAVEC(sueldoBase, reciboEmp.categoria_docente, reciboEmp.anos_servicio,
                reciboEmp.numero_hijos, reciboEmp.titulo);
            return { ...avec, sueldoBase, esDocente: true, cesta };
        }

        const sueldoBase = parseFloat(reciboData.sueldo_base_simple) || 0;
        const otrasDed   = parseFloat(reciboData.otras_deducciones)  || 0;
        const sso        = Math.min(sueldoBase * SSO_PCT, SSO_TOPE);
        const spf        = sueldoBase * SPF_PCT;
        const faov       = sueldoBase * FAOV_PCT;
        const totalRet   = sso + spf + faov + otrasDed;
        const neto       = sueldoBase - totalRet;
        return { sueldoBase, sso, spf, faov, otrasDed, totalRet, neto, esDocente: false, cesta };
    }, [reciboData, reciboEmp, cestaConfig]);

    const handleGenerarRecibo = () => {
        if (!reciboData.mes)  { toast.warning('Ingresa el período (mes).'); return; }
        if (!reciboCalc)      { toast.error('Error en el cálculo.'); return; }

        if (reciboCalc.esDocente) {
            if (!reciboEmp.categoria_docente) {
                toast.warning('El docente no tiene categoría. Edita su ficha primero.'); return;
            }
            const costoHoraCat = parseFloat(cestaConfig.categorias?.[reciboEmp.categoria_docente]?.costo_hora) || 0;
            if (!costoHoraCat) {
                toast.warning(`Configura el Costo/Hora para ${reciboEmp.categoria_docente} en "Cesta Ticket".`); return;
            }
            if (!reciboEmp.horas_semanales) {
                toast.warning(`${reciboEmp.nombre} no tiene H/Sem registradas. Edita su ficha primero.`); return;
            }
            if (reciboCalc.sueldoBase <= 0) {
                toast.error('Sueldo base resultó en 0. Verifica el costo/hora y las H/Sem.'); return;
            }
            generarReciboAVECPDF(reciboEmp, { ...reciboData, sueldo_base: String(reciboCalc.sueldoBase) },
                reciboCalc, reciboCalc.cesta);
        } else {
            if (!reciboData.sueldo_base_simple || parseFloat(reciboData.sueldo_base_simple) <= 0) {
                toast.warning('Ingresa el sueldo / salario bruto mensual.'); return;
            }
            generarReciboSimplePDF(reciboEmp, {
                ...reciboData,
                sueldo_base:       reciboData.sueldo_base_simple,
                otras_deducciones: reciboData.otras_deducciones,
            });
        }

        toast.success('Recibo generado correctamente.');
        setShowReciboModal(false);
    };

    // ── Escape en modales ─────────────────────────────────────────────────────
    useEscape(showRegisterModal, handleCloseRegisterModal);
    useEscape(showEditModal,     handleCloseEditModal);
    useEscape(showReciboModal,   () => setShowReciboModal(false));

    // ── Estilos reutilizables ─────────────────────────────────────────────────
    const inputCls   = 'w-full px-3 py-2 rounded-lg text-sm outline-none';
    const inputStyle = { border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' };
    const labelCls   = 'block text-[11px] uppercase tracking-widest mb-1.5';
    const labelStyle = { color: 'var(--ash)' };

    if (loading) return (
        <div className="flex flex-col items-center justify-center p-20">
            <Loader2 className="animate-spin mb-3" size={36} style={{ color: 'var(--pb)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--ash)' }}>Cargando nómina...</p>
        </div>
    );

    const tabEmpleados = empleadosPorTab[activeTab] || [];
    const isDocente    = activeTab === 'docente';

    return (
        <div className="animate-fadeIn">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-lg font-medium" style={{ color: 'var(--jet)' }}>
                        Gestión de Nómina
                    </h2>
                    <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>
                        Registro y administración del personal
                    </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button onClick={refetch} aria-label="Recargar listado de empleados"
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                        <RefreshCcw size={16} />
                    </button>

                    <button onClick={handleExportExcel} disabled={exportingExcel || empleados.length === 0}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                        style={{ background: 'var(--jet)' }}>
                        {exportingExcel ? <Loader2 className="animate-spin" size={16} /> : <FileSpreadsheet size={16} />}
                        {exportingExcel ? 'Exportando...' : 'Excel'}
                    </button>
                </div>
            </div>

            {/* ── Stat cards ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
                {TABS.map(t => {
                    const Icon = t.icon;
                    return (
                        <div key={t.key} className="rounded-xl p-4"
                            style={{ background: 'var(--porcelain)', border: `0.5px solid ${activeTab === t.key ? 'var(--pb)' : 'var(--border-md)'}` }}>
                            <p className="text-[11px] uppercase tracking-widest mb-2" style={{ color: 'var(--ash)' }}>
                                {t.label}
                            </p>
                            <div className="flex items-center gap-2">
                                <Icon size={18} style={{ color: 'var(--pb)' }} />
                                <p className="text-lg font-medium" style={{ color: 'var(--jet)' }}>
                                    {(empleadosPorTab[t.key] || []).length} empleados
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── Búsqueda + Tabs ──────────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
                {/* Search */}
                <div className="relative w-full sm:w-64">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ color: 'var(--ash)' }} />
                    <input
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        placeholder="Buscar nombre, cédula, cargo…"
                        className="w-full pl-8 pr-3 py-2 rounded-lg text-sm outline-none"
                        style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' }}
                        aria-label="Buscar empleados"
                    />
                </div>

                {/* Tabs + botón añadir */}
                <div className="flex items-center gap-2">
                    <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--porcelain)', border: '0.5px solid var(--border-md)' }}>
                        {TABS.map(t => {
                            const Icon   = t.icon;
                            const active = activeTab === t.key;
                            return (
                                <button key={t.key} onClick={() => setActiveTab(t.key)}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                                    style={{ background: active ? 'var(--pb)' : 'transparent', color: active ? '#fff' : 'var(--ash)' }}>
                                    <Icon size={14} />
                                    {t.label}
                                    <span className="text-xs px-1.5 py-0.5 rounded-full ml-1"
                                        style={{ background: active ? 'rgba(255,255,255,0.2)' : 'var(--border-md)', color: active ? '#fff' : 'var(--ash)' }}>
                                        {(empleadosPorTab[t.key] || []).length}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <button
                        onClick={() => handleOpenRegisterModal(activeTab)}
                        className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors"
                        style={{ background: 'var(--pb)', color: '#fff' }}
                        title={`Registrar ${TABS.find(t => t.key === activeTab)?.label}`}
                        aria-label={`Registrar ${TABS.find(t => t.key === activeTab)?.label}`}>
                        <Plus size={16} />
                    </button>
                </div>
            </div>

            {/* ── Tabla de empleados ───────────────────────────────────────── */}
            <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr>
                                {['Empleado', 'Cargo', isDocente ? 'Categoría / Años' : 'Detalles', 'Banco', 'N° Cuenta', 'Acción'].map(h => (
                                    <th key={h} className="px-4 py-3 text-[11px] uppercase tracking-widest"
                                        style={{ color: 'var(--ash)', background: 'var(--porcelain)', borderBottom: '0.5px solid var(--border-md)' }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {tabEmpleados.length > 0 ? tabEmpleados.map(emp => (
                                <tr key={emp.id} style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                                    <td className="px-4 py-3">
                                        <p className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                            {emp.nombre} {emp.apellido}
                                        </p>
                                        <p className="text-xs font-mono" style={{ color: 'var(--ash)' }}>
                                            V-{emp.cedula}
                                        </p>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-xs px-2 py-1 rounded-md"
                                            style={{ background: 'var(--pb-light)', color: 'var(--pb-mid)' }}>
                                            {emp.cargo}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        {isDocente ? (
                                            <div>
                                                <p className="text-xs font-medium" style={{ color: 'var(--jet)' }}>
                                                    {emp.categoria_docente || <span style={{ color: 'var(--ash)' }}>—</span>}
                                                </p>
                                                {emp.anos_servicio && (
                                                    <p className="text-[11px]" style={{ color: 'var(--ash)' }}>
                                                        {emp.anos_servicio} años servicio
                                                    </p>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-xs" style={{ color: 'var(--ash)' }}>
                                                {emp.correo || emp.telefono || '—'}
                                            </p>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--jet)' }}>
                                        {emp.banco_nombre || <span style={{ color: 'var(--ash)' }}>—</span>}
                                    </td>
                                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--jet)' }}>
                                        {emp.numero_cuenta || <span style={{ color: 'var(--ash)' }}>—</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => handleOpenEditModal(emp)}
                                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
                                                style={{ color: 'var(--jet)', border: '0.5px solid var(--border-md)' }}
                                                aria-label={`Editar a ${emp.nombre} ${emp.apellido}`}>
                                                <Pencil size={12} /> Editar
                                            </button>
                                            <button onClick={() => handleOpenRecibo(emp)}
                                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                                                style={{ background: 'var(--pb)' }}
                                                aria-label={`Generar recibo de ${emp.nombre} ${emp.apellido}`}>
                                                <Receipt size={12} /> Recibo
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan="6" className="px-4 py-16 text-center text-sm" style={{ color: 'var(--ash)' }}>
                                        {busqueda
                                            ? `Sin resultados para "${busqueda}".`
                                            : `No hay personal ${TABS.find(t => t.key === activeTab)?.label.toLowerCase()} registrado.`
                                        }
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ════════════════════════════════════════════════════════════
                MODAL — RECIBO DE PAGO
            ════════════════════════════════════════════════════════════ */}
            {showReciboModal && reciboEmp && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
                    style={{ background: 'rgba(43,48,58,0.65)' }}
                    role="dialog" aria-modal="true" aria-label="Generar recibo de pago">
                    <div className="w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl flex flex-col"
                        style={{ background: 'var(--porcelain)', maxHeight: '92vh' }}>

                        <div className="flex justify-between items-center px-6 py-4 flex-shrink-0"
                            style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                            <div>
                                <div className="flex items-center gap-2">
                                    <Receipt size={16} style={{ color: 'var(--pb)' }} />
                                    <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                        Generar Recibo — {reciboEmp.apellido} {reciboEmp.nombre}
                                    </h3>
                                </div>
                                <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>
                                    {reciboEmp.cedula} · {reciboEmp.cargo} · {TABS.find(t => t.key === (reciboEmp.tipo_personal || 'docente'))?.label}
                                </p>
                            </div>
                            <button onClick={() => setShowReciboModal(false)} style={{ color: 'var(--ash)' }}
                                aria-label="Cerrar modal de recibo"><X size={18} /></button>
                        </div>

                        <div className="overflow-y-auto flex-1 p-6 space-y-4">

                            {/* Período */}
                            <div>
                                <label className={labelCls} style={labelStyle}>
                                    Período <span style={{ color: 'var(--red)' }}>*</span>
                                </label>
                                <input name="mes" value={reciboData.mes} onChange={handleReciboChange}
                                    placeholder="MAYO 2026" autoFocus
                                    className={inputCls} style={inputStyle} />
                            </div>

                            {/* Banner sueldo base — solo docentes */}
                            {(reciboEmp.tipo_personal === 'docente' || !reciboEmp.tipo_personal) && (() => {
                                const cat       = reciboEmp.categoria_docente;
                                const costoHora = parseFloat(cestaConfig.categorias?.[cat]?.costo_hora) || 0;
                                const hSem      = parseFloat(reciboEmp.horas_semanales) || 0;
                                const sb        = costoHora * hSem;
                                const ok        = costoHora > 0 && hSem > 0;
                                const warn      = !cat
                                    ? '⚠ El docente no tiene categoría — edita su ficha'
                                    : !costoHora
                                        ? `⚠ Configura el Costo/Hora para ${cat} en "Cesta Ticket"`
                                        : '⚠ El docente no tiene H/Sem registradas — edita su ficha';
                                return (
                                    <div className="rounded-xl p-3 flex items-center justify-between gap-3"
                                        style={{ background: ok ? 'var(--pb-light)' : '#fef9c3', border: `0.5px solid ${ok ? 'var(--border-md)' : '#fde047'}` }}>
                                        <div className="text-xs space-y-0.5">
                                            <p className="font-medium" style={{ color: ok ? 'var(--pb-mid)' : '#92400e' }}>
                                                Sueldo Base · Cat. {cat || '—'} · {hSem} H/Sem
                                            </p>
                                            <p style={{ color: 'var(--ash)' }}>
                                                {ok
                                                    ? `${costoHora.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs/h × ${hSem} h/sem`
                                                    : warn}
                                            </p>
                                        </div>
                                        <span className="font-mono font-bold text-base flex-shrink-0"
                                            style={{ color: ok ? 'var(--pb)' : '#b45309' }}>
                                            {ok ? `${sb.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs` : '—'}
                                        </span>
                                    </div>
                                );
                            })()}

                            {/* Sueldo bruto manual — solo Admin/Apoyo */}
                            {reciboEmp.tipo_personal && reciboEmp.tipo_personal !== 'docente' && (
                                <div className="rounded-xl p-4 space-y-3" style={{ border: '0.5px solid var(--border-md)' }}>
                                    <p className="text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>
                                        Datos salariales
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className={labelCls} style={labelStyle}>
                                                Sueldo / Salario Bruto (Bs) <span style={{ color: 'var(--red)' }}>*</span>
                                            </label>
                                            <input name="sueldo_base_simple" value={reciboData.sueldo_base_simple}
                                                onChange={handleReciboChange} type="number" step="0.01" min="0"
                                                placeholder="0.00" className={inputCls} style={inputStyle} />
                                        </div>
                                        <div>
                                            <label className={labelCls} style={labelStyle}>Otras Deducciones (Bs)</label>
                                            <input name="otras_deducciones" value={reciboData.otras_deducciones}
                                                onChange={handleReciboChange} type="number" step="0.01" min="0"
                                                placeholder="0.00" className={inputCls} style={inputStyle} />
                                        </div>
                                    </div>
                                    {reciboCalc && reciboCalc.sueldoBase > 0 && (
                                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs pt-1"
                                            style={{ borderTop: '0.5px solid var(--border-md)' }}>
                                            {[
                                                [`SSO (4%, tope ${SSO_TOPE} Bs)`, reciboCalc.sso],
                                                ['SPF (0,5%)',   reciboCalc.spf],
                                                ['FAOV (1%)',    reciboCalc.faov],
                                                ...(reciboCalc.otrasDed > 0 ? [['Otras ded.', reciboCalc.otrasDed]] : []),
                                                ['Total Ded.',   reciboCalc.totalRet],
                                            ].map(([lbl, val]) => (
                                                <div key={lbl} className="flex justify-between col-span-2 sm:col-span-1">
                                                    <span style={{ color: 'var(--ash)' }}>{lbl}</span>
                                                    <span className="font-mono" style={{ color: '#dc2626' }}>{fmtBs(val)}</span>
                                                </div>
                                            ))}
                                            <div className="flex justify-between col-span-2 font-bold pt-1 mt-1"
                                                style={{ borderTop: '0.5px solid var(--border-md)', color: 'var(--pb)' }}>
                                                <span>Neto a Depositar</span>
                                                <span className="font-mono">{fmtBs(reciboCalc.neto)}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Inasistencias */}
                            <div>
                                <label className={labelCls} style={labelStyle}>H/Mens de Inasistencia</label>
                                <input name="horas_inasistencia" value={reciboData.horas_inasistencia}
                                    onChange={handleReciboChange} type="number" step="0.5" min="0" placeholder="0"
                                    className={inputCls} style={inputStyle} />
                                <p className="text-[11px] mt-1" style={{ color: 'var(--ash)' }}>
                                    Horas totales no trabajadas en el mes (descuento proporcional de cesta ticket).
                                </p>
                            </div>

                            {/* Cesta ticket */}
                            <div className="rounded-xl p-4 space-y-3"
                                style={{ border: '0.5px solid var(--border-md)', background: 'var(--porcelain)' }}>
                                <div className="flex items-center gap-2">
                                    <DollarSign size={13} style={{ color: 'var(--pb)' }} />
                                    <span className="text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--ash)' }}>
                                        Cesta Ticket (Beneficio Alimentario)
                                    </span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className={labelCls} style={labelStyle}>Monto (USD)</label>
                                        <div className="flex items-center gap-1">
                                            <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--ash)' }}>$</span>
                                            <input name="cesta_monto_usd" value={reciboData.cesta_monto_usd}
                                                onChange={handleReciboChange} type="number" step="0.01" min="0"
                                                placeholder="0.00" className={inputCls} style={inputStyle} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className={labelCls} style={labelStyle}>Tasa BCV (Bs/USD)</label>
                                        <input name="cesta_tasa" value={reciboData.cesta_tasa}
                                            onChange={handleReciboChange} type="number" step="0.01" min="0"
                                            placeholder="0.00"
                                            className={inputCls} style={{ ...inputStyle, fontFamily: 'monospace' }} />
                                    </div>
                                </div>
                                {reciboCalc && reciboCalc.cesta.totalBs > 0 && (
                                    <div className="flex items-center justify-between text-xs px-3 py-2 rounded-lg"
                                        style={{ background: '#dcfce7', color: '#15803d' }}>
                                        <span>Total beneficio calculado</span>
                                        <span className="font-mono font-bold">
                                            {fmtBs(reciboCalc.cesta.totalBs)} Bs
                                            {reciboCalc.cesta.descuento > 0 && (
                                                <span className="ml-2 font-normal" style={{ color: '#b45309' }}>
                                                    − {fmtBs(reciboCalc.cesta.descuento)} desc.
                                                    = {fmtBs(reciboCalc.cesta.totalRecibir)} Bs neto
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Desglose AVEC — solo docentes */}
                            {reciboCalc && reciboCalc.esDocente && reciboCalc.sueldoBase > 0 && (
                                <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)' }}>
                                    <div className="px-4 py-2 flex items-center gap-2"
                                        style={{ background: 'var(--pb-light)', borderBottom: '0.5px solid var(--border-md)' }}>
                                        <Receipt size={13} style={{ color: 'var(--pb)' }} />
                                        <span className="text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--pb-mid)' }}>
                                            Desglose calculado automáticamente
                                        </span>
                                        <span className="text-[10px] ml-auto" style={{ color: 'var(--ash)' }}>
                                            {cestaConfig.categorias?.[reciboEmp.categoria_docente]?.costo_hora || '?'} Bs/h
                                            · {reciboEmp.categoria_docente || '—'}
                                            · {reciboEmp.horas_semanales} h/sem
                                            · {reciboEmp.anos_servicio || 0} años
                                            · {reciboEmp.numero_hijos || 0} hijo(s)
                                        </span>
                                    </div>
                                    <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-xs"
                                        style={{ background: 'var(--porcelain)' }}>
                                        <div className="space-y-1">
                                            <p className="text-[10px] uppercase tracking-widest mb-2 font-medium"
                                                style={{ color: 'var(--ash)', opacity: 0.7 }}>Asignaciones</p>
                                            {[
                                                ['Sueldo Base',            reciboCalc.sueldoBase],
                                                ['4A · Antigüedad',        reciboCalc.primaAnt],
                                                ['4B · Prima Docente',     reciboCalc.primaDoc],
                                                ['4C · Prima Geográfica',  reciboCalc.primaGeo],
                                                ['4D · Postgrado/Comp.',   reciboCalc.primaPos],
                                                ['4E · Ayuda Asistencial', reciboCalc.primaAsis],
                                                ['4F · Prima Hijos',       reciboCalc.primaHijos],
                                            ].map(([lbl, val]) => (
                                                <div key={lbl} className="flex justify-between">
                                                    <span style={{ color: val > 0 ? 'var(--jet)' : 'var(--ash)' }}>{lbl}</span>
                                                    <span className="font-mono" style={{ color: val > 0 ? 'var(--jet)' : 'var(--ash)' }}>
                                                        {fmtBs(val)}
                                                    </span>
                                                </div>
                                            ))}
                                            <div className="flex justify-between pt-1 mt-1 font-semibold"
                                                style={{ borderTop: '0.5px solid var(--border-md)', color: 'var(--jet)' }}>
                                                <span>Otras Asignaciones</span>
                                                <span className="font-mono">{fmtBs(reciboCalc.otrasAsig)}</span>
                                            </div>
                                            <div className="flex justify-between font-bold text-[13px]" style={{ color: 'var(--pb)' }}>
                                                <span>Total Asignaciones</span>
                                                <span className="font-mono">{fmtBs(reciboCalc.totalAsig)}</span>
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] uppercase tracking-widest mb-2 font-medium"
                                                style={{ color: 'var(--ash)', opacity: 0.7 }}>Retenciones</p>
                                            {[
                                                [`SSO (4%, tope ${SSO_TOPE} Bs)`, reciboCalc.sso],
                                                ['SPF (0,5%)', reciboCalc.spf],
                                                ['FAOV (1%)',  reciboCalc.faov],
                                            ].map(([lbl, val]) => (
                                                <div key={lbl} className="flex justify-between">
                                                    <span style={{ color: 'var(--jet)' }}>{lbl}</span>
                                                    <span className="font-mono" style={{ color: '#dc2626' }}>{fmtBs(val)}</span>
                                                </div>
                                            ))}
                                            <div className="flex justify-between font-semibold pt-1 mt-1"
                                                style={{ borderTop: '0.5px solid var(--border-md)', color: 'var(--jet)' }}>
                                                <span>Total Retenciones</span>
                                                <span className="font-mono" style={{ color: '#dc2626' }}>{fmtBs(reciboCalc.totalRet)}</span>
                                            </div>
                                            <div className="flex justify-between font-bold text-[13px] mt-2" style={{ color: 'var(--pb)' }}>
                                                <span>Neto a Depositar</span>
                                                <span className="font-mono">{fmtBs(reciboCalc.neto)}</span>
                                            </div>
                                            <div className="flex justify-between text-[11px]" style={{ color: 'var(--ash)' }}>
                                                <span>1ra Quincena</span>
                                                <span className="font-mono">{fmtBs(reciboCalc.quincena)}</span>
                                            </div>
                                            <div className="flex justify-between text-[11px]" style={{ color: 'var(--ash)' }}>
                                                <span>2da Quincena</span>
                                                <span className="font-mono">{fmtBs(reciboCalc.quincena)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-4 flex justify-end gap-2 flex-shrink-0"
                            style={{ borderTop: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                            <button onClick={() => setShowReciboModal(false)}
                                className="px-4 py-2 rounded-lg text-sm font-medium"
                                style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                                Cancelar
                            </button>
                            <button onClick={handleGenerarRecibo}
                                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white"
                                style={{ background: 'var(--pb)' }}>
                                <Download size={15} /> Descargar Recibo PDF
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                MODAL — EDITAR EMPLEADO
            ════════════════════════════════════════════════════════════ */}
            {showEditModal && editEmployeeData && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
                    style={{ background: 'rgba(43,48,58,0.5)' }}
                    role="dialog" aria-modal="true" aria-label="Editar empleado">
                    <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl flex flex-col"
                        style={{ background: 'var(--porcelain)', maxHeight: '92vh' }}>
                        <div className="flex justify-between items-center px-5 py-4 flex-shrink-0"
                            style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                            <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                Editar — {editEmployeeData.nombre} {editEmployeeData.apellido}
                            </h3>
                            <button onClick={handleCloseEditModal} style={{ color: 'var(--ash)' }}
                                aria-label="Cerrar modal de edición">
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveEmployee} className="p-5 overflow-y-auto flex-1">
                            <EmpleadoForm data={editEmployeeData} onChange={handleEditChange} bancosNomina={bancosNomina} showTipoSelect />
                            <div className="flex gap-2 pt-4">
                                <button type="button" onClick={handleCloseEditModal}
                                    className="flex-1 py-2 rounded-lg text-sm font-medium"
                                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                                    Cancelar
                                </button>
                                <button type="submit" disabled={isSaving}
                                    className="flex-1 py-2 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
                                    style={{ background: 'var(--pb)' }}>
                                    {isSaving ? <Loader2 className="animate-spin" size={15} /> : <Pencil size={15} />}
                                    {isSaving ? 'Guardando...' : 'Guardar cambios'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                MODAL — REGISTRAR EMPLEADO
            ════════════════════════════════════════════════════════════ */}
            {showRegisterModal && (
                <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
                    style={{ background: 'rgba(43,48,58,0.5)' }}
                    role="dialog" aria-modal="true" aria-label="Registrar empleado">
                    <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl flex flex-col"
                        style={{ background: 'var(--porcelain)', maxHeight: '92vh' }}>
                        <div className="flex justify-between items-center px-5 py-4 flex-shrink-0"
                            style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                            <h3 className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                Registrar {TABS.find(t => t.key === newEmployeeData.tipo_personal)?.label || 'empleado'}
                            </h3>
                            <button onClick={handleCloseRegisterModal} style={{ color: 'var(--ash)' }}
                                aria-label="Cerrar modal de registro">
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleRegisterEmployee} className="p-5 overflow-y-auto flex-1">
                            <EmpleadoForm data={newEmployeeData} onChange={handleNewChange} bancosNomina={bancosNomina} />
                            <div className="flex gap-2 pt-4">
                                <button type="button" onClick={handleCloseRegisterModal}
                                    className="flex-1 py-2 rounded-lg text-sm font-medium"
                                    style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                                    Cancelar
                                </button>
                                <button type="submit" disabled={isRegistering}
                                    className="flex-1 py-2 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
                                    style={{ background: 'var(--pb)' }}>
                                    {isRegistering ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}
                                    {isRegistering ? 'Registrando...' : 'Registrar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
};

export default Nomina;
