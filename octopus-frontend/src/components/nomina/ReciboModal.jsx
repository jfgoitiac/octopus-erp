import React, { useState, useMemo } from 'react';
import DatePicker, { registerLocale } from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Download, X, Receipt, DollarSign } from 'lucide-react';
import { toast } from 'react-toastify';

import {
    SSO_TOPE, SSO_PCT, SPF_PCT, FAOV_PCT,
    calcAVEC, calcSueldoBase, EMPTY_RECIBO,
} from '../../constants/avec';
import { fmtBs, generarReciboAVECPDF, generarReciboSimplePDF } from '../../utils/nominaPDF';
import { useEscape } from '../../hooks/useEscape';

registerLocale('es', es);

// ── Estilos de inputs (nivel de módulo para evitar re-creación en cada render) ─
const inputCls   = 'w-full px-3 py-2 rounded-lg text-sm outline-none';
const inputStyle = { border: '0.5px solid var(--border-md)', background: 'var(--porcelain)', color: 'var(--jet)' };
const labelCls   = 'block text-[11px] uppercase tracking-widest mb-1.5';
const labelStyle = { color: 'var(--ash)' };

// ── Input estilizado para el DatePicker ────────────────────────────────────────
const MonthInput = React.forwardRef(({ value, onClick }, ref) => (
    <input
        ref={ref}
        value={value}
        onClick={onClick}
        readOnly
        autoFocus
        className={`${inputCls} cursor-pointer`}
        style={inputStyle}
    />
));
MonthInput.displayName = 'MonthInput';

// ── Banner sueldo base — solo docentes ─────────────────────────────────────────
// Recibe sueldoBase de reciboCalc (fuente única de verdad — no recalcula)
function DocenteBanner({ emp, config, sueldoBase }) {
    const cat    = emp.categoria_docente;
    const hSem   = parseFloat(emp.horas_semanales) || 0;
    const catCfg = config.categorias?.[cat] || {};
    const ok     = sueldoBase > 0;

    const hasSueldoMensual = parseFloat(catCfg.sueldo_mensual) > 0;
    const hasCostoHora     = parseFloat(catCfg.costo_hora) > 0;

    let warn = '⚠ El docente no tiene H/Sem registradas — edita su ficha';
    if (!cat)                                 warn = '⚠ El docente no tiene categoría — edita su ficha';
    else if (!hasSueldoMensual && !hasCostoHora) warn = `⚠ Configura el Costo/Hora para ${cat} en "Cesta Ticket"`;

    const formula = hasSueldoMensual
        ? `${fmtBs(parseFloat(catCfg.sueldo_mensual))} Bs/mes ÷ ${config.horas_sem_referencia || 44} h/ref × ${hSem} h/sem`
        : `${fmtBs(parseFloat(catCfg.costo_hora))} Bs/h × ${hSem} h/sem`;

    return (
        <div className="rounded-xl p-3 flex items-center justify-between gap-3"
            style={{ background: ok ? 'var(--pb-light)' : '#fef9c3', border: `0.5px solid ${ok ? 'var(--border-md)' : '#fde047'}` }}>
            <div className="text-xs space-y-0.5">
                <p className="font-medium" style={{ color: ok ? 'var(--pb-mid)' : '#92400e' }}>
                    Sueldo Base · Cat. {cat || '—'} · {hSem} H/Sem
                </p>
                <p style={{ color: 'var(--ash)' }}>
                    {ok ? formula : warn}
                </p>
            </div>
            <span className="font-mono font-bold text-base flex-shrink-0"
                style={{ color: ok ? 'var(--pb)' : '#b45309' }}>
                {ok ? `${fmtBs(sueldoBase)} Bs` : '—'}
            </span>
        </div>
    );
}

// ── Modal principal ────────────────────────────────────────────────────────────
export function ReciboModal({ emp, cestaConfig, onClose }) {
    const tipo      = emp.tipo_personal || 'docente';
    const esDocente = tipo === 'docente';

    const [selectedMonth, setSelectedMonth] = useState(new Date());
    const [reciboData,    setReciboData]    = useState(() => ({
        ...EMPTY_RECIBO,
        mes:                format(new Date(), 'MMMM yyyy', { locale: es }).toLocaleUpperCase('es'),
        cesta_monto_usd:    cestaConfig[tipo]?.monto_usd || '',
        cesta_tasa:         cestaConfig.tasa_bcv          || '',
        sueldo_base_simple: emp.sueldo_base != null ? String(emp.sueldo_base) : '',
    }));

    useEscape(true, onClose);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setReciboData(prev => ({ ...prev, [name]: value }));
    };

    const handleMonthChange = (date) => {
        setSelectedMonth(date);
        setReciboData(prev => ({
            ...prev,
            mes: format(date, 'MMMM yyyy', { locale: es }).toLocaleUpperCase('es'),
        }));
    };

    // ── Cálculo reactivo ───────────────────────────────────────────────────────
    const reciboCalc = useMemo(() => {
        if (!reciboData || !emp) return null;

        // Cesta ticket — común a todos los tipos
        const tarifaHora   = parseFloat(cestaConfig.tarifa_hora)      || 0.20;
        const horasPorDia  = parseFloat(cestaConfig.horas_por_dia)    || 6.67;
        const costoDiario  = tarifaHora * horasPorDia;
        const hsInasist    = parseFloat(reciboData.horas_inasistencia) || 0;
        const descuento    = hsInasist * tarifaHora;
        const cestaUsd     = parseFloat(reciboData.cesta_monto_usd)    || 0;
        const cestaTasa    = parseFloat(reciboData.cesta_tasa)         || 0;
        const totalBs      = cestaUsd * cestaTasa;
        const totalRecibir = Math.max(totalBs - descuento, 0);
        const cesta = { tarifaHora, costoDiario, totalBs, hsInasistencia: hsInasist, descuento, totalRecibir };

        if (esDocente) {
            const sueldoBase = calcSueldoBase(cestaConfig, emp.categoria_docente, emp.horas_semanales);
            const avec = calcAVEC(sueldoBase, emp.categoria_docente, emp.anos_servicio,
                emp.numero_hijos, emp.titulo);
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
    }, [reciboData, emp, cestaConfig, esDocente]);

    // ── Generar PDF ────────────────────────────────────────────────────────────
    const handleGenerar = () => {
        if (!reciboData.mes) { toast.warning('Selecciona el período.'); return; }
        if (!reciboCalc)     { toast.error('Error en el cálculo.');    return; }

        if (reciboCalc.esDocente) {
            if (!emp.categoria_docente) {
                toast.warning('El docente no tiene categoría. Edita su ficha primero.'); return;
            }
            const catCfg           = cestaConfig.categorias?.[emp.categoria_docente] || {};
            const hasCostoHora     = parseFloat(catCfg.costo_hora) > 0;
            const hasSueldoMensual = parseFloat(catCfg.sueldo_mensual) > 0;
            if (!hasCostoHora && !hasSueldoMensual) {
                toast.warning(`Configura el Costo/Hora para ${emp.categoria_docente} en "Cesta Ticket".`); return;
            }
            if (!emp.horas_semanales) {
                toast.warning(`${emp.nombre} no tiene H/Sem registradas. Edita su ficha primero.`); return;
            }
            if (reciboCalc.sueldoBase <= 0) {
                toast.error('Sueldo base resultó en 0. Verifica el costo/hora y las H/Sem.'); return;
            }
            generarReciboAVECPDF(emp, { ...reciboData, sueldo_base: String(reciboCalc.sueldoBase) },
                reciboCalc, reciboCalc.cesta);
        } else {
            if (!reciboData.sueldo_base_simple || parseFloat(reciboData.sueldo_base_simple) <= 0) {
                toast.warning('Ingresa el sueldo / salario bruto mensual.'); return;
            }
            generarReciboSimplePDF(emp, {
                ...reciboData,
                sueldo_base:       reciboData.sueldo_base_simple,
                otras_deducciones: reciboData.otras_deducciones,
            });
        }

        toast.success('Recibo generado correctamente.');
        onClose();
    };

    return (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
            style={{ background: 'rgba(43,48,58,0.65)' }}
            role="dialog" aria-modal="true" aria-labelledby="recibo-modal-title">

            <div className="w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl flex flex-col"
                style={{ background: 'var(--porcelain)', maxHeight: '92vh' }}>

                {/* ── Header ───────────────────────────────────────────────── */}
                <div className="flex justify-between items-center px-6 py-4 flex-shrink-0"
                    style={{ borderBottom: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                    <div>
                        <div className="flex items-center gap-2">
                            <Receipt size={16} style={{ color: 'var(--pb)' }} />
                            <h3 id="recibo-modal-title" className="text-sm font-medium" style={{ color: 'var(--jet)' }}>
                                Generar Recibo — {emp.apellido} {emp.nombre}
                            </h3>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>
                            {emp.cedula} · {emp.cargo}
                        </p>
                    </div>
                    <button onClick={onClose} style={{ color: 'var(--ash)' }} aria-label="Cerrar modal de recibo">
                        <X size={18} />
                    </button>
                </div>

                {/* ── Body ─────────────────────────────────────────────────── */}
                <div className="overflow-y-auto flex-1 p-6 space-y-4">

                    {/* Período — selector de mes/año */}
                    <div>
                        <label className={labelCls} style={labelStyle}>
                            Período <span style={{ color: 'var(--red)' }}>*</span>
                        </label>
                        <DatePicker
                            selected={selectedMonth}
                            onChange={handleMonthChange}
                            dateFormat="MMMM yyyy"
                            showMonthYearPicker
                            locale="es"
                            customInput={<MonthInput />}
                        />
                        <p className="text-[11px] mt-1" style={{ color: 'var(--ash)' }}>
                            Período: <span className="font-mono">{reciboData.mes}</span>
                        </p>
                    </div>

                    {/* Banner sueldo base — solo docentes */}
                    {esDocente && (
                        <DocenteBanner
                            emp={emp}
                            config={cestaConfig}
                            sueldoBase={reciboCalc?.sueldoBase ?? 0}
                        />
                    )}

                    {/* Sueldo bruto manual — solo Admin/Apoyo */}
                    {!esDocente && (
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
                                        onChange={handleChange} type="number" step="0.01" min="0"
                                        placeholder="0.00" className={inputCls} style={inputStyle} />
                                </div>
                                <div>
                                    <label className={labelCls} style={labelStyle}>Otras Deducciones (Bs)</label>
                                    <input name="otras_deducciones" value={reciboData.otras_deducciones}
                                        onChange={handleChange} type="number" step="0.01" min="0"
                                        placeholder="0.00" className={inputCls} style={inputStyle} />
                                </div>
                            </div>

                            {reciboCalc && reciboCalc.sueldoBase > 0 && (
                                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs pt-1"
                                    style={{ borderTop: '0.5px solid var(--border-md)' }}>
                                    {[
                                        [`SSO (4%, tope ${SSO_TOPE} Bs)`, reciboCalc.sso],
                                        ['SPF (0,5%)',                     reciboCalc.spf],
                                        ['FAOV (1%)',                      reciboCalc.faov],
                                        ...(reciboCalc.otrasDed > 0 ? [['Otras ded.', reciboCalc.otrasDed]] : []),
                                        ['Total Ded.',                     reciboCalc.totalRet],
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
                            onChange={handleChange} type="number" step="0.5" min="0" placeholder="0"
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
                                        onChange={handleChange} type="number" step="0.01" min="0"
                                        placeholder="0.00" className={inputCls} style={inputStyle} />
                                </div>
                            </div>
                            <div>
                                <label className={labelCls} style={labelStyle}>Tasa BCV (Bs/USD)</label>
                                <input name="cesta_tasa" value={reciboData.cesta_tasa}
                                    onChange={handleChange} type="number" step="0.01" min="0"
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
                    {reciboCalc?.esDocente && reciboCalc.sueldoBase > 0 && (
                        <div className="rounded-xl overflow-hidden" style={{ border: '0.5px solid var(--border-md)' }}>
                            <div className="px-4 py-2 flex items-center gap-2"
                                style={{ background: 'var(--pb-light)', borderBottom: '0.5px solid var(--border-md)' }}>
                                <Receipt size={13} style={{ color: 'var(--pb)' }} />
                                <span className="text-[11px] uppercase tracking-widest font-medium" style={{ color: 'var(--pb-mid)' }}>
                                    Desglose calculado automáticamente
                                </span>
                                <span className="text-[10px] ml-auto" style={{ color: 'var(--ash)' }}>
                                    {cestaConfig.categorias?.[emp.categoria_docente]?.costo_hora || '?'} Bs/h
                                    · {emp.categoria_docente || '—'}
                                    · {emp.horas_semanales} h/sem
                                    · {emp.anos_servicio || 0} años
                                    · {emp.numero_hijos || 0} hijo(s)
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
                                        ['SPF (0,5%)',                     reciboCalc.spf],
                                        ['FAOV (1%)',                      reciboCalc.faov],
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

                {/* ── Footer ───────────────────────────────────────────────── */}
                <div className="px-6 py-4 flex justify-end gap-2 flex-shrink-0"
                    style={{ borderTop: '0.5px solid var(--border)', background: 'var(--porcelain)' }}>
                    <button onClick={onClose}
                        className="px-4 py-2 rounded-lg text-sm font-medium"
                        style={{ border: '0.5px solid var(--border-md)', color: 'var(--ash)' }}>
                        Cancelar
                    </button>
                    <button onClick={handleGenerar}
                        className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white"
                        style={{ background: 'var(--pb)' }}>
                        <Download size={15} /> Descargar Recibo PDF
                    </button>
                </div>
            </div>
        </div>
    );
}
